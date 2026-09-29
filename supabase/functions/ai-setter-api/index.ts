// AI Outbound Setter — operator API for settings, queue, availability, bookings, demo.
import { admin, corsHeaders, json, requireClient, requireOperator } from '../_shared/aiSetter/http.ts';
import { dialBlockers, isE164, readinessFromEnv } from '../_shared/aiSetter/core.ts';
import { resetDemo, seedDemo } from '../_shared/aiSetter/store.ts';

const SETTINGS_FIELDS = [
  'business_name', 'candidate_script', 'investor_script', 'approved_questions', 'voice', 'timezone',
  'call_window_start', 'call_window_end', 'max_attempts', 'daily_call_limit', 'caller_number', 'outbound_enabled',
];

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
  const clientId = client.id as string;
  const env = readinessFromEnv((k) => Deno.env.get(k));
  const readiness = {
    openai: env.openai, sip: env.sip, bridge: env.bridge, webhook_secret: env.webhook_secret,
    // Only a successful live create proves outbound SIP is enabled; until then it is a blocker.
    outbound_sip_enabled: null as boolean | null,
    models: { realtime: env.realtime_model, live: env.live_model, responses: env.responses_model },
  };

  switch (body.action) {
    case 'overview': {
      const [settings, campaigns, queue, slots, holds, bookings, sessions] = await Promise.all([
        sb.from('ai_setter_settings').select('*').eq('client_id', clientId).maybeSingle(),
        sb.from('ai_setter_campaigns').select('*').eq('client_id', clientId).order('created_at'),
        sb.from('ai_setter_queue').select('*').eq('client_id', clientId).order('created_at').limit(500),
        sb.from('ai_setter_slots').select('*').eq('client_id', clientId).gte('starts_at', new Date().toISOString()).order('starts_at').limit(200),
        sb.from('ai_setter_holds').select('*').eq('client_id', clientId).eq('status', 'active').gt('expires_at', new Date().toISOString()),
        sb.from('ai_setter_bookings').select('*').eq('client_id', clientId).order('starts_at', { ascending: false }).limit(200),
        sb.from('ai_setter_sessions').select('id,queue_id,transport,status,task_revision,openai_session_id,failure_code,reconciliation_required,started_at,ended_at,is_demo').eq('client_id', clientId).order('started_at', { ascending: false }).limit(50),
      ]);
      const s = settings.data;
      const active = new Set((sessions.data || []).filter((x: any) => ['initializing', 'ringing', 'active'].includes(x.status)).map((x: any) => x.queue_id));
      const booked = new Set((bookings.data || []).filter((b: any) => b.status === 'confirmed').map((b: any) => b.queue_id));
      const campById = new Map((campaigns.data || []).map((c: any) => [c.id, c]));
      const queueOut = (queue.data || []).map((l: any) => ({
        ...l,
        consent_evidence: l.consent_evidence ? { source: l.consent_evidence.source, captured_at: l.consent_evidence.captured_at } : null,
        blockers: dialBlockers({
          settings: s, campaign: campById.get(l.campaign_id) as any || null, lead: l, clientId,
          hasActiveCall: active.has(l.id), hasConfirmedBooking: booked.has(l.id), readiness,
        }),
      }));
      return json({
        client, settings: s, readiness, campaigns: campaigns.data || [], queue: queueOut,
        slots: slots.data || [], holds: holds.data || [], bookings: bookings.data || [], sessions: sessions.data || [],
      });
    }
    case 'save_settings': {
      const patch: Record<string, unknown> = {};
      for (const f of SETTINGS_FIELDS) if (f in (body.settings || {})) patch[f] = body.settings[f];
      if (patch.caller_number != null && patch.caller_number !== '' && !isE164(patch.caller_number)) return json({ error: 'caller_number_must_be_e164' }, 400);
      for (const k of ['call_window_start', 'call_window_end']) if (k in patch && !(Number(patch[k]) >= 0 && Number(patch[k]) <= 23)) return json({ error: `${k}_invalid` }, 400);
      if ('max_attempts' in patch && !(Number(patch.max_attempts) >= 1 && Number(patch.max_attempts) <= 10)) return json({ error: 'max_attempts_invalid' }, 400);
      // Changing the caller number clears its verification.
      const { data: cur } = await sb.from('ai_setter_settings').select('caller_number').eq('client_id', clientId).maybeSingle();
      if ('caller_number' in patch && patch.caller_number !== cur?.caller_number) patch.caller_number_verified = false;
      const { data, error } = await sb.from('ai_setter_settings').upsert({ client_id: clientId, ...patch }, { onConflict: 'client_id' }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ settings: data });
    }
    case 'set_campaign_active': {
      const { data, error } = await sb.from('ai_setter_campaigns').update({
        active: !!body.active, activated_at: body.active ? new Date().toISOString() : null,
        activated_by: body.active ? (op.auth!.memberName || op.auth!.via) : null,
      }).eq('id', body.campaign_id).eq('client_id', clientId).select('*').maybeSingle();
      if (error || !data) return json({ error: 'campaign_not_found' }, 404);
      return json({ campaign: data });
    }
    case 'session_events': {
      const { data: sess } = await sb.from('ai_setter_sessions').select('id').eq('id', body.session_id).eq('client_id', clientId).maybeSingle();
      if (!sess) return json({ error: 'session_not_found' }, 404);
      const { data } = await sb.from('ai_setter_events').select('id,event_type,task_revision,payload,created_at').eq('session_id', sess.id).order('id').limit(1000);
      return json({ events: data || [] });
    }
    case 'seed_demo':
      return json(await seedDemo(sb, clientId));
    case 'reset_demo':
      return json(await resetDemo(sb, clientId));
    default:
      return json({ error: 'unknown_action' }, 400);
  }
});
