/**
 * Qualified-lead feedback core: pure, runtime-agnostic (Deno + Node tests).
 *
 * Internal milestones are NOT Meta event names. Mapping happens only in
 * buildMetaPayload, from the client's configured meta_event_name.
 * Nothing in this file performs network I/O; the sender is injected.
 */

export type Milestone = 'verified_qualified_lead' | 'verified_qualified_booking' | 'attended_qualified_call' | 'verified_funded';
export const SENDABLE_MILESTONES: Milestone[] = ['verified_qualified_lead', 'verified_qualified_booking', 'attended_qualified_call'];
export type EvalStatus = 'eligible' | 'withheld' | 'needs_review' | 'excluded';
export type Mode = 'off' | 'preview' | 'live';

export interface QualityRules {
  /** CRM dispositions that ARE evidence of verified qualification (explicit, per client). */
  qualified_dispositions: string[];
  /** custom_fields keys + accepted values that are evidence of verified qualification. */
  qualified_field_rules: { field: string; in: string[] }[];
  /** CRM pipeline stage ids explicitly mapped to qualification. */
  qualified_stage_ids: string[];
  disqualify_dispositions: string[];
  /** appointment_status values that count as a successful booking. */
  booking_ok_statuses: string[];
  /** Attendance must carry an attendance_source (e.g. CRM/meeting record). */
  attendance_requires_source: boolean;
  test_markers: string[];
  contact_requirement: 'email_or_phone' | 'email_and_phone';
}

export const DEFAULT_RULES: QualityRules = {
  qualified_dispositions: [],
  qualified_field_rules: [],
  qualified_stage_ids: [],
  disqualify_dispositions: ['bad_lead', 'bad_contact_info', 'unqualified', 'not_accredited', 'spam', 'duplicate', 'test'],
  booking_ok_statuses: ['confirmed', 'booked', 'showed', 'completed'],
  attendance_requires_source: true,
  test_markers: ['test', 'demo', 'example.com'],
  contact_requirement: 'email_or_phone',
};

export function rulesConfigured(r: Partial<QualityRules> | null | undefined): boolean {
  return !!r && ((r.qualified_dispositions?.length ?? 0) + (r.qualified_field_rules?.length ?? 0) + (r.qualified_stage_ids?.length ?? 0)) > 0;
}

export function validateRules(input: any): { ok: true; rules: QualityRules } | { ok: false; error: string } {
  const arr = (v: any) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length <= 200);
  const r = { ...DEFAULT_RULES, ...(input || {}) };
  if (!arr(r.qualified_dispositions) || !arr(r.qualified_stage_ids) || !arr(r.disqualify_dispositions) || !arr(r.booking_ok_statuses) || !arr(r.test_markers)) {
    return { ok: false, error: 'Rule lists must be arrays of text' };
  }
  if (!Array.isArray(r.qualified_field_rules) || !r.qualified_field_rules.every((f: any) => typeof f?.field === 'string' && f.field && arr(f.in) && f.in.length)) {
    return { ok: false, error: 'Field rules need a field name and at least one accepted value' };
  }
  if (!['email_or_phone', 'email_and_phone'].includes(r.contact_requirement)) return { ok: false, error: 'Invalid contact requirement' };
  const lower = (a: string[]) => a.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const clash = lower(r.qualified_dispositions).filter((d) => lower(r.disqualify_dispositions).includes(d));
  if (clash.length) return { ok: false, error: `Disposition both qualifies and disqualifies: ${clash.join(', ')}` };
  return {
    ok: true,
    rules: {
      qualified_dispositions: lower(r.qualified_dispositions),
      qualified_field_rules: r.qualified_field_rules.map((f: any) => ({ field: f.field.trim(), in: lower(f.in) })),
      qualified_stage_ids: r.qualified_stage_ids.map((s: string) => s.trim()).filter(Boolean),
      disqualify_dispositions: lower(r.disqualify_dispositions),
      booking_ok_statuses: lower(r.booking_ok_statuses),
      attendance_requires_source: !!r.attendance_requires_source,
      test_markers: lower(r.test_markers),
      contact_requirement: r.contact_requirement,
    },
  };
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface LeadInput {
  id: string; client_id: string; name?: string | null; email?: string | null; phone?: string | null;
  is_spam?: boolean | null; created_at: string; current_disposition?: string | null; disposition_updated_at?: string | null;
  opportunity_stage_id?: string | null; custom_fields?: Record<string, any> | null; quality_score?: number | null; updated_at?: string | null;
}
export interface DispositionInput { id: string; disposition: string; disposed_at: string; source?: string | null }
export interface CallInput {
  id: string; booked_at?: string | null; scheduled_at?: string | null; appointment_status?: string | null;
  showed?: boolean | null; showed_at?: string | null; attendance_source?: string | null; is_reconnect?: boolean | null;
}
export interface FundedInput { id: string; funded_at?: string | null; is_verified_funded?: boolean | null }
export interface Evidence { kind: string; table: string; id: string; at: string | null; detail: string }
export interface MilestoneResult {
  milestone: Milestone; status: EvalStatus; reasons: string[]; evidence: Evidence[];
  occurred_at: string | null; occurrence_ref: string | null; evidence_hash: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const validEmail = (v?: string | null) => !!v && EMAIL_RE.test(v.trim());
export const validPhone = (v?: string | null) => String(v || '').replace(/\D/g, '').length >= 10;
const maxIso = (...xs: (string | null | undefined)[]) =>
  xs.filter(Boolean).map((x) => new Date(x!).getTime()).reduce((a, b) => Math.max(a, b), -Infinity);
const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString() : null);

function stableHash(s: string): string {
  // FNV-1a 64-bit-ish (two 32-bit lanes) — used only for change detection, not security.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function evaluateLead(
  rulesIn: QualityRules | null,
  lead: LeadInput,
  dispositions: DispositionInput[],
  calls: CallInput[],
  funded: FundedInput[],
  opts: { duplicateOf?: string | null } = {},
): MilestoneResult[] {
  const rules = rulesIn ?? DEFAULT_RULES;
  const exclusions: string[] = [];
  const hay = `${lead.name || ''} ${lead.email || ''}`.toLowerCase();
  if (lead.is_spam) exclusions.push('Flagged as spam');
  if (rules.test_markers.some((m) => m && hay.includes(m))) exclusions.push('Looks like a test record');
  const hasE = validEmail(lead.email), hasP = validPhone(lead.phone);
  if (rules.contact_requirement === 'email_and_phone' ? !(hasE && hasP) : !(hasE || hasP)) exclusions.push('Invalid or missing contact info');
  if (opts.duplicateOf || lead.custom_fields?.duplicate_of) exclusions.push('Duplicate of another lead');
  const cur = (lead.current_disposition || '').toLowerCase();
  if (cur && rules.disqualify_dispositions.includes(cur)) exclusions.push(`Disqualified disposition: ${cur}`);

  // Qualification evidence — only from explicitly mapped CRM signals with a source record.
  const qEvidence: Evidence[] = [];
  const notes: string[] = [];
  for (const d of dispositions) {
    if (rules.qualified_dispositions.includes(d.disposition.toLowerCase())) {
      qEvidence.push({ kind: 'disposition', table: 'lead_dispositions', id: d.id, at: d.disposed_at, detail: `${d.disposition} (${d.source || 'crm'})` });
    }
  }
  if (!qEvidence.length && cur && rules.qualified_dispositions.includes(cur)) {
    notes.push('Current CRM disposition matches, but no disposition history record backs it — needs review');
  }
  if (lead.opportunity_stage_id && rules.qualified_stage_ids.includes(lead.opportunity_stage_id)) {
    qEvidence.push({ kind: 'stage', table: 'leads', id: lead.id, at: lead.disposition_updated_at || lead.updated_at || null, detail: `Pipeline stage ${lead.opportunity_stage_id}` });
  }
  for (const fr of rules.qualified_field_rules) {
    const v = lead.custom_fields?.[fr.field];
    if (v != null && fr.in.includes(String(v).trim().toLowerCase())) {
      qEvidence.push({ kind: 'crm_field', table: 'leads', id: lead.id, at: lead.updated_at || null, detail: `${fr.field} = ${String(v).slice(0, 60)}` });
    }
  }
  const datedQ = qEvidence.filter((e) => e.at);
  const qualifiedAt = datedQ.length ? Math.min(...datedQ.map((e) => new Date(e.at!).getTime())) : NaN;
  if (qEvidence.length && !datedQ.length) notes.push('Qualification evidence has no timestamp');
  if ((lead.quality_score ?? 0) >= 7 && !qEvidence.length) notes.push('AI quality score is high, but a score is not qualification evidence');

  const firstQ = datedQ.sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime())[0];
  const out: MilestoneResult[] = [];
  const push = (m: Milestone, status: EvalStatus, reasons: string[], evidence: Evidence[], occurred: number, ref: string | null) => {
    const occurred_at = status === 'eligible' ? iso(occurred) : null;
    out.push({
      milestone: m, status, reasons, evidence, occurred_at, occurrence_ref: status === 'eligible' ? ref : null,
      evidence_hash: stableHash(JSON.stringify([m, status, evidence.map((e) => [e.table, e.id, e.at]), occurred_at])),
    });
  };
  const baseBlock = (): { status: EvalStatus; reasons: string[] } | null => {
    if (exclusions.length) return { status: 'excluded', reasons: exclusions };
    if (!rulesConfigured(rules)) return { status: 'needs_review', reasons: ['No qualification rules configured for this client'] };
    if (!qEvidence.length) return { status: 'withheld', reasons: ['No verified qualification evidence', ...notes] };
    if (!datedQ.length) return { status: 'needs_review', reasons: notes };
    return null;
  };

  // 1. Verified qualified lead
  const b1 = baseBlock();
  if (b1) push('verified_qualified_lead', b1.status, b1.reasons, qEvidence, NaN, null);
  else push('verified_qualified_lead', 'eligible', ['Verified qualification evidence present', ...notes], qEvidence, qualifiedAt, `q:${firstQ.table}:${firstQ.id}`);

  // 2. Qualified booking = successful booking + qualification
  const bookings = calls.filter((c) => !c.is_reconnect && rules.booking_ok_statuses.includes(String(c.appointment_status || '').toLowerCase()) && (c.booked_at || c.scheduled_at));
  const b2 = baseBlock();
  if (b2) push('verified_qualified_booking', b2.status, b2.reasons, qEvidence, NaN, null);
  else if (!bookings.length) {
    const cancelled = calls.some((c) => /cancel/i.test(String(c.appointment_status || '')));
    push('verified_qualified_booking', 'withheld', [cancelled ? 'Booking was cancelled' : 'No successful booking on record'], qEvidence, NaN, null);
  } else {
    const bk = bookings.sort((a, b) => maxIso(a.booked_at, a.scheduled_at) - maxIso(b.booked_at, b.scheduled_at))[0];
    const bookedAt = new Date((bk.booked_at || bk.scheduled_at)!).getTime();
    const ev = [...qEvidence, { kind: 'booking', table: 'calls', id: bk.id, at: bk.booked_at || bk.scheduled_at || null, detail: `Booking ${bk.appointment_status}` }];
    push('verified_qualified_booking', 'eligible', ['Qualified and successfully booked'], ev, Math.max(bookedAt, qualifiedAt), `b:${bk.id}`);
  }

  // 3. Attended qualified call = attendance + qualification
  const attended = calls.filter((c) => {
    if (!c.showed || !c.showed_at) return false;
    if (/no.?show|cancel/i.test(String(c.appointment_status || ''))) return false;
    if (rules.attendance_requires_source && !c.attendance_source) return false;
    return true;
  });
  const b3 = baseBlock();
  if (b3) push('attended_qualified_call', b3.status, b3.reasons, qEvidence, NaN, null);
  else if (!attended.length) {
    const reasons = calls.some((c) => /no.?show/i.test(String(c.appointment_status || ''))) ? ['No-show is not attendance']
      : calls.some((c) => c.showed && !c.attendance_source && rules.attendance_requires_source) ? ['Marked showed but attendance has no source record — needs review']
      : ['No attended call on record'];
    push('attended_qualified_call', reasons[0].includes('needs review') ? 'needs_review' : 'withheld', reasons, qEvidence, NaN, null);
  } else {
    const a = attended.sort((x, y) => new Date(x.showed_at!).getTime() - new Date(y.showed_at!).getTime())[0];
    const ev = [...qEvidence, { kind: 'attendance', table: 'calls', id: a.id, at: a.showed_at!, detail: `Attended (${a.attendance_source || 'unknown source'})` }];
    push('attended_qualified_call', 'eligible', ['Qualified and attended'], ev, Math.max(new Date(a.showed_at!).getTime(), qualifiedAt), `a:${a.id}`);
  }

  // 4. Funded — internal only, never sent.
  const f = funded.filter((x) => x.is_verified_funded && x.funded_at);
  if (exclusions.length) push('verified_funded', 'excluded', exclusions, [], NaN, null);
  else if (!f.length) push('verified_funded', 'withheld', ['No verified funding record'], [], NaN, null);
  else push('verified_funded', 'eligible', ['Verified funding record (internal reporting only)'],
    [{ kind: 'funded', table: 'funded_investors', id: f[0].id, at: f[0].funded_at!, detail: 'Verified funded' }], new Date(f[0].funded_at!).getTime(), `f:${f[0].id}`);
  return out;
}

// ── Matching + payload ───────────────────────────────────────────────────────

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const normEmail = (e: string) => e.trim().toLowerCase();
/** Digits only with country code; US 10-digit numbers get the leading 1. */
export function normPhone(p: string): string | null {
  let d = p.replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
const normName = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}]/gu, '');

/** The ONLY lead fields ever read into a payload. */
export interface MatchInput { email?: string | null; phone?: string | null; name?: string | null; meta_lead_id?: string | null; fbc?: string | null; fbp?: string | null }

export function matchInputFromLead(lead: { email?: string | null; phone?: string | null; name?: string | null; custom_fields?: Record<string, any> | null; source?: string | null; external_id?: string | null }): MatchInput {
  const cf = lead.custom_fields || {};
  const metaLead = cf.meta_lead_id || cf.leadgen_id || cf.facebook_lead_id || null;
  return {
    email: lead.email, phone: lead.phone, name: lead.name,
    meta_lead_id: metaLead && /^\d{6,25}$/.test(String(metaLead)) ? String(metaLead) : null,
    fbc: typeof cf.fbc === 'string' && cf.fbc.startsWith('fb.') ? cf.fbc : null, // never synthesized from fbclid
    fbp: typeof cf.fbp === 'string' && cf.fbp.startsWith('fb.') ? cf.fbp : null,
  };
}

export const ALLOWED_EVENT_KEYS = ['event_name', 'event_time', 'event_id', 'action_source', 'user_data', 'custom_data'] as const;
export const ALLOWED_USER_DATA = ['em', 'ph', 'fn', 'ln', 'lead_id', 'fbc', 'fbp'] as const;
export const ALLOWED_CUSTOM_DATA = ['event_source', 'lead_event_source'] as const;
/** Meta rejects events with event_time older than 7 days. */
export const MAX_EVENT_AGE_SECONDS = 7 * 86400;

export async function buildMetaPayload(args: {
  eventName: string; eventTime: string; eventId: string; source: 'crm' | 'website'; match: MatchInput;
}): Promise<{ event: Record<string, any>; coverage: string[] }> {
  const ud: Record<string, any> = {};
  const coverage: string[] = [];
  if (validEmail(args.match.email)) { ud.em = [await sha256Hex(normEmail(args.match.email!))]; coverage.push('email'); }
  const ph = args.match.phone ? normPhone(args.match.phone) : null;
  if (ph) { ud.ph = [await sha256Hex(ph)]; coverage.push('phone'); }
  const parts = (args.match.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 1 && normName(parts[0])) { ud.fn = [await sha256Hex(normName(parts[0]))]; coverage.push('first_name'); }
  if (parts.length >= 2 && normName(parts[parts.length - 1])) { ud.ln = [await sha256Hex(normName(parts[parts.length - 1]))]; coverage.push('last_name'); }
  if (args.match.meta_lead_id) { ud.lead_id = args.match.meta_lead_id; coverage.push('meta_lead_id'); }
  if (args.match.fbc) { ud.fbc = args.match.fbc; coverage.push('fbc'); }
  if (args.match.fbp) { ud.fbp = args.match.fbp; coverage.push('fbp'); }
  const event: Record<string, any> = {
    event_name: args.eventName,
    event_time: Math.floor(new Date(args.eventTime).getTime() / 1000),
    event_id: args.eventId,
    action_source: args.source === 'crm' ? 'system_generated' : 'website',
    user_data: ud,
  };
  if (args.source === 'crm') event.custom_data = { event_source: 'crm', lead_event_source: 'Reporting 5.0' };
  return { event, coverage };
}

export function validatePayload(event: Record<string, any>, now: Date): string[] {
  const errs: string[] = [];
  for (const k of Object.keys(event)) if (!(ALLOWED_EVENT_KEYS as readonly string[]).includes(k)) errs.push(`Field not allowed: ${k}`);
  for (const k of Object.keys(event.user_data || {})) if (!(ALLOWED_USER_DATA as readonly string[]).includes(k)) errs.push(`Matching field not allowed: ${k}`);
  for (const k of Object.keys(event.custom_data || {})) if (!(ALLOWED_CUSTOM_DATA as readonly string[]).includes(k)) errs.push(`Custom field not allowed: ${k}`);
  if (!/^[A-Za-z][A-Za-z0-9_ ]{1,49}$/.test(String(event.event_name || ''))) errs.push('Invalid event name');
  if (!event.event_id) errs.push('Missing event id');
  if (!['system_generated', 'website'].includes(event.action_source)) errs.push('Unsupported action source');
  if (event.action_source === 'website') errs.push('Website event source needs a sanitized source URL and browser deduplication — not configured');
  const age = Math.floor(now.getTime() / 1000) - Number(event.event_time);
  if (!Number.isFinite(age) || age < -60) errs.push('Event time is in the future');
  else if (age > MAX_EVENT_AGE_SECONDS) errs.push('Milestone happened more than 7 days ago — too old to send (event time is never reset)');
  const ud = event.user_data || {};
  if (!ud.em && !ud.ph && !ud.lead_id && !ud.fbc) errs.push('No usable matching identifier');
  return errs;
}

export function maskPayload(event: Record<string, any>): Record<string, any> {
  const m = (v: any) => (Array.isArray(v) ? v.map((s: string) => `${String(s).slice(0, 6)}…`) : `${String(v).slice(0, 6)}…`);
  const ud = Object.fromEntries(Object.entries(event.user_data || {}).map(([k, v]) => [k, m(v)]));
  return { ...event, user_data: ud };
}

/** Stable per actual occurrence + destination + semantics. Rule version deliberately excluded. */
export async function idempotencyKey(p: { clientId: string; leadId: string; milestone: Milestone; occurrenceRef: string; datasetId: string; eventName: string }) {
  return 'qf_' + (await sha256Hex([p.clientId, p.leadId, p.milestone, p.occurrenceRef, p.datasetId, p.eventName].join('|'))).slice(0, 40);
}

// ── Gates + outbox ───────────────────────────────────────────────────────────

export interface GlobalGate { live_enabled: boolean; emergency_stop: boolean }
export interface ClientCfg {
  client_id: string; mode: Mode; milestone: Milestone; meta_event_name: string | null; event_source: 'crm' | 'website';
  destination_dataset_id: string | null; destination_verified: boolean; sharing_consent_status: 'unknown' | 'documented' | 'refused';
  live_activated_at: string | null;
}
export interface OutboxJob {
  id: string; client_id: string; lead_id: string; milestone: Milestone; occurrence_ref: string; idempotency_key: string;
  meta_event_name: string; event_time: string; destination_dataset_id: string; evidence_hash: string | null; status: string; attempts: number; is_test: boolean;
}

/** Only new live occurrences after explicit activation enter the outbox. Preview/historical never do. */
export function outboxEligibility(cfg: ClientCfg, r: MilestoneResult, runKind: string): string | null {
  if (runKind !== 'live') return 'Not a live evaluation';
  if (cfg.mode !== 'live') return 'Client is not Live';
  if (!cfg.live_activated_at) return 'Client has no activation record';
  if (r.milestone !== cfg.milestone) return 'Not the configured milestone';
  if (r.milestone === 'verified_funded') return 'Funded outcomes are internal only';
  if (r.status !== 'eligible' || !r.occurred_at || !r.occurrence_ref) return 'Not eligible';
  if (new Date(r.occurred_at) < new Date(cfg.live_activated_at)) return 'Occurred before activation — never replayed';
  if (!cfg.meta_event_name || !cfg.destination_dataset_id) return 'No event mapping or destination';
  return null;
}

export type GateDecision = { action: 'send' } | { action: 'hold' | 'cancel' | 'fail'; reason: string };

export function dispatchGate(g: GlobalGate, cfg: ClientCfg | null, job: OutboxJob, current: { status: EvalStatus; evidence_hash: string } | null, senderInstalled: boolean): GateDecision {
  if (g.emergency_stop) return { action: 'hold', reason: 'Global emergency stop' };
  if (!g.live_enabled) return { action: 'hold', reason: 'Global live gate disabled' };
  if (!cfg || cfg.client_id !== job.client_id) return { action: 'hold', reason: 'Client config missing' };
  if (cfg.mode !== 'live') return { action: 'hold', reason: 'Client paused or not Live' };
  if (!cfg.live_activated_at || new Date(job.event_time) < new Date(cfg.live_activated_at)) return { action: 'cancel', reason: 'Occurred before activation' };
  if (cfg.sharing_consent_status !== 'documented') return { action: 'hold', reason: 'Data-sharing eligibility not documented' };
  if (!cfg.destination_verified || cfg.destination_dataset_id !== job.destination_dataset_id) return { action: 'hold', reason: 'Destination changed or unverified' };
  if (cfg.meta_event_name !== job.meta_event_name || cfg.milestone !== job.milestone) return { action: 'hold', reason: 'Event mapping changed' };
  if (!current || current.status !== 'eligible') return { action: 'hold', reason: 'Lead no longer verified for this milestone' };
  if (job.evidence_hash && current.evidence_hash !== job.evidence_hash) return { action: 'hold', reason: 'Evidence changed since queued' };
  if (!senderInstalled) return { action: 'hold', reason: 'Live sender not installed' };
  return { action: 'send' };
}

export const MAX_ATTEMPTS = 6;
export const backoffSeconds = (attempt: number) => Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempt - 1));

export interface SendResult { httpStatus: number | null; body: any; networkError?: string }
export interface Sender { installed: boolean; send(datasetId: string, clientId: string, events: Record<string, any>[]): Promise<SendResult> }

/** Default sender: performs no I/O. A real sender is only constructed when explicitly installed. */
export const disabledSender: Sender = {
  installed: false,
  async send() { throw new Error('Live sender not installed'); },
};

export function classifySend(r: SendResult, attempts: number): { status: 'accepted' | 'failed_retryable' | 'failed_permanent'; error: string | null } {
  if (r.httpStatus && r.httpStatus >= 200 && r.httpStatus < 300 && Number(r.body?.events_received ?? 0) >= 1) return { status: 'accepted', error: null };
  const transient = r.networkError || r.httpStatus == null || r.httpStatus === 429 || r.httpStatus >= 500;
  const err = r.networkError || r.body?.error?.message || `HTTP ${r.httpStatus}`;
  if (transient && attempts < MAX_ATTEMPTS) return { status: 'failed_retryable', error: String(err).slice(0, 300) };
  return { status: 'failed_permanent', error: String(err).slice(0, 300) };
}

/** Strip tokens/PII-ish values from provider responses before storage. */
export function redactResponse(body: any): any {
  if (!body || typeof body !== 'object') return body ?? null;
  const keep: Record<string, any> = {};
  if ('events_received' in body) keep.events_received = body.events_received;
  if (body.fbtrace_id) keep.fbtrace_id = String(body.fbtrace_id);
  if (Array.isArray(body.messages)) keep.messages = body.messages.slice(0, 5).map((m: any) => String(m).slice(0, 200));
  if (body.error) keep.error = { code: body.error.code, type: body.error.type, message: String(body.error.message || '').replace(/access_token=[^&\s]+/g, 'access_token=[redacted]').slice(0, 300) };
  return keep;
}

export interface DispatchStore {
  claim(limit: number): Promise<OutboxJob[]>;
  global(): Promise<GlobalGate>;
  clientCfg(clientId: string): Promise<ClientCfg | null>;
  currentEval(leadId: string, milestone: Milestone): Promise<{ status: EvalStatus; evidence_hash: string } | null>;
  match(leadId: string, clientId: string): Promise<MatchInput | null>;
  update(id: string, patch: Record<string, any>): Promise<void>;
  attempt(row: Record<string, any>): Promise<void>;
}

export async function runDispatch(store: DispatchStore, sender: Sender, now = new Date(), limit = 50) {
  const tally = { claimed: 0, sent: 0, accepted: 0, held: 0, cancelled: 0, retry: 0, failed: 0 };
  const g = await store.global();
  // Cheap pre-check so Off/Preview/paused agencies never even claim jobs.
  if (g.emergency_stop || !g.live_enabled) return { ...tally, skipped: g.emergency_stop ? 'emergency_stop' : 'global_disabled' };
  const jobs = await store.claim(limit);
  tally.claimed = jobs.length;
  for (const job of jobs) {
    const cfg = await store.clientCfg(job.client_id);
    const cur = await store.currentEval(job.lead_id, job.milestone);
    const d = dispatchGate(g, cfg, job, cur, sender.installed);
    if (d.action !== 'send') {
      const status = d.action === 'cancel' ? 'cancelled' : d.action === 'fail' ? 'failed_permanent' : 'held';
      await store.update(job.id, { status, hold_reason: d.reason, lease_owner: null, lease_expires_at: null });
      if (status === 'held') tally.held++; else tally.cancelled++;
      continue;
    }
    const m = await store.match(job.lead_id, job.client_id);
    if (!m) { await store.update(job.id, { status: 'held', hold_reason: 'Lead not found for client', lease_owner: null }); tally.held++; continue; }
    const { event } = await buildMetaPayload({ eventName: job.meta_event_name, eventTime: job.event_time, eventId: job.idempotency_key, source: cfg!.event_source, match: m });
    const errs = validatePayload(event, now);
    if (errs.length) { await store.update(job.id, { status: 'failed_permanent', last_error: errs.join('; '), lease_owner: null }); tally.failed++; continue; }
    const attempts = job.attempts + 1;
    let r: SendResult;
    try { r = await sender.send(job.destination_dataset_id, job.client_id, [event]); tally.sent++; }
    catch (e) { r = { httpStatus: null, body: null, networkError: (e as Error).message }; }
    const c = classifySend(r, attempts);
    await store.attempt({ outbox_id: job.id, client_id: job.client_id, http_status: r.httpStatus, outcome: c.status, response_redacted: redactResponse(r.body ?? { error: { message: r.networkError } }) });
    await store.update(job.id, {
      status: c.status, attempts, last_error: c.error, lease_owner: null, lease_expires_at: null,
      receipt: c.status === 'accepted' ? redactResponse(r.body) : null,
      dispatched_at: c.status === 'accepted' ? now.toISOString() : null,
      next_attempt_at: new Date(now.getTime() + backoffSeconds(attempts) * 1000).toISOString(),
    });
    if (c.status === 'accepted') tally.accepted++; else if (c.status === 'failed_retryable') tally.retry++; else tally.failed++;
  }
  return tally;
}

// ── Measurement ──────────────────────────────────────────────────────────────
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
export function costPer(spend: number | null, count: number, coverageOk: boolean): number | null {
  if (spend == null || !coverageOk || count <= 0) return null; // show missing coverage, not a false zero
  return spend / count;
}
