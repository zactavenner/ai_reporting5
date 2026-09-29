// AI Outbound Setter — database-backed operations (service role only).
import {
  HOLD_TTL_MINUTES, DEMO_TAG, applyPreferences, isStale, nextWeekdays, saveBookingBlocker,
  utcToZoned, zonedToUtc, type Preferences, type ToolName, TOOL_NAMES,
} from './core.ts';

type SB = any;

export async function logEvent(sb: SB, s: { id: string; client_id: string; is_demo: boolean; task_revision?: number }, type: string, payload?: unknown) {
  await sb.from('ai_setter_events').insert({
    client_id: s.client_id, session_id: s.id, event_type: type,
    task_revision: s.task_revision ?? null, payload: payload ?? null, is_demo: s.is_demo,
  });
}

// ---------------------------------------------------------------- calendar adapter

export interface CalendarAdapter {
  name: string;
  list(clientId: string, serviceType: string, fromIso: string, toIso: string): Promise<any[]>;
  isFree(slotId: string): Promise<boolean>;
  book(args: { clientId: string; slot: any; contactName: string }): Promise<{ providerId: string }>;
}

export function demoCalendar(sb: SB): CalendarAdapter {
  return {
    name: 'demo',
    async list(clientId, serviceType, fromIso, toIso) {
      const { data } = await sb.from('ai_setter_slots').select('*')
        .eq('client_id', clientId).eq('service_type', serviceType)
        .gte('starts_at', fromIso).lte('starts_at', toIso).order('starts_at').limit(40);
      const ids = (data || []).map((s: any) => s.id);
      if (!ids.length) return [];
      const [{ data: holds }, { data: books }] = await Promise.all([
        sb.from('ai_setter_holds').select('slot_id').in('slot_id', ids).eq('status', 'active').gt('expires_at', new Date().toISOString()),
        sb.from('ai_setter_bookings').select('slot_id').in('slot_id', ids).in('status', ['claimed', 'confirmed', 'reconciliation_required']),
      ]);
      const taken = new Set([...(holds || []), ...(books || [])].map((r: any) => r.slot_id));
      return (data || []).filter((s: any) => !taken.has(s.id));
    },
    async isFree(slotId) {
      const { data } = await sb.from('ai_setter_bookings').select('id').eq('slot_id', slotId)
        .in('status', ['claimed', 'confirmed', 'reconciliation_required']).limit(1);
      return !(data || []).length;
    },
    async book({ slot }) {
      return { providerId: `demo-${slot.id}` };
    },
  };
}

/** Only the demo calendar is wired for writes in this build. Real calendars require a verified mapping. */
export function calendarFor(sb: SB, settings: any, isDemo: boolean): CalendarAdapter | null {
  if (isDemo || (settings?.calendar_provider || 'demo') === 'demo') return demoCalendar(sb);
  return null; // GHL adapter intentionally not enabled until a verified per-client mapping exists.
}

// ---------------------------------------------------------------- tool executor

export interface ToolCall {
  sessionId: string;
  clientId: string;
  callRef: string;
  toolCallId: string;
  name: string;
  args: Record<string, any>;
  revision?: number;
}

export async function executeTool(sb: SB, call: ToolCall): Promise<any> {
  if (!TOOL_NAMES.includes(call.name as ToolName)) return { status: 'error', error: 'unknown_tool' };
  const { data: session } = await sb.from('ai_setter_sessions').select('*')
    .eq('id', call.sessionId).eq('client_id', call.clientId).maybeSingle();
  if (!session) return { status: 'error', error: 'session_not_found' };
  const revision = call.revision ?? session.task_revision;

  // Durable claim: one handler owns each side effect.
  const { data: claimed, error: claimErr } = await sb.from('ai_setter_tool_runs').insert({
    client_id: session.client_id, session_id: session.id, call_ref: call.callRef, tool_call_id: call.toolCallId,
    tool_name: call.name, task_revision: revision, arguments: call.args, is_demo: session.is_demo,
  }).select('id').maybeSingle();
  if (claimErr || !claimed) {
    const { data: prior } = await sb.from('ai_setter_tool_runs').select('status,result')
      .eq('session_id', session.id).eq('call_ref', call.callRef).eq('tool_call_id', call.toolCallId).maybeSingle();
    return prior?.result ?? { status: 'duplicate', detail: prior?.status || 'in_progress' };
  }

  let result: any;
  try {
    if (call.name !== 'update_preferences' && call.name !== 'end_call' && isStale(revision, session.task_revision)) {
      result = { status: 'skipped', reason: 'stale', current_revision: session.task_revision };
    } else {
      result = await runTool(sb, session, call.name as ToolName, call.args);
    }
  } catch (e) {
    result = { status: 'error', error: (e as Error).message.slice(0, 200) };
  }
  await sb.from('ai_setter_tool_runs').update({ status: result.status || 'done', result }).eq('id', claimed.id);
  await logEvent(sb, session, 'tool.' + call.name, { tool_call_id: call.toolCallId, status: result.status });
  return result;
}

async function runTool(sb: SB, session: any, name: ToolName, args: Record<string, any>) {
  const { data: settings } = await sb.from('ai_setter_settings').select('*').eq('client_id', session.client_id).maybeSingle();
  const { data: campaign } = session.campaign_id
    ? await sb.from('ai_setter_campaigns').select('*').eq('id', session.campaign_id).maybeSingle()
    : { data: null };
  const tz = session.preferences?.timezone || settings?.timezone || 'America/New_York';
  const serviceType = session.preferences?.service_type || campaign?.service_type || 'candidate';
  const cal = calendarFor(sb, settings, session.is_demo);

  switch (name) {
    case 'check_availability': {
      if (!cal) return { status: 'error', error: 'calendar_not_configured' };
      const from = args.date_from ? zonedToUtc(args.date_from, '00:00', tz) : new Date().toISOString();
      const to = args.date_to ? zonedToUtc(args.date_to, '23:59', tz) : new Date(Date.now() + 14 * 864e5).toISOString();
      const slots = await cal.list(session.client_id, serviceType, from, to);
      return {
        status: 'ok', timezone: tz,
        slots: slots.slice(0, 8).map((s: any) => ({ slot_id: s.id, ...utcToZoned(s.starts_at, tz) })),
      };
    }
    case 'hold_booking': {
      const { data: slot } = await sb.from('ai_setter_slots').select('*').eq('id', args.slot_id).eq('client_id', session.client_id).maybeSingle();
      if (!slot) return { status: 'error', error: 'slot_not_found' };
      await sb.from('ai_setter_holds').update({ status: 'expired' }).eq('slot_id', slot.id).eq('status', 'active').lt('expires_at', new Date().toISOString());
      await sb.from('ai_setter_holds').update({ status: 'released' }).eq('session_id', session.id).eq('status', 'active');
      const { data: hold, error } = await sb.from('ai_setter_holds').insert({
        client_id: session.client_id, session_id: session.id, slot_id: slot.id, task_revision: session.task_revision,
        expires_at: new Date(Date.now() + HOLD_TTL_MINUTES * 60e3).toISOString(), is_demo: session.is_demo,
      }).select('*').maybeSingle();
      if (error || !hold) return { status: 'error', error: 'slot_unavailable' };
      const when = utcToZoned(slot.starts_at, tz);
      await sb.from('ai_setter_sessions').update({
        preferences: { ...session.preferences, date: when.date, time: when.time, timezone: tz, service_type: serviceType },
      }).eq('id', session.id);
      return { status: 'ok', hold_id: hold.id, expires_at: hold.expires_at, ...when, timezone: tz };
    }
    case 'release_booking_hold': {
      await sb.from('ai_setter_holds').update({ status: 'released' })
        .eq('id', args.hold_id).eq('session_id', session.id).eq('status', 'active');
      return { status: 'ok' };
    }
    case 'update_preferences': {
      const r = applyPreferences(session.preferences || {}, session.task_revision, args as Preferences);
      if (r.changed) {
        await sb.from('ai_setter_sessions').update({ preferences: r.preferences, task_revision: r.revision, confirmation: null })
          .eq('id', session.id).eq('task_revision', session.task_revision);
        await sb.from('ai_setter_holds').update({ status: 'stale' }).eq('session_id', session.id).eq('status', 'active');
      }
      return { status: 'ok', revision: r.revision, changed: r.changed, readback_required: true };
    }
    case 'save_booking': {
      const details = {
        contact_name: String(args.contact_name || ''), service_type: String(args.service_type || ''),
        date: String(args.date || ''), time: String(args.time || ''), timezone: String(args.timezone || ''),
      };
      // The live model's confirmed_by_customer is bound to this revision + details, then re-verified.
      const confirmation = args.confirmed_by_customer === true
        ? { revision: session.task_revision, details, at: new Date().toISOString() } : null;
      await sb.from('ai_setter_sessions').update({ confirmation }).eq('id', session.id);
      const { data: hold } = await sb.from('ai_setter_holds').select('*').eq('id', args.hold_id).maybeSingle();
      const blocker = saveBookingBlocker({
        session: { ...session, confirmation }, clientId: session.client_id, sessionId: session.id,
        revision: session.task_revision, hold, holdId: String(args.hold_id || ''), details,
        confirmed_by_customer: args.confirmed_by_customer === true,
      });
      if (blocker) return { status: 'rejected', reason: blocker };
      if (!cal) return { status: 'error', error: 'calendar_not_configured' };
      const { data: slot } = await sb.from('ai_setter_slots').select('*').eq('id', hold.slot_id).maybeSingle();
      const slotLocal = slot ? utcToZoned(slot.starts_at, details.timezone) : null;
      if (!slotLocal || slotLocal.date !== details.date || slotLocal.time !== details.time) return { status: 'rejected', reason: 'details_mismatch_slot' };
      // Durable booking claim before any calendar write.
      const { data: booking, error: bErr } = await sb.from('ai_setter_bookings').insert({
        client_id: session.client_id, session_id: session.id, queue_id: session.queue_id, slot_id: slot.id, hold_id: hold.id,
        contact_name: details.contact_name, service_type: details.service_type, starts_at: slot.starts_at,
        timezone: details.timezone, provider: cal.name, is_demo: session.is_demo,
      }).select('*').maybeSingle();
      if (bErr || !booking) return { status: 'rejected', reason: 'already_booked' };
      if (!(await cal.isFree(slot.id).then(() => true))) return { status: 'rejected', reason: 'slot_taken' };
      let providerId: string;
      try {
        providerId = (await cal.book({ clientId: session.client_id, slot, contactName: details.contact_name })).providerId;
      } catch (e) {
        await sb.from('ai_setter_bookings').update({ status: 'failed', failure_detail: (e as Error).message.slice(0, 200) }).eq('id', booking.id);
        return { status: 'error', error: 'calendar_write_failed' };
      }
      const { error: upErr } = await sb.from('ai_setter_bookings').update({ status: 'confirmed', provider_booking_id: providerId }).eq('id', booking.id);
      if (upErr) {
        await sb.from('ai_setter_bookings').update({ status: 'reconciliation_required', provider_booking_id: providerId }).eq('id', booking.id);
        return { status: 'reconciliation_required' };
      }
      await sb.from('ai_setter_holds').update({ status: 'consumed' }).eq('id', hold.id);
      if (session.queue_id) await sb.from('ai_setter_queue').update({ status: 'booked', last_result: 'Appointment Booked' }).eq('id', session.queue_id);
      return { status: 'confirmed', booking_id: booking.id, ...details };
    }
    case 'end_call': {
      const reason = String(args.reason || 'completed');
      if (reason === 'dnc' && session.queue_id) {
        await sb.from('ai_setter_queue').update({ dnc: true, dnc_reason: 'requested_on_call', status: 'dnc' }).eq('id', session.queue_id);
      }
      return { status: 'ok', reason, hangup: true };
    }
  }
}

// ---------------------------------------------------------------- reporting upsert

export async function upsertCallRecord(sb: SB, sessionId: string) {
  const { data: s } = await sb.from('ai_setter_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (!s) return;
  const [{ data: q }, { data: b }, { data: ev }] = await Promise.all([
    s.queue_id ? sb.from('ai_setter_queue').select('*').eq('id', s.queue_id).maybeSingle() : { data: null },
    sb.from('ai_setter_bookings').select('*').eq('session_id', s.id).eq('status', 'confirmed').maybeSingle(),
    sb.from('ai_setter_events').select('event_type,payload').eq('session_id', s.id).like('event_type', 'transcript.%').order('id').limit(500),
  ]);
  const transcript = (ev || []).map((e: any) => `${e.event_type === 'transcript.agent' ? 'AI Caller' : 'Prospect'}: ${e.payload?.text || ''}`).join('\n');
  const dur = s.ended_at ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000) : null;
  await sb.from('phone_call_records').upsert({
    call_id: `ai-setter:${s.id}`,
    client_id: s.client_id,
    provider: s.transport === 'phone' ? 'openai_live_sip' : 'openai_realtime_webrtc',
    ai_agent: 'OpenAI Outbound Setter',
    is_ai_caller: true,
    direction: 'outbound',
    contact_name: q?.contact_name ? `${q.contact_name}${s.is_demo ? ` (${DEMO_TAG})` : ''}` : null,
    contact_phone: q?.contact_phone || null,
    contact_email: q?.contact_email || null,
    call_status: s.status === 'closed' ? 'completed' : s.status === 'failed' ? 'failed' : s.status,
    started_at: s.started_at,
    ended_at: s.ended_at,
    duration_seconds: dur,
    appointment_booked: !!b,
    appointment_date: b?.starts_at || null,
    appointment_status: b ? 'Booked' : null,
    outcome: b ? 'Appointment Booked' : q?.dnc ? 'Do Not Contact' : null,
    transcript: transcript || null,
    openai_session_id: s.openai_session_id,
    transport: s.transport,
    setter_session_id: s.id,
    error_detail: s.failure_code || null,
    follow_up_required: !b && !q?.dnc,
  }, { onConflict: 'call_id' });
}

// ---------------------------------------------------------------- demo

export async function seedDemo(sb: SB, clientId: string) {
  await sb.from('ai_setter_settings').upsert({
    client_id: clientId, business_name: 'Demo Capital Partners (DEMO)',
    approved_questions: ['Are you currently exploring this opportunity?', 'What timeline are you considering?'],
    candidate_script: 'Demo candidate qualification script.', investor_script: 'Demo investor qualification script.',
  }, { onConflict: 'client_id', ignoreDuplicates: true });

  const campaigns: any[] = [];
  for (const [type, name] of [['candidate', 'Candidate Qualification (DEMO)'], ['investor', 'Investor Qualification (DEMO)']]) {
    const { data: ex } = await sb.from('ai_setter_campaigns').select('*').eq('client_id', clientId).eq('is_demo', true).eq('service_type', type).maybeSingle();
    campaigns.push(ex || (await sb.from('ai_setter_campaigns').insert({
      client_id: clientId, name, service_type: type, service_name: name, is_demo: true, active: false,
    }).select('*').single()).data);
  }
  const leads = [
    ['Avery Demo', '+12125550101', 0], ['Jordan Demo', '+13105550102', 1], ['Casey Demo', '+14155550103', 0],
  ] as const;
  const queue: any[] = [];
  for (const [nm, ph, ci] of leads) {
    const { data: ex } = await sb.from('ai_setter_queue').select('*').eq('client_id', clientId).eq('is_demo', true).eq('contact_phone', ph).maybeSingle();
    queue.push(ex || (await sb.from('ai_setter_queue').insert({
      client_id: clientId, campaign_id: campaigns[ci].id, contact_name: `${nm} (${DEMO_TAG})`, contact_phone: ph,
      timezone: 'America/New_York', is_demo: true,
      consent_evidence: { source: 'demo_seed', captured_at: new Date().toISOString() }, consent_at: new Date().toISOString(),
    }).select('*').single()).data);
  }
  const days = nextWeekdays(new Date(), 7);
  const rows = days.flatMap((d) => ['candidate', 'investor'].flatMap((t) => ['10:00', '13:00', '15:30'].map((tm) => ({
    client_id: clientId, service_type: t, starts_at: zonedToUtc(d, tm, 'America/New_York'), timezone: 'America/New_York', is_demo: true,
  }))));
  await sb.from('ai_setter_slots').upsert(rows, { onConflict: 'client_id,service_type,starts_at', ignoreDuplicates: true });

  const { data: existing } = await sb.from('ai_setter_bookings').select('id').eq('client_id', clientId).eq('is_demo', true).limit(1);
  if (!(existing || []).length) {
    const { data: slot } = await sb.from('ai_setter_slots').select('*').eq('client_id', clientId).eq('is_demo', true)
      .eq('service_type', 'investor').order('starts_at').limit(1).maybeSingle();
    if (slot) {
      await sb.from('ai_setter_bookings').insert({
        client_id: clientId, queue_id: queue[1].id, slot_id: slot.id, contact_name: queue[1].contact_name,
        service_type: 'investor', starts_at: slot.starts_at, timezone: slot.timezone, provider: 'demo',
        provider_booking_id: `demo-${slot.id}`, status: 'confirmed', is_demo: true,
      });
      await sb.from('ai_setter_queue').update({ status: 'booked', last_result: 'Appointment Booked' }).eq('id', queue[1].id);
    }
  }
  return { campaigns: campaigns.length, leads: queue.length, slots: rows.length };
}

/** Deletes only is_demo rows for this client. Real records are never matched. */
export async function resetDemo(sb: SB, clientId: string) {
  const tables = ['ai_setter_bookings', 'ai_setter_holds', 'ai_setter_tool_runs', 'ai_setter_events', 'ai_setter_sessions', 'ai_setter_slots', 'ai_setter_queue', 'ai_setter_campaigns'];
  for (const t of tables) await sb.from(t).delete().eq('client_id', clientId).eq('is_demo', true);
  await sb.from('phone_call_records').delete().eq('client_id', clientId).like('call_id', 'ai-setter:%').like('contact_name', `%(${DEMO_TAG})`);
  return { ok: true };
}
