// AI Outbound Setter — trusted executor called by the persistent voice bridge.
// Authenticated with AI_SETTER_BRIDGE_SECRET (server-to-server only).
import { admin, corsHeaders, json, timingSafeEqual } from '../_shared/aiSetter/http.ts';
import { executeTool, logEvent, upsertCallRecord } from '../_shared/aiSetter/store.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('AI_SETTER_BRIDGE_SECRET') || '';
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !timingSafeEqual(given, secret)) return json({ error: 'unauthorized' }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const sb = admin();
  const { data: s } = await sb.from('ai_setter_sessions').select('*')
    .eq('openai_session_id', String(body.openai_session_id || '')).eq('transport', 'phone').maybeSingle();
  if (!s) return json({ error: 'session_not_found' }, 404);

  switch (body.action) {
    case 'tool': {
      let args: any = {};
      try { args = typeof body.arguments === 'string' ? JSON.parse(body.arguments || '{}') : (body.arguments || {}); } catch { return json({ error: 'invalid_arguments' }, 400); }
      const result = await executeTool(sb, {
        sessionId: s.id, clientId: s.client_id, callRef: s.openai_session_id,
        toolCallId: String(body.call_id || ''), name: String(body.name || ''), args,
      });
      return json({ result });
    }
    case 'event': {
      const type = String(body.event_type || '');
      if (type === 'session.answered' && s.status === 'ringing') await sb.from('ai_setter_sessions').update({ status: 'active' }).eq('id', s.id);
      if (type === 'transport.failed') await sb.from('ai_setter_sessions').update({ status: 'failed', failure_code: 'transport_failed' }).eq('id', s.id);
      const text = typeof body.text === 'string' ? body.text.slice(0, 4000) : undefined;
      await logEvent(sb, s, type.slice(0, 64), { event_id: body.event_id || null, ...(text !== undefined ? { text } : {}) });
      return json({ ok: true });
    }
    case 'closed': {
      const complete = body.finalization === 'complete';
      await sb.from('ai_setter_sessions').update({
        status: s.status === 'failed' ? 'failed' : 'closed', ended_at: new Date().toISOString(),
        finalization: complete ? 'complete' : 'incomplete', usage: body.usage ?? null,
      }).eq('id', s.id);
      await sb.from('ai_setter_holds').update({ status: 'released' }).eq('session_id', s.id).eq('status', 'active');
      if (s.queue_id) await sb.from('ai_setter_queue').update({ status: 'queued' }).eq('id', s.queue_id).eq('status', 'calling');
      await logEvent(sb, s, 'session.closed', { finalization: complete ? 'complete' : 'incomplete', reason: body.reason || null });
      await upsertCallRecord(sb, s.id);
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown_action' }, 400);
  }
});
