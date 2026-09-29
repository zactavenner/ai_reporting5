// AI Outbound Setter — trusted outbound phone call creation (gpt-live-1, direct SIP).
// Uses POST /v1/live/sessions (never the Realtime call-creation endpoint).
// Ambiguous failures are NEVER retried; they become reconciliation_required.
import { admin, corsHeaders, json, requireClient, requireOperator } from '../_shared/aiSetter/http.ts';
import { classifyCreateFailure, dialBlockers, frontendPrompt, liveSipSessionBody, readinessFromEnv } from '../_shared/aiSetter/core.ts';
import { logEvent } from '../_shared/aiSetter/store.ts';

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

  // Re-read all state server-side; nothing from the browser is trusted beyond ids.
  const { data: lead } = await sb.from('ai_setter_queue').select('*').eq('id', body.queue_id).eq('client_id', client.id).maybeSingle();
  const [{ data: settings }, { data: campaign }, { data: active }, { data: booked }, { data: lastOk }] = await Promise.all([
    sb.from('ai_setter_settings').select('*').eq('client_id', client.id).maybeSingle(),
    lead ? sb.from('ai_setter_campaigns').select('*').eq('id', lead.campaign_id).eq('client_id', client.id).maybeSingle() : { data: null },
    lead ? sb.from('ai_setter_sessions').select('id').eq('queue_id', lead.id).in('status', ['initializing', 'ringing', 'active']).limit(1) : { data: [] },
    lead ? sb.from('ai_setter_bookings').select('id').eq('queue_id', lead.id).eq('status', 'confirmed').limit(1) : { data: [] },
    sb.from('ai_setter_sessions').select('id').eq('transport', 'phone').not('openai_session_id', 'is', null).limit(1),
  ]);
  const blockers = dialBlockers({
    settings, campaign, lead, clientId: client.id,
    hasActiveCall: (active || []).length > 0, hasConfirmedBooking: (booked || []).length > 0,
    readiness: { openai: env.openai, sip: env.sip, outbound_sip_enabled: (lastOk || []).length > 0 || Deno.env.get('OPENAI_OUTBOUND_SIP_ENABLED') === 'true' },
  });
  if (env.bridge !== 'ready') blockers.push('bridge_not_ready');
  if (blockers.length) return json({ error: 'blocked', blockers }, 412);

  // Durable idempotent attempt claim before touching OpenAI.
  const attempt = lead.attempts + 1;
  const { data: claim, error: claimErr } = await sb.from('ai_setter_attempt_claims').insert({
    client_id: client.id, queue_id: lead.id, attempt_number: attempt, idempotency_key: `${lead.id}:${attempt}`,
  }).select('*').maybeSingle();
  if (claimErr || !claim) return json({ error: 'duplicate_attempt' }, 409);
  await sb.from('ai_setter_queue').update({ attempts: attempt, last_attempt_at: new Date().toISOString(), status: 'calling' }).eq('id', lead.id).eq('attempts', lead.attempts);

  const tz = lead.timezone || settings.timezone;
  const { data: session, error: sErr } = await sb.from('ai_setter_sessions').insert({
    client_id: client.id, queue_id: lead.id, campaign_id: campaign.id, transport: 'phone', model: env.live_model,
    status: 'initializing', preferences: { contact_name: lead.contact_name, service_type: campaign.service_type, timezone: tz },
    started_by: op.auth!.memberName || op.auth!.via,
  }).select('*').single();
  if (sErr) return json({ error: 'session_insert_failed' }, 500);
  await sb.from('ai_setter_attempt_claims').update({ session_id: session.id }).eq('id', claim.id);

  const payload = liveSipSessionBody({
    model: env.live_model, responsesModel: env.responses_model, voice: settings.voice || 'marin',
    instructions: frontendPrompt({
      businessName: settings.business_name || client.name, serviceType: campaign.service_type,
      script: campaign.service_type === 'investor' ? settings.investor_script : settings.candidate_script,
      questions: Array.isArray(settings.approved_questions) ? settings.approved_questions : [],
      contactName: lead.contact_name, timezone: tz,
    }),
    destination: lead.contact_phone,
    sip: {
      url: Deno.env.get('SIP_PROVIDER_URL')!, username: Deno.env.get('SIP_USERNAME')!,
      password: Deno.env.get('SIP_PASSWORD')!, caller: settings.caller_number,
    },
  });

  let res: Response | null = null;
  try {
    res = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': claim.idempotency_key },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000),
    });
  } catch { res = null; }

  if (!res || !res.ok) {
    const code = res ? await res.json().then((j) => j?.error?.code).catch(() => null) : null;
    const f = classifyCreateFailure(res ? res.status : null, code);
    await sb.from('ai_setter_sessions').update({
      status: f.state === 'reconciliation_required' ? 'unknown' : 'failed', failure_code: f.code,
      reconciliation_required: f.state === 'reconciliation_required', ended_at: new Date().toISOString(),
      finalization: 'incomplete',
    }).eq('id', session.id);
    await sb.from('ai_setter_attempt_claims').update({ status: f.state }).eq('id', claim.id);
    await sb.from('ai_setter_queue').update({ status: f.state === 'reconciliation_required' ? 'reconciliation_required' : 'queued', last_result: f.code }).eq('id', lead.id);
    await logEvent(sb, session, 'session.create_failed', { code: f.code, state: f.state });
    return json({ error: f.state, code: f.code, retry: false }, f.state === 'blocked' ? 403 : 502);
  }

  const created = await res.json();
  // Save session.id unchanged. Initialization does not mean the lead answered.
  await sb.from('ai_setter_sessions').update({ openai_session_id: created.id, status: 'ringing' }).eq('id', session.id);
  await sb.from('ai_setter_attempt_claims').update({ status: 'created' }).eq('id', claim.id);
  await logEvent(sb, { ...session, openai_session_id: created.id }, 'session.created', { transport: 'sip' });

  // Hand the long-lived sideband to the persistent bridge (not this short request).
  const attach = await fetch(`${Deno.env.get('AI_SETTER_BRIDGE_URL')!.replace(/\/$/, '')}/voice/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('AI_SETTER_BRIDGE_SECRET')}` },
    body: JSON.stringify({ openai_session_id: created.id, session_id: session.id, client_id: client.id }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!attach || !attach.ok) {
    await sb.from('ai_setter_sessions').update({ reconciliation_required: true, failure_code: 'bridge_attach_failed' }).eq('id', session.id);
    await logEvent(sb, session, 'bridge.attach_failed', {});
  }
  return json({ session_id: session.id, openai_session_id: created.id, status: 'ringing' });
});
