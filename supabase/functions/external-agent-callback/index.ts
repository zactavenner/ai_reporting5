// Authenticated callback for external agents. Per-agent HMAC over `${ts}.${nonce}.${body}`,
// 5-minute window, single-use nonce, and the delivery must belong to the agent and its
// task must still be assigned to the agent's linked member.
import { admin, corsHeaders, json } from '../_shared/aiSetter/http.ts';
import { LOCAL_LEASE_SECONDS, sessionScope, verifyCallback } from '../_shared/externalAgents/core.ts';
import { buildPayload, teamChannelId } from '../_shared/externalAgents/dispatch.ts';

const EVENTS: Record<string, string> = { accepted: 'accepted', progress: 'in_progress', completed: 'completed', failed: 'failed', message: '' };
const ACTIVE = ['pending', 'claimed', 'sending', 'accepted', 'in_progress', 'waiting_pull', 'failed_retryable', 'needs_review'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const sb = admin();
  const raw = await req.text();
  if (raw.length > 32_000) return json({ error: 'too_large' }, 413);
  const slug = req.headers.get('x-agent-id') || '';
  if (!/^[a-z0-9_]{2,32}$/.test(slug)) return json({ error: 'unauthorized' }, 401);
  const { data: agent } = await sb.from('external_agents').select('*').eq('slug', slug).maybeSingle();
  const { data: cred } = agent ? await sb.from('external_agent_credentials').select('signing_secret').eq('agent_id', agent.id).maybeSingle() : { data: null };
  if (!agent || !cred?.signing_secret) return json({ error: 'unauthorized' }, 401);

  const v = await verifyCallback(cred.signing_secret, {
    ts: req.headers.get('x-agent-timestamp'), nonce: req.headers.get('x-agent-nonce'), sig: req.headers.get('x-agent-signature'),
  }, raw, Math.floor(Date.now() / 1000));
  if (!v.ok) return json({ error: 'unauthorized', reason: v.reason }, 401);
  const { error: nonceErr } = await sb.from('external_agent_callback_nonces').insert({ agent_id: agent.id, nonce: req.headers.get('x-agent-nonce') });
  if (nonceErr) return json({ error: 'replayed' }, 409);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  const event = String(body.event || '');

  // ---- Local Mac worker: outbound polling, end-to-end test, session linkage ----
  if (event === 'poll' || event === 'ping_ack' || event === 'session') {
    if (agent.transport !== 'local_worker') return json({ error: 'wrong_transport' }, 409);
    const info = body.worker && typeof body.worker === 'object'
      ? { host: String(body.worker.host ?? '').slice(0, 60), runtime: String(body.worker.runtime ?? '').slice(0, 40), version: String(body.worker.version ?? '').slice(0, 40), cli_authenticated: body.worker.cli_authenticated === true }
      : agent.worker_info;
    await sb.from('external_agents').update({ worker_last_seen_at: new Date().toISOString(), worker_info: info }).eq('id', agent.id);

    if (event === 'ping_ack') {
      const ok = !!agent.test_nonce && body.test_nonce === agent.test_nonce && info?.cli_authenticated === true;
      await sb.from('external_agents').update({
        last_test_at: new Date().toISOString(), last_test_ok: ok, test_nonce: null, test_requested_at: null,
        last_test_detail: ok ? `Mac worker answered end-to-end test (${info?.runtime} ${info?.version})` : (info?.cli_authenticated === true ? 'Test code did not match' : 'Worker reachable but CLI not signed in'),
        ...(ok ? {} : { enabled: false }),
      }).eq('id', agent.id);
      return json({ ok });
    }
    if (event === 'session') {
      const scope = String(body.scope_key || '');
      const sid = typeof body.external_session_id === 'string' ? body.external_session_id.trim() : '';
      if (!/^(task:[0-9a-f-]{36}|team)$/.test(scope) || !sid || sid.length > 200) return json({ error: 'invalid_session' }, 400);
      if (scope.startsWith('task:')) {
        const { data: own } = await sb.from('agent_assignment_outbox').select('id').eq('agent_id', agent.id).eq('task_id', scope.slice(5)).limit(1);
        if (!own?.length) return json({ error: 'task_not_assigned_to_agent' }, 403);
      }
      await sb.from('external_agent_sessions').upsert({ agent_id: agent.id, scope_key: scope, runtime: agent.runtime, external_session_id: sid, updated_at: new Date().toISOString() }, { onConflict: 'agent_id,scope_key' });
      return json({ ok: true });
    }
    // poll
    const test = agent.test_nonce ? { test_nonce: agent.test_nonce } : null;
    if (!agent.enabled) return json({ ok: true, test, work: [] });
    const { data: rows, error } = await sb.rpc('claim_local_agent_work', { p_agent_id: agent.id, p_owner: `mac:${agent.slug}`, p_limit: Number(body.max) || 1, p_lease_seconds: LOCAL_LEASE_SECONDS });
    if (error) return json({ error: 'claim_failed' }, 500);
    const work = [];
    for (const row of rows ?? []) {
      const scope = sessionScope(row);
      const { data: s } = await sb.from('external_agent_sessions').select('external_session_id').eq('agent_id', agent.id).eq('scope_key', scope).maybeSingle();
      work.push({ ...(await buildPayload(sb, row)), scope_key: scope, resume_session_id: s?.external_session_id ?? null, lease_seconds: LOCAL_LEASE_SECONDS });
    }
    return json({ ok: true, test, work });
  }

  if (!agent.enabled) return json({ error: 'unauthorized' }, 401);
  if (!(event in EVENTS)) return json({ error: 'invalid_event' }, 400);
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 4000) : '';
  const resultUrl = typeof body.result_url === 'string' && /^https:\/\//.test(body.result_url) ? body.result_url.slice(0, 1000) : null;

  const ch = await teamChannelId(sb);
  if (event === 'message') {
    if (!summary.trim()) return json({ error: 'empty_message' }, 400);
    let hop = 1;
    if (typeof body.reply_to === 'string') {
      const { data: p } = await sb.from('agent_messages').select('hop').eq('id', body.reply_to).eq('channel_id', ch).maybeSingle();
      if (p) hop = (p.hop ?? 0) + 1;
    }
    await sb.from('agent_messages').insert({ channel_id: ch, role: 'agent', kind: 'message', body: summary, from_external_agent_id: agent.id, sender_name: agent.display_name, hop, reply_to: body.reply_to ?? null });
    return json({ ok: true });
  }

  if (typeof body.delivery_id !== 'string') return json({ error: 'delivery_id_required' }, 400);
  const { data: row } = await sb.from('agent_assignment_outbox').select('*').eq('id', body.delivery_id).eq('agent_id', agent.id).maybeSingle();
  if (!row) return json({ error: 'not_found' }, 404); // also covers another agent's delivery
  if (row.status === 'cancelled') return json({ error: 'cancelled' }, 409);
  if (row.kind === 'assignment') {
    const { data: still } = await sb.from('task_assignees').select('id').eq('task_id', row.task_id).eq('member_id', agent.member_id).limit(1);
    if (!still?.length) return json({ error: 'task_not_assigned_to_agent' }, 403);
  }
  if (!ACTIVE.includes(row.status)) return json({ ok: true, status: row.status, note: 'already_final' });

  // A local worker may only confirm start on a delivery it currently holds.
  if (agent.transport === 'local_worker' && event === 'accepted' && row.status !== 'claimed') return json({ error: 'not_claimed' }, 409);
  const next = EVENTS[event];
  const now = new Date().toISOString();
  await sb.from('agent_assignment_outbox').update({
    status: next, updated_at: now, lease_owner: null,
    ...(event === 'accepted' ? { accepted_at: now, external_run_id: typeof body.run_id === 'string' ? body.run_id.slice(0, 200) : row.external_run_id } : {}),
    ...(event === 'completed' || event === 'failed' ? { completed_at: now } : {}),
  }).eq('id', row.id).in('status', ACTIVE);

  await sb.from('agent_messages').insert({
    channel_id: ch, role: 'agent', kind: event === 'completed' ? 'result' : 'status', body: summary || `${agent.display_name}: ${event}`,
    task_id: row.task_id, from_external_agent_id: agent.id, sender_name: agent.display_name,
    payload: { event, delivery_id: row.id, result_url: resultUrl }, routed_at: now,
  });
  if (row.task_id && (summary || resultUrl)) {
    await sb.from('task_comments').insert({ task_id: row.task_id, author_name: agent.display_name, content: [summary, resultUrl].filter(Boolean).join('\n'), comment_type: 'agent_update' });
  }
  return json({ ok: true, status: next });
});
