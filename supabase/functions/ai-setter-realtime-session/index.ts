// AI Outbound Setter — browser test calls (gpt-realtime-2.1 over WebRTC).
// The server performs the SDP exchange so the standard OpenAI key never reaches
// the browser. Tool calls from the data channel are executed here, server-side.
import { admin, corsHeaders, json, requireClient, requireOperator } from '../_shared/aiSetter/http.ts';
import { frontendPrompt, readinessFromEnv, realtimeSessionConfig } from '../_shared/aiSetter/core.ts';
import { executeTool, logEvent, upsertCallRecord } from '../_shared/aiSetter/store.ts';

const OPENAI = 'https://api.openai.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const sb = admin();
  const op = await requireOperator(req, sb, body);
  if (op.error) return op.error;
  const client = await requireClient(sb, body.client_id);
  if (!client) return json({ error: 'client_not_found' }, 404);
  const env = readinessFromEnv((k) => Deno.env.get(k));

  const loadSession = async () => {
    const { data } = await sb.from('ai_setter_sessions').select('*')
      .eq('id', body.session_id).eq('client_id', client.id).eq('transport', 'browser').maybeSingle();
    return data;
  };

  switch (body.action) {
    case 'start': {
      if (env.openai !== 'ready') return json({ error: 'openai_not_ready', readiness: env.openai }, 412);
      if (typeof body.sdp !== 'string' || !body.sdp.trim() || body.sdp.length > 200_000) return json({ error: 'sdp_required' }, 400);
      const { data: lead } = await sb.from('ai_setter_queue').select('*').eq('id', body.queue_id).eq('client_id', client.id).maybeSingle();
      if (!lead) return json({ error: 'lead_not_found' }, 404);
      if (lead.dnc) return json({ error: 'dnc' }, 409);
      const [{ data: settings }, { data: campaign }] = await Promise.all([
        sb.from('ai_setter_settings').select('*').eq('client_id', client.id).maybeSingle(),
        sb.from('ai_setter_campaigns').select('*').eq('id', lead.campaign_id).eq('client_id', client.id).maybeSingle(),
      ]);
      const serviceType = (campaign?.service_type || 'candidate') as 'candidate' | 'investor';
      const tz = lead.timezone || settings?.timezone || 'America/New_York';
      const instructions = frontendPrompt({
        businessName: settings?.business_name || client.name, serviceType,
        script: serviceType === 'investor' ? settings?.investor_script : settings?.candidate_script,
        questions: Array.isArray(settings?.approved_questions) ? settings.approved_questions : [],
        contactName: lead.contact_name, timezone: tz,
      });
      const { data: session, error } = await sb.from('ai_setter_sessions').insert({
        client_id: client.id, queue_id: lead.id, campaign_id: lead.campaign_id, transport: 'browser',
        model: env.realtime_model, status: 'initializing', is_demo: lead.is_demo,
        preferences: { contact_name: lead.contact_name, service_type: serviceType, timezone: tz },
        started_by: op.auth!.memberName || op.auth!.via,
      }).select('*').single();
      if (error) return json({ error: 'session_create_failed' }, 500);

      const form = new FormData();
      form.set('sdp', body.sdp);
      form.set('session', JSON.stringify(realtimeSessionConfig({ model: env.realtime_model, instructions, voice: settings?.voice || 'marin' })));
      let res: Response;
      try {
        res = await fetch(`${OPENAI}/realtime/calls`, {
          method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` }, body: form,
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        await sb.from('ai_setter_sessions').update({ status: 'failed', failure_code: 'openai_timeout', ended_at: new Date().toISOString(), finalization: 'incomplete' }).eq('id', session.id);
        return json({ error: 'openai_timeout' }, 504);
      }
      if (!res.ok) {
        const code = await res.json().then((j) => j?.error?.code || j?.error?.type).catch(() => null);
        await sb.from('ai_setter_sessions').update({ status: 'failed', failure_code: code || `http_${res.status}`, ended_at: new Date().toISOString(), finalization: 'complete' }).eq('id', session.id);
        await logEvent(sb, session, 'session.failed', { status: res.status, code });
        return json({ error: 'openai_rejected', status: res.status, code }, 502);
      }
      const answer = await res.text();
      const callId = (res.headers.get('location') || '').split('/').pop() || null;
      await sb.from('ai_setter_sessions').update({ status: 'active', openai_session_id: callId }).eq('id', session.id);
      await logEvent(sb, session, 'session.started', { transport: 'browser', model: env.realtime_model });
      return json({ session_id: session.id, openai_session_id: callId, sdp: answer, task_revision: session.task_revision });
    }
    case 'tool': {
      const s = await loadSession();
      if (!s) return json({ error: 'session_not_found' }, 404);
      if (typeof body.tool_call_id !== 'string' || typeof body.name !== 'string') return json({ error: 'invalid_tool_call' }, 400);
      let args: any = {};
      try { args = typeof body.arguments === 'string' ? JSON.parse(body.arguments || '{}') : (body.arguments || {}); } catch { return json({ error: 'invalid_arguments' }, 400); }
      const result = await executeTool(sb, {
        sessionId: s.id, clientId: client.id, callRef: s.openai_session_id || 'browser',
        toolCallId: body.tool_call_id, name: body.name, args,
      });
      const { data: fresh } = await sb.from('ai_setter_sessions').select('task_revision').eq('id', s.id).single();
      return json({ result, task_revision: fresh?.task_revision });
    }
    case 'event': {
      const s = await loadSession();
      if (!s) return json({ error: 'session_not_found' }, 404);
      const allowed = ['transcript.agent', 'transcript.user', 'client.mic', 'client.connection', 'client.error'];
      if (!allowed.includes(body.event_type)) return json({ error: 'event_not_allowed' }, 400);
      const text = typeof body.payload?.text === 'string' ? body.payload.text.slice(0, 4000) : undefined;
      await logEvent(sb, s, body.event_type, text !== undefined ? { text } : { state: String(body.payload?.state || '').slice(0, 64) });
      return json({ ok: true });
    }
    case 'end': {
      const s = await loadSession();
      if (!s) return json({ error: 'session_not_found' }, 404);
      if (s.openai_session_id && s.status !== 'closed') {
        await fetch(`${OPENAI}/realtime/calls/${encodeURIComponent(s.openai_session_id)}/hangup`, {
          method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` }, signal: AbortSignal.timeout(8000),
        }).catch(() => null);
      }
      await sb.from('ai_setter_sessions').update({ status: 'closed', ended_at: new Date().toISOString(), finalization: body.reason === 'dropped' ? 'incomplete' : 'complete' }).eq('id', s.id);
      await sb.from('ai_setter_holds').update({ status: 'released' }).eq('session_id', s.id).eq('status', 'active');
      await logEvent(sb, s, 'session.closed', { reason: String(body.reason || 'operator').slice(0, 40) });
      await upsertCallRecord(sb, s.id);
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown_action' }, 400);
  }
});
