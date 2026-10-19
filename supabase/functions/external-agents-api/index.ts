// Operator-only management for external agents (Grok PPM, Alfred, Muse, Claude) and the
// shared Agents Team chat. Secrets are write-only: never returned, only "set"/"not set".
import { admin, corsHeaders, json, requireOperator } from '../_shared/aiSetter/http.ts';
import { canEnable, connectionState, decide, validateEndpoint } from '../_shared/externalAgents/core.ts';
import { callbackUrl, signedPost, teamChannelId } from '../_shared/externalAgents/dispatch.ts';

const UUID = /^[0-9a-f-]{36}$/i;
const maskUrl = (u: string | null) => { try { const x = new URL(u!); return `${x.origin}${x.pathname}`; } catch { return null; } };

async function loadAgent(sb: any, id: unknown) {
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  const { data } = await sb.from('external_agents').select('*').eq('id', id).maybeSingle();
  return data;
}
async function hasSecret(sb: any, id: string) {
  const { data } = await sb.from('external_agent_credentials').select('signing_secret,outbound_token').eq('agent_id', id).maybeSingle();
  return { signing: !!data?.signing_secret, token: !!data?.outbound_token };
}
const kick = () => fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/external-agent-worker`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' }, body: '{}',
}).catch(() => null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = admin();
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const gate = await requireOperator(req, sb, body);
  if ('error' in gate) return gate.error;
  const actor = gate.auth.memberName || gate.auth.memberId || gate.auth.via;

  try {
    switch (body.action) {
      case 'list': {
        const { data: agents } = await sb.from('external_agents').select('*').order('display_name');
        const { data: members } = await sb.from('agency_members').select('id,name,email,role').order('name');
        const out = [];
        for (const a of agents ?? []) {
          const s = await hasSecret(sb, a.id);
          const { data: recent } = await sb.from('agent_assignment_outbox')
            .select('id,kind,status,task_id,attempts,last_error,external_run_id,created_at,updated_at').eq('agent_id', a.id)
            .order('created_at', { ascending: false }).limit(10);
          out.push({
            id: a.id, slug: a.slug, display_name: a.display_name, provider_label: a.provider_label, member_id: a.member_id,
            transport: a.transport, endpoint: maskUrl(a.endpoint_url), supports_idempotency: a.supports_idempotency,
            oauth_linked: !!a.oauth_user_id, enabled: a.enabled, last_test_at: a.last_test_at, last_test_ok: a.last_test_ok,
            last_test_detail: a.last_test_detail, signing_secret_set: s.signing, outbound_token_set: s.token,
            state: connectionState(a, s.signing), recent: recent ?? [],
          });
        }
        return json({ agents: out, members: members ?? [], callback_url: callbackUrl() });
      }
      case 'link_member': {
        const a = await loadAgent(sb, body.agent_id);
        if (!a) return json({ error: 'agent_not_found' }, 404);
        const memberId = body.member_id === null ? null : String(body.member_id || '');
        if (memberId && !UUID.test(memberId)) return json({ error: 'invalid_member' }, 400);
        if (memberId) {
          const { data: m } = await sb.from('agency_members').select('id').eq('id', memberId).maybeSingle();
          if (!m) return json({ error: 'member_not_found' }, 404);
          const { data: taken } = await sb.from('external_agents').select('display_name').eq('member_id', memberId).neq('id', a.id).maybeSingle();
          if (taken) return json({ error: `Member already linked to ${taken.display_name}` }, 409);
        }
        // Changing identity forces a fresh test and disables delivery.
        await sb.from('external_agents').update({ member_id: memberId, enabled: false, last_test_ok: null, updated_at: new Date().toISOString() }).eq('id', a.id);
        console.log(`[external-agents] ${actor} linked ${a.slug} -> ${memberId ?? 'none'}`);
        return json({ ok: true });
      }
      case 'configure': {
        const a = await loadAgent(sb, body.agent_id);
        if (!a) return json({ error: 'agent_not_found' }, 404);
        const transport = body.transport;
        if (!['none', 'push_webhook', 'pull_mcp'].includes(transport)) return json({ error: 'invalid_transport' }, 400);
        const patch: Record<string, unknown> = { transport, supports_idempotency: !!body.supports_idempotency, enabled: false, last_test_ok: null, updated_at: new Date().toISOString() };
        if (transport === 'push_webhook') {
          if (typeof body.endpoint_url === 'string' && body.endpoint_url.trim()) {
            const err = validateEndpoint(body.endpoint_url.trim());
            if (err) return json({ error: err }, 400);
            patch.endpoint_url = body.endpoint_url.trim();
          }
        }
        if (transport === 'pull_mcp' && typeof body.oauth_user_email === 'string' && body.oauth_user_email.trim()) {
          const email = body.oauth_user_email.trim().toLowerCase();
          let found: string | null = null;
          for (let page = 1; page <= 10 && !found; page++) {
            const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
            found = data?.users?.find((u: any) => (u.email || '').toLowerCase() === email)?.id ?? null;
            if (!data?.users?.length || data.users.length < 200) break;
          }
          if (!found) return json({ error: 'No app sign-in account with that email' }, 404);
          patch.oauth_user_id = found;
        }
        const { error } = await sb.from('external_agents').update(patch).eq('id', a.id);
        if (error) return json({ error: error.message.includes('oauth_user_id') ? 'That sign-in is linked to another agent' : error.message }, 400);
        return json({ ok: true });
      }
      case 'set_secret': {
        const a = await loadAgent(sb, body.agent_id);
        if (!a) return json({ error: 'agent_not_found' }, 404);
        const field = body.field;
        if (!['signing_secret', 'outbound_token'].includes(field)) return json({ error: 'invalid_field' }, 400);
        const value = typeof body.value === 'string' ? body.value.trim() : '';
        if (field === 'signing_secret' && value.length < 32) return json({ error: 'Signing secret must be at least 32 characters' }, 400);
        if (value.length > 4096) return json({ error: 'Too long' }, 400);
        await sb.from('external_agent_credentials').upsert({ agent_id: a.id, [field]: value || null, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });
        await sb.from('external_agents').update({ enabled: false, last_test_ok: null }).eq('id', a.id);
        return json({ ok: true });
      }
      case 'test': {
        const a = await loadAgent(sb, body.agent_id);
        if (!a) return json({ error: 'agent_not_found' }, 404);
        let ok = false, detail = '';
        if (a.transport === 'pull_mcp') {
          ok = !!a.oauth_user_id;
          detail = ok ? 'Pull only: agent sign-in linked. It sees work only when its own worker polls list_my_assignments — nothing wakes it.' : 'No agent sign-in linked';
        } else if (a.transport === 'push_webhook') {
          const { data: cred } = await sb.from('external_agent_credentials').select('signing_secret,outbound_token').eq('agent_id', a.id).maybeSingle();
          if (!a.endpoint_url || !cred?.signing_secret) detail = 'Endpoint and signing secret are required';
          else {
            const outcome = await signedPost(a.endpoint_url, cred.signing_secret, cred.outbound_token, `ping:${a.id}:${Date.now()}`,
              { type: 'ping', callback_url: callbackUrl() });
            if (outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300 && outcome.body?.ok === true) { ok = true; detail = 'Endpoint acknowledged signed ping'; }
            else if (outcome.kind === 'response') detail = `Endpoint replied HTTP ${outcome.status}${outcome.body?.ok === true ? '' : ' without {"ok":true}'}`;
            else detail = decide(outcome, 1, false).status === 'needs_review' ? (outcome.kind === 'timeout' ? 'Timed out' : 'Could not reach endpoint') : 'Failed';
          }
        } else detail = 'No connection method chosen';
        await sb.from('external_agents').update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_detail: detail.slice(0, 300), ...(ok ? {} : { enabled: false }) }).eq('id', a.id);
        return json({ ok, detail });
      }
      case 'set_enabled': {
        const a = await loadAgent(sb, body.agent_id);
        if (!a) return json({ error: 'agent_not_found' }, 404);
        const want = !!body.enabled;
        if (want) {
          const s = await hasSecret(sb, a.id);
          const st = connectionState(a, s.signing);
          if (!canEnable(st)) return json({ error: `Not connected (${st.replace(/_/g, ' ')}) — run a successful test first` }, 409);
        }
        await sb.from('external_agents').update({ enabled: want, updated_at: new Date().toISOString() }).eq('id', a.id);
        console.log(`[external-agents] ${actor} set ${a.slug} enabled=${want}`);
        return json({ ok: true, note: want ? 'Only tasks assigned from now on are delivered; existing assignments are not sent.' : undefined });
      }
      case 'retry_review': {
        // Explicit operator decision to resend an ambiguous delivery.
        if (typeof body.delivery_id !== 'string' || !UUID.test(body.delivery_id)) return json({ error: 'invalid_delivery' }, 400);
        const { data } = await sb.from('agent_assignment_outbox').update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: `Resend approved by ${actor}` })
          .eq('id', body.delivery_id).in('status', ['needs_review', 'failed']).select('id');
        if (!data?.length) return json({ error: 'not_resendable' }, 409);
        kick();
        return json({ ok: true });
      }
      case 'messages': {
        const ch = await teamChannelId(sb);
        const { data } = await sb.from('agent_messages').select('id,role,kind,body,task_id,sender_name,from_external_agent_id,user_id,hop,payload,created_at')
          .eq('channel_id', ch).order('created_at', { ascending: false }).limit(200);
        return json({ channel_id: ch, messages: (data ?? []).reverse() });
      }
      case 'post': {
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        if (!text || text.length > 4000) return json({ error: 'Message must be 1–4000 characters' }, 400);
        const taskId = typeof body.task_id === 'string' && UUID.test(body.task_id) ? body.task_id : null;
        const ch = await teamChannelId(sb);
        const { error } = await sb.from('agent_messages').insert({ channel_id: ch, role: 'human', kind: body.kind === 'handoff' ? 'handoff' : 'message', body: text, task_id: taskId, sender_name: String(actor).slice(0, 80), hop: 0 });
        if (error) return json({ error: error.message }, 400);
        kick();
        return json({ ok: true });
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('[external-agents-api]', (e as Error).message);
    return json({ error: 'internal_error' }, 500);
  }
});
