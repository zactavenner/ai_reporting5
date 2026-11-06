/**
 * Weekly Client Report — pure core (no IO).
 *
 * Rules:
 *  - Window = last completed Mon–Sun in the client's reporting timezone, vs prior Mon–Sun.
 *  - Missing or conflicting data is `null` (rendered "Unavailable"), never 0.
 *  - Verified leads = unique CRM leads (dedupe email/phone), non-spam, with email AND phone.
 *    Meta form lead counts are reported separately and never mixed in.
 *  - Booked calls = calendar booking EVENTS in the week (deduped by appointment id),
 *    distinct from the lead-cohort conversion (leads created this week that booked).
 *  - Shows only from tracked calendars, past start time, showed=true. Off if not tracked.
 *  - Pipeline interest (prospect estimate) is separate from committed and funded.
 */

export type Metric = { value: number | null; note?: string; partial?: boolean };
export const NA = (note: string): Metric => ({ value: null, note });
export const M = (value: number): Metric => ({ value });

export interface WeekRange { from: string; to: string } // inclusive yyyy-MM-dd local dates

/** Local calendar date (yyyy-MM-dd) of an instant in an IANA timezone. */
export function localDate(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function weekday(ymd: string): number { // 0=Mon..6=Sun
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Last completed Mon–Sun week plus `count - 1` earlier weeks, newest first. */
export function completedWeeks(now: Date, tz: string, count = 4): WeekRange[] {
  const today = localDate(now, tz);
  const thisMonday = addDays(today, -weekday(today));
  const out: WeekRange[] = [];
  for (let i = 1; i <= count; i++) {
    const from = addDays(thisMonday, -7 * i);
    out.push({ from, to: addDays(from, 6) });
  }
  return out;
}

export const inRange = (ymd: string, r: WeekRange) => ymd >= r.from && ymd <= r.to;

export function normEmail(e?: string | null) { const v = (e || '').trim().toLowerCase(); return v.includes('@') ? v : ''; }
export function normPhone(p?: string | null) { const d = (p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }

export interface LeadRow { name?: string | null; id: string; client_id: string; created_at: string; email: string | null; phone: string | null; is_spam: boolean | null; status?: string | null; current_disposition?: string | null; opportunity_value?: number | null; pipeline_value?: number | null; }
export interface CallRow { id: string; client_id: string; lead_id: string | null; scheduled_at: string | null; booked_at: string | null; showed: boolean | null; appointment_status: string | null; ghl_appointment_id: string | null; ghl_calendar_id: string | null; is_reconnect: boolean | null; }
export interface SpendRow { client_id: string; date: string; ad_spend: number | null }
export interface FormLeadRow { client_id: string; date: string; leads: number | null }
export interface FundedRow { client_id: string; committed_at?: string | null; commitment_amount: number | null; funded_amount: number | null; funded_at: string | null; is_verified_funded: boolean | null; created_at?: string | null }
/** @deprecated cumulative totals — not used for weekly reports */
export interface AdRow { client_id: string; meta_ad_id: string; name: string | null; thumbnail_url: string | null; image_url: string | null; spend: number | null; attributed_leads: number | null; attributed_calls: number | null; attributed_funded: number | null; synced_at: string | null }

export interface ClientReportConfig {
  clientId: string;
  timezone: string;
  timezoneConfigured: boolean;
  isCapital: boolean;
  trackedCalendarIds: string[];
  raiseGoal: number | null;
  raiseDeadline: string | null;
  /** false = CRM never synced/unknown: CRM-derived counts are Unavailable, not zero. */
  crmConnected: boolean;
}

const BAD_DISPO = /(spam|invalid|test|duplicate|disqualif|wrong number|dnc)/i;

/** Throws if any row belongs to another client — hard isolation guard. */
export function assertIsolated(clientId: string, ...sets: { client_id: string }[][]) {
  for (const s of sets) for (const r of s) if (r.client_id !== clientId) throw new Error('cross-client row rejected');
}

export function verifiedLeads(leads: LeadRow[], r: WeekRange, tz: string): LeadRow[] {
  const seen = new Set<string>();
  const out: LeadRow[] = [];
  for (const l of [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!inRange(localDate(l.created_at, tz), r)) continue;
    if (l.is_spam || BAD_DISPO.test(l.current_disposition || '') || BAD_DISPO.test(l.status || '')) continue;
    if (!(l.name || '').trim() || /\btest\b/i.test(l.name || '')) continue;
    const e = normEmail(l.email), p = normPhone(l.phone);
    if (!e && !p) continue;
    if ((e && seen.has('e' + e)) || (p && seen.has('p' + p))) continue;
    if (e) seen.add('e' + e); if (p) seen.add('p' + p);
    out.push(l);
  }
  return out;
}

export interface WeekMetrics {
  range: WeekRange;
  spend: Metric; spendDaysCovered: number;
  verifiedLeads: Metric; metaFormLeads: Metric; cpl: Metric;
  bookedCalls: Metric; cpbc: Metric; cohortBooked: Metric;
  shows: Metric; costPerShow: Metric;
  committed: Metric; funded: Metric; pipelineInterest: Metric;
}

const div = (a: Metric, b: Metric): Metric =>
  a.value == null ? NA(a.note || 'Unavailable') : b.value == null ? NA(b.note || 'Unavailable') : b.value === 0 ? NA('No denominator')
    : { value: a.value / b.value, partial: a.partial || b.partial, note: a.partial ? a.note : b.note };

export function computeWeek(cfg: ClientReportConfig, r: WeekRange, d: { leads: LeadRow[]; calls: CallRow[]; spend: SpendRow[]; formLeads: FormLeadRow[]; funded: FundedRow[] }, now = new Date()): WeekMetrics {
  assertIsolated(cfg.clientId, d.leads, d.calls, d.spend, d.formLeads, d.funded);
  const tz = cfg.timezone;
  const spendRows = d.spend.filter((s) => inRange(s.date, r) && s.ad_spend != null);
  const days = new Set(spendRows.map((s) => s.date)).size;
  const spendTotal = spendRows.reduce((a, s) => a + Number(s.ad_spend || 0), 0);
  const spend: Metric = days === 0 ? NA('No synced spend for this week')
    : days < 7 ? { value: spendTotal, partial: true, note: `Partial: ${days}/7 days synced` } : M(spendTotal);

  const vl = verifiedLeads(d.leads, r, tz);
  const crmNA = NA('CRM not connected or never synced');
  const vLeads = cfg.crmConnected ? M(vl.length) : crmNA;
  const fl = d.formLeads.filter((f) => inRange(f.date, r) && f.leads != null);
  const metaFormLeads = fl.length ? M(fl.reduce((a, f) => a + Number(f.leads || 0), 0)) : NA('No Meta form counts');

  const tracked = new Set(cfg.trackedCalendarIds);
  const calls = d.calls.filter((c) => !c.is_reconnect && (tracked.size === 0 || (c.ghl_calendar_id && tracked.has(c.ghl_calendar_id))));
  const seenAppt = new Set<string>();
  let booked = 0;
  for (const c of calls) {
    const at = c.booked_at; if (!at || !inRange(localDate(at, tz), r)) continue;
    const k = c.ghl_appointment_id || c.id; if (seenAppt.has(k)) continue; seenAppt.add(k); booked++;
  }
  const vlIds = new Set(vl.map((l) => l.id));
  const cohort = new Set(d.calls.filter((c) => c.lead_id && vlIds.has(c.lead_id)).map((c) => c.lead_id)).size;

  let shows: Metric;
  if (!cfg.crmConnected) shows = crmNA;
  else if (tracked.size === 0) shows = NA('Show tracking off — no tracked calendars configured');
  else {
    const seen = new Set<string>(); let n = 0;
    for (const c of calls) {
      if (!c.scheduled_at || new Date(c.scheduled_at) > now || !inRange(localDate(c.scheduled_at, tz), r)) continue;
      const st = (c.appointment_status || '').toLowerCase();
      if (c.showed !== true || !(st === 'showed' || st === 'completed')) continue;
      const k = c.ghl_appointment_id || c.id; if (seen.has(k)) continue; seen.add(k); n++;
    }
    shows = M(n);
  }

  const fundedInWeek = d.funded.filter((f) => f.is_verified_funded && f.funded_at && inRange(localDate(f.funded_at, tz), r));
  const funded = !cfg.isCapital ? NA('Not a capital account') : !cfg.crmConnected ? crmNA : M(fundedInWeek.reduce((a, f) => a + Number(f.funded_amount || 0), 0));
  // A commitment is dated only by committed_at — never by funded_at or created_at.
  const datedCommitments = d.funded.filter((f) => f.committed_at && Number(f.commitment_amount || 0) > 0);
  const committed = !cfg.isCapital ? NA('Not a capital account')
    : datedCommitments.length === 0 ? NA('No dated commitment records')
    : M(datedCommitments.filter((f) => inRange(localDate(f.committed_at!, tz), r)).reduce((a, f) => a + Number(f.commitment_amount || 0), 0));
  const piVals = vl.map((l) => Number(l.opportunity_value ?? l.pipeline_value ?? 0)).filter((v) => v > 0);
  const pipelineInterest = piVals.length ? M(piVals.reduce((a, v) => a + v, 0)) : NA('No stated interest on verified leads');

  return {
    range: r, spend, spendDaysCovered: days,
    verifiedLeads: vLeads, metaFormLeads, cpl: div(spend, vLeads),
    bookedCalls: cfg.crmConnected ? M(booked) : crmNA, cpbc: div(spend, cfg.crmConnected ? M(booked) : crmNA), cohortBooked: cfg.crmConnected ? M(cohort) : crmNA,
    shows, costPerShow: div(spend, shows),
    committed, funded, pipelineInterest,
  };
}

export function pctChange(cur: Metric, prev: Metric): number | null {
  if (cur.value == null || prev.value == null || prev.value === 0) return null;
  return (cur.value - prev.value) / prev.value;
}

export interface AdDailyRow { client_id: string; date: string; meta_ad_id: string; spend: number | null; leads: number | null }
export interface AdMetaRow { client_id: string; meta_ad_id: string; name: string | null; thumbnail_url: string | null; image_url: string | null }

/** Top creatives for the report week, from per-ad daily insights. Names/images joined from scoped meta_ads. */
export function topCreatives(daily: AdDailyRow[], meta: AdMetaRow[], clientId: string, r: WeekRange, limit = 6) {
  assertIsolated(clientId, daily, meta);
  const info = new Map(meta.map((m) => [m.meta_ad_id, m]));
  const agg = new Map<string, { spend: number; leads: number; days: Set<string> }>();
  for (const d of daily) {
    if (!inRange(d.date, r)) continue;
    const a = agg.get(d.meta_ad_id) || { spend: 0, leads: 0, days: new Set<string>() };
    a.spend += Number(d.spend || 0); a.leads += Number(d.leads || 0); a.days.add(d.date);
    agg.set(d.meta_ad_id, a);
  }
  return [...agg.entries()].filter(([, a]) => a.spend > 0).sort((x, y) => y[1].spend - x[1].spend).slice(0, limit).map(([id, a]) => {
    const m = info.get(id);
    return { id, name: m?.name || 'Untitled ad', image: m?.image_url || m?.thumbnail_url || null, spend: a.spend, leads: a.leads, cpl: a.leads ? a.spend / a.leads : null };
  });
}

export type CheckLevel = 'ok' | 'warn' | 'block';
export interface ReadinessCheck { key: string; label: string; level: CheckLevel; detail: string; fix?: 'connections' | 'settings' | 'recipients' }

export interface ReadinessInput {
  hasMetaAccount: boolean; spendSyncOk: boolean | null; hasGhlLocation: boolean; crmSyncOk: boolean | null;
  timezoneConfigured: boolean; trackedCalendars: number; isCapital: boolean;
  hasFundedMapping: boolean; raiseGoal: number | null; lastSpendDate: string | null; lastCrmSync: string | null;
  weekEnd: string; approvedRecipients: number;
}

export function readiness(i: ReadinessInput, now = new Date()): ReadinessCheck[] {
  const c: ReadinessCheck[] = [];
  c.push(i.hasMetaAccount ? { key: 'meta', label: 'Ad account', level: 'ok', detail: 'Linked' } : { key: 'meta', label: 'Ad account', level: 'block', detail: 'No ad account ID', fix: 'connections' });
  c.push(i.spendSyncOk === true ? { key: 'metaToken', label: 'Ads access', level: 'ok', detail: 'Last spend sync succeeded' } : i.spendSyncOk === false ? { key: 'metaToken', label: 'Ads access', level: 'block', detail: 'Last spend sync failed', fix: 'connections' } : { key: 'metaToken', label: 'Ads access', level: 'warn', detail: 'Unknown — no sync health recorded', fix: 'connections' });
  c.push(!i.hasGhlLocation ? { key: 'crm', label: 'CRM', level: 'block', detail: 'CRM location ID missing', fix: 'connections' }
    : i.crmSyncOk === true ? { key: 'crm', label: 'CRM', level: 'ok', detail: 'Linked, sync healthy' }
    : i.crmSyncOk === false ? { key: 'crm', label: 'CRM', level: 'block', detail: 'Sync reporting errors', fix: 'connections' }
    : { key: 'crm', label: 'CRM', level: 'warn', detail: 'Linked; access unknown', fix: 'connections' });
  c.push(i.timezoneConfigured ? { key: 'tz', label: 'Timezone', level: 'ok', detail: 'Configured' } : { key: 'tz', label: 'Timezone', level: 'warn', detail: 'Not set — using Pacific', fix: 'settings' });
  c.push(i.trackedCalendars > 0 ? { key: 'cal', label: 'Calendars', level: 'ok', detail: `${i.trackedCalendars} tracked` } : { key: 'cal', label: 'Calendars', level: 'warn', detail: 'None tracked — shows unavailable, bookings use all calendars', fix: 'settings' });
  if (i.isCapital) {
    c.push(i.hasFundedMapping ? { key: 'funded', label: 'Funded mapping', level: 'ok', detail: 'Pipeline stages mapped' } : { key: 'funded', label: 'Funded mapping', level: 'warn', detail: 'No funded/committed stages mapped', fix: 'settings' });
    c.push(i.raiseGoal ? { key: 'raise', label: 'Raise goal', level: 'ok', detail: 'Configured' } : { key: 'raise', label: 'Raise goal', level: 'warn', detail: 'Raise progress hidden', fix: 'settings' });
  }
  const stale = (d: string | null, days: number) => !d || (now.getTime() - new Date(d).getTime()) / 86400000 > days;
  c.push(!i.lastSpendDate ? { key: 'spendFresh', label: 'Spend data', level: 'block', detail: 'Never synced' } : i.lastSpendDate < i.weekEnd ? { key: 'spendFresh', label: 'Spend data', level: 'warn', detail: `Last day ${i.lastSpendDate} — week incomplete` } : { key: 'spendFresh', label: 'Spend data', level: 'ok', detail: `Through ${i.lastSpendDate}` });
  c.push(stale(i.lastCrmSync, 2) ? { key: 'crmFresh', label: 'CRM data', level: 'warn', detail: i.lastCrmSync ? 'Last sync over 2 days ago' : 'Never synced' } : { key: 'crmFresh', label: 'CRM data', level: 'ok', detail: 'Fresh' });
  c.push(i.approvedRecipients > 0 ? { key: 'recip', label: 'Recipients', level: 'ok', detail: `${i.approvedRecipients} weekly email recipient(s)` } : { key: 'recip', label: 'Recipients', level: 'warn', detail: 'No approved weekly recipients', fix: 'recipients' });
  return c;
}

/** Live delivery gate. Weekly PDF dispatch ships disarmed; every check must pass AND it must be armed. */
export function liveDeliveryGate(checks: ReadinessCheck[], armed: boolean): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!armed) reasons.push('Weekly report delivery is not armed');
  for (const c of checks) if (c.level === 'block' || c.key === 'recip' && c.level !== 'ok' || c.key === 'spendFresh' && c.level !== 'ok') reasons.push(`${c.label}: ${c.detail}`);
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Code-level arm switch for weekly PDF delivery. Delivery also needs the server env flag
 * WEEKLY_REPORT_DELIVERY_ARMED=true, the staged ledger (supabase/staged/) applied and the
 * private PDF bucket created — see supabase/staged/README.md. Keep false until reviewed.
 */
export const WEEKLY_REPORT_DISPATCH_ARMED = false;

/** Idempotency key for a future send — one per client/week/recipient/channel. */
export const sendKey = (clientId: string, weekFrom: string, recipientId: string, channel: string) => `weekly-pdf:${clientId}:${weekFrom}:${recipientId}:${channel}`;
