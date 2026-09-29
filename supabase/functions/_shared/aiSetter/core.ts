// AI Outbound Setter — pure, dependency-free logic shared by the setter edge
// functions and unit tests. Nothing here touches the network or database.

export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1';
export const DEFAULT_LIVE_MODEL = 'gpt-live-1';
export const DEFAULT_RESPONSES_MODEL = 'gpt-6-luna';
export const HOLD_TTL_MINUTES = 10;

export type Readiness = 'ready' | 'missing' | 'invalid';

export const TOOL_NAMES = [
  'check_availability',
  'hold_booking',
  'release_booking_hold',
  'save_booking',
  'update_preferences',
  'end_call',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ---------------------------------------------------------------- phone / time

export function isE164(v: unknown): v is string {
  return typeof v === 'string' && /^\+[1-9]\d{7,14}$/.test(v);
}

/** Country from E.164 — only the NANP (+1) → US mapping is needed today. */
export function countryOf(e164: string): string | null {
  if (/^\+1\d{10}$/.test(e164)) return 'US';
  return null;
}

/** NANP 555-01XX fictional numbers used by demo leads. */
export function isFictionalNumber(e164: string | null | undefined): boolean {
  return !!e164 && /^\+1\d{3}55501\d{2}$/.test(e164);
}

export function localHour(tz: string, at: Date = new Date()): number | null {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(at);
    return Number(h);
  } catch {
    return null;
  }
}

export function localWeekday(tz: string, at: Date = new Date()): number | null {
  try {
    const d = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d);
  } catch {
    return null;
  }
}

export function withinCallingWindow(tz: string, startHour: number, endHour: number, at = new Date()): boolean {
  const h = localHour(tz, at);
  const wd = localWeekday(tz, at);
  if (h === null || wd === null || wd < 0) return false;
  if (wd === 0 || wd === 6) return false;
  return h >= startHour && h < endHour;
}

// ---------------------------------------------------------------- dial gates

export interface DialContext {
  now?: Date;
  settings: {
    outbound_enabled: boolean;
    caller_number: string | null;
    caller_number_verified: boolean;
    allowed_countries: string[];
    call_window_start: number;
    call_window_end: number;
    max_attempts: number;
    timezone: string;
  } | null;
  campaign: { active: boolean; client_id: string } | null;
  lead: {
    client_id: string;
    contact_phone: string | null;
    timezone: string | null;
    consent_evidence: unknown;
    dnc: boolean;
    attempts: number;
    is_demo: boolean;
  } | null;
  clientId: string;
  hasActiveCall: boolean;
  hasConfirmedBooking: boolean;
  readiness: { openai: Readiness; sip: Readiness; outbound_sip_enabled: boolean | null };
}

/** Every reason a lead cannot be dialed right now. Empty array = allowed. */
export function dialBlockers(c: DialContext): string[] {
  const out: string[] = [];
  const s = c.settings;
  const l = c.lead;
  if (!s) out.push('settings_missing');
  if (!c.campaign) out.push('campaign_missing');
  if (!l) out.push('lead_missing');
  if (!s || !l) return out;
  if (l.client_id !== c.clientId || (c.campaign && c.campaign.client_id !== c.clientId)) out.push('cross_client');
  if (l.is_demo) out.push('demo_never_dials');
  if (!s.outbound_enabled) out.push('outbound_disabled');
  if (c.campaign && !c.campaign.active) out.push('campaign_inactive');
  if (!hasConsent(l.consent_evidence)) out.push('no_consent');
  if (l.dnc) out.push('dnc');
  if (!isE164(l.contact_phone)) out.push('invalid_phone');
  else {
    const cc = countryOf(l.contact_phone);
    if (!cc || !s.allowed_countries.includes(cc)) out.push('country_not_allowed');
    if (isFictionalNumber(l.contact_phone)) out.push('demo_never_dials');
  }
  const tz = l.timezone || s.timezone;
  if (!withinCallingWindow(tz, s.call_window_start, s.call_window_end, c.now)) out.push('outside_calling_hours');
  if (l.attempts >= s.max_attempts) out.push('attempt_limit');
  if (c.hasActiveCall) out.push('active_call');
  if (c.hasConfirmedBooking) out.push('already_booked');
  if (!isE164(s.caller_number) || !s.caller_number_verified) out.push('caller_number_unverified');
  if (c.readiness.openai !== 'ready') out.push('openai_not_ready');
  if (c.readiness.sip !== 'ready') out.push('sip_not_ready');
  if (c.readiness.outbound_sip_enabled !== true) out.push('outbound_sip_not_enabled');
  return [...new Set(out)];
}

export function hasConsent(ev: unknown): boolean {
  if (!ev || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  return typeof e.source === 'string' && e.source.trim().length > 0 &&
    typeof e.captured_at === 'string' && !Number.isNaN(Date.parse(e.captured_at));
}

// ---------------------------------------------------------------- readiness

export function readinessFromEnv(get: (k: string) => string | undefined) {
  const key = get('OPENAI_API_KEY');
  const openai: Readiness = !key ? 'missing' : key.startsWith('sk-') ? 'ready' : 'invalid';
  const url = get('SIP_PROVIDER_URL');
  const user = get('SIP_USERNAME');
  const pass = get('SIP_PASSWORD');
  const num = get('SIP_CALLER_NUMBER');
  let sip: Readiness = 'ready';
  if (!url || !user || !pass || !num) sip = 'missing';
  else if (!validSipUrl(url) || !isE164(num)) sip = 'invalid';
  const bridge: Readiness = get('AI_SETTER_BRIDGE_URL') && get('AI_SETTER_BRIDGE_SECRET') ? 'ready' : 'missing';
  return {
    openai,
    sip,
    bridge,
    webhook_secret: (get('OPENAI_WEBHOOK_SECRET') ? 'ready' : 'missing') as Readiness,
    realtime_model: get('OPENAI_REALTIME_MODEL') || DEFAULT_REALTIME_MODEL,
    live_model: get('OPENAI_LIVE_MODEL') || DEFAULT_LIVE_MODEL,
    responses_model: get('OPENAI_RESPONSES_MODEL') || DEFAULT_RESPONSES_MODEL,
  };
}

export function validSipUrl(u: string): boolean {
  const m = /^sips:([a-z0-9.-]+)(:\d{2,5})?(;transport=tcp)?$/i.exec(u.trim());
  if (!m) return false;
  const host = m[1].toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return host.includes('.');
}

// ---------------------------------------------------------------- errors

/** Classify a call-create failure. Ambiguous ones must never auto-retry. */
export function classifyCreateFailure(status: number | null, code?: string | null) {
  if (status === 403 && code === 'outbound_sip_not_enabled') return { state: 'blocked', code, retry: false };
  if (status === null || status === 502 || status === 504 || status >= 500) {
    return { state: 'reconciliation_required', code: code || `transport_${status ?? 'timeout'}`, retry: false };
  }
  return { state: 'failed', code: code || `http_${status}`, retry: false };
}

// ---------------------------------------------------------------- revisions

export interface Preferences {
  contact_name?: string;
  service_type?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  timezone?: string;
}

const MATERIAL: (keyof Preferences)[] = ['contact_name', 'service_type', 'date', 'time', 'timezone'];

/** Merge a preference change. Any material change bumps the revision. */
export function applyPreferences(current: Preferences, revision: number, patch: Preferences) {
  const next: Preferences = { ...current };
  let changed = false;
  for (const k of MATERIAL) {
    const v = patch[k];
    if (typeof v === 'string' && v.trim() && v.trim() !== (current[k] || '')) {
      next[k] = v.trim();
      changed = true;
    }
  }
  return { preferences: next, revision: changed ? revision + 1 : revision, changed, clearConfirmation: changed };
}

export function isStale(toolRevision: number, sessionRevision: number) {
  return toolRevision !== sessionRevision;
}

export interface SaveBookingInput {
  session: { id: string; client_id: string; status: string; task_revision: number; confirmation: any; preferences: Preferences };
  clientId: string;
  sessionId: string;
  revision: number;
  hold: { id: string; session_id: string; client_id: string; status: string; task_revision: number; expires_at: string } | null;
  holdId: string;
  details: { contact_name: string; service_type: string; date: string; time: string; timezone: string };
  confirmed_by_customer: boolean;
  now?: Date;
}

/** Server-side gate for save_booking. Returns null when the booking may proceed. */
export function saveBookingBlocker(i: SaveBookingInput): string | null {
  const now = i.now || new Date();
  if (i.session.id !== i.sessionId || i.session.client_id !== i.clientId) return 'session_mismatch';
  if (!['active', 'ringing', 'initializing'].includes(i.session.status)) return 'session_not_active';
  if (i.revision !== i.session.task_revision) return 'stale_revision';
  if (i.confirmed_by_customer !== true) return 'not_confirmed';
  const h = i.hold;
  if (!h || h.id !== i.holdId) return 'hold_missing';
  if (h.session_id !== i.sessionId || h.client_id !== i.clientId) return 'hold_mismatch';
  if (h.status !== 'active') return 'hold_not_active';
  if (h.task_revision !== i.session.task_revision) return 'hold_stale';
  if (Date.parse(h.expires_at) <= now.getTime()) return 'hold_expired';
  const c = i.session.confirmation;
  if (!c || c.revision !== i.session.task_revision) return 'confirmation_stale';
  for (const k of ['contact_name', 'service_type', 'date', 'time', 'timezone'] as const) {
    if (String(c.details?.[k] ?? '') !== String(i.details[k] ?? '')) return 'details_changed';
    if (i.session.preferences[k] && String(i.session.preferences[k]) !== String(i.details[k])) return 'details_changed';
  }
  return null;
}

// ---------------------------------------------------------------- prompts & tools

export interface PromptInput {
  businessName: string;
  serviceType: 'candidate' | 'investor';
  script?: string | null;
  questions: string[];
  contactName: string;
  timezone: string;
}

export function frontendPrompt(p: PromptInput): string {
  const qs = p.questions.length ? p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '(none approved — do not qualify, only schedule)';
  return `You are a scheduling assistant calling on behalf of ${p.businessName} about ${p.serviceType} qualification. You are speaking with ${p.contactName}. Speak first.

# Personality
Warm, brief, professional. Say who you are, the business name, and why you are calling, then ask if it is a good time to continue. If they say no, offer to call back and end politely.

# Backchannel policy
Use short acknowledgements ("got it", "sure") only when the caller pauses mid-thought. Never talk over them.

# Interruption policy
If interrupted, stop immediately and listen. Treat any correction of name, service, date, time, or timezone as a preference change and call update_preferences before anything else. If the caller says stop, not interested, or do not call, apologize, confirm they will not be called again, call end_call with reason "dnc", and stop.

# Delegation policy
Ask only these approved questions, in order, one at a time:
${qs}
Never state investment returns, facts, eligibility, or guarantees. If asked, say a specialist will cover it on the appointment.
For times, call check_availability, then hold_booking for the chosen slot. Before save_booking, read back the full name, service, date, time, and timezone (${p.timezone} unless changed) and wait for an explicit "yes". Only then call save_booking with confirmed_by_customer true. If anything changes after the readback, read it back again.
${p.script ? `\n# Approved script notes\n${p.script.slice(0, 1500)}` : ''}`;
}

export function toolSchemas() {
  const obj = (props: Record<string, unknown>, required: string[]) => ({
    type: 'object', properties: props, required, additionalProperties: false,
  });
  const s = { type: 'string' };
  return [
    { type: 'function', name: 'check_availability', description: 'List open appointment slots.', parameters: obj({ date_from: s, date_to: s }, []) },
    { type: 'function', name: 'hold_booking', description: 'Temporarily hold one slot.', parameters: obj({ slot_id: s }, ['slot_id']) },
    { type: 'function', name: 'release_booking_hold', description: 'Release a held slot.', parameters: obj({ hold_id: s }, ['hold_id']) },
    {
      type: 'function', name: 'save_booking', description: 'Book the held slot after an explicit verbal confirmation.',
      parameters: obj({
        hold_id: s, contact_name: s, service_type: s, date: s, time: s, timezone: s,
        confirmed_by_customer: { type: 'boolean' },
      }, ['hold_id', 'contact_name', 'service_type', 'date', 'time', 'timezone', 'confirmed_by_customer']),
    },
    { type: 'function', name: 'update_preferences', description: 'Record a changed name, service, date, time, or timezone.', parameters: obj({ contact_name: s, service_type: s, date: s, time: s, timezone: s }, []) },
    { type: 'function', name: 'end_call', description: 'End the call.', parameters: obj({ reason: { type: 'string', enum: ['completed', 'callback', 'not_interested', 'dnc', 'wrong_number'] } }, ['reason']) },
  ];
}

/** Body for POST /v1/live/sessions (outbound SIP). Secrets are passed in, never logged. */
export function liveSipSessionBody(opts: {
  model: string; responsesModel: string; instructions: string; voice: string;
  destination: string; sip: { url: string; username: string; password: string; caller: string };
}) {
  return {
    session: {
      model: opts.model,
      instructions: opts.instructions,
      audio: { output: { voice: opts.voice } },
      delegation: {
        type: 'responses',
        responses: {
          model: opts.responsesModel,
          instructions: 'You run scheduling tools for a live phone call. Call exactly the tool needed and return a short factual result for speech. Never invent availability or bookings.',
          tools: toolSchemas(),
          tool_choice: 'auto',
          parallel_tool_calls: false,
        },
      },
    },
    transport: {
      type: 'sip',
      destination: opts.destination,
      trunk: {
        provider_url: opts.sip.url,
        auth: { type: 'digest', username: opts.sip.username, password: opts.sip.password },
        caller_number: opts.sip.caller,
      },
    },
  };
}

/** Session config for the browser WebRTC test (Realtime, gpt-realtime-2.1). */
export function realtimeSessionConfig(opts: { model: string; instructions: string; voice: string }) {
  return {
    type: 'realtime',
    model: opts.model,
    instructions: opts.instructions,
    audio: { output: { voice: opts.voice } },
    tools: toolSchemas(),
    tool_choice: 'auto',
  };
}

// ---------------------------------------------------------------- demo

export const DEMO_TAG = 'DEMO';

export function nextWeekdays(from: Date, n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Wall-clock (date, HH:MM) in tz → UTC ISO. */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asTz = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (asTz - guess)).toISOString();
}

export function utcToZoned(iso: string, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
