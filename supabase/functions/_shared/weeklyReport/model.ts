/**
 * Weekly Client Report — data loader + report model, shared by the browser
 * screen and the server renderer/dispatcher so both use identical rules.
 * Takes any supabase-js client (RLS browser client or server service client).
 * Reads only. Never selects key/token columns.
 */
import {
  completedWeeks, computeWeek, readiness, topCreatives, liveDeliveryGate, localDate, verifiedLeads, assertIsolated,
  WEEKLY_REPORT_DISPATCH_ARMED, rangeDays, priorRange, dailyRows, capitalEvents, inRange,
  type ClientReportConfig, type ReadinessCheck, type WeekMetrics, type WeekRange, type DayRow, type CapitalEvent, type Metric,
} from './core.ts';

export const DEFAULT_TZ = 'America/Los_Angeles';

export interface RosterEntry {
  id: string; name: string; status: string; industry: string | null;
  config: ClientReportConfig; checks: ReadinessCheck[]; gate: { allowed: boolean; reasons: string[] };
}

export interface WeeklyClientReport {
  clientId: string; clientName: string; config: ClientReportConfig;
  weeks: WeekMetrics[]; // newest first: [current, prior, ...]
  creatives: ReturnType<typeof topCreatives>; creativeDays: number;
  raise: { goal: number | null; fundedToDate: number | null; deadline: string | null };
  quality: { total: number | null; spam: number | null; incomplete: number | null; duplicates: number | null; verified: number | null };
  exceptions: string[]; // internal only — never rendered in client copy
}

export function isValidTz(tz?: string | null) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function buildClientConfig(c: any, s: any): ClientReportConfig {
  const tz = s?.stats_report_timezone || s?.weekly_sync_timezone;
  const isCapital = /capital/i.test(c.industry || '') || !!s?.total_raise_amount || !!(s?.funded_stage_ids?.length || s?.hubspot_funded_stage_ids?.length);
  return {
    clientId: c.id,
    timezone: isValidTz(tz) ? tz : DEFAULT_TZ,
    timezoneConfigured: isValidTz(tz),
    isCapital,
    trackedCalendarIds: s?.tracked_calendar_ids || [],
    raiseGoal: s?.total_raise_amount ? Number(s.total_raise_amount) : null,
    raiseDeadline: s?.raise_deadline || null,
    crmConnected: !!(c.last_ghl_sync_at || c.last_hubspot_sync_at),
  };
}

// IDs and sync-health columns only — no key/token columns are ever selected.
export const ROSTER_CLIENT_COLUMNS = 'id,name,status,industry,meta_ad_account_id,meta_ad_account_ids,consecutive_meta_failures,consecutive_ghl_failures,ghl_location_id,last_ghl_sync_at,hubspot_portal_id,last_hubspot_sync_at';
const SETTINGS_COLUMNS = 'client_id,stats_report_timezone,weekly_sync_timezone,tracked_calendar_ids,total_raise_amount,raise_deadline,funded_stage_ids,committed_stage_ids,hubspot_funded_stage_ids';

/** Approved weekly email recipient: same client, active, not unsubscribed, weekly cadence, email channel. */
export function isApprovedWeeklyRecipient(r: any, clientId: string) {
  return r.client_id === clientId && r.active === true && !r.unsubscribed_at
    && (r.cadences || []).includes('weekly') && (r.channels || []).includes('email');
}

/** Every active client from the authoritative `clients` roster — no hardcoded list. */
export async function loadRoster(sb: any, now = new Date(), onlyClientId?: string): Promise<RosterEntry[]> {
  let q = sb.from('clients').select(ROSTER_CLIENT_COLUMNS).eq('status', 'active').order('name');
  if (onlyClientId) q = q.eq('id', onlyClientId);
  const { data: clients, error } = await q;
  if (error) throw error;
  const ids = (clients || []).map((c: any) => c.id);
  if (!ids.length) return [];
  const [settings, recips, spend] = await Promise.all([
    sb.from('client_settings').select(SETTINGS_COLUMNS).in('client_id', ids),
    // Presence/flags only — contact addresses are not selected here.
    sb.from('client_report_recipients').select('id,client_id,channels,cadences,active,unsubscribed_at').in('client_id', ids),
    sb.from('daily_metrics').select('client_id,date').in('client_id', ids).not('ad_spend', 'is', null)
      .gte('date', new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)).order('date', { ascending: false }).limit(5000),
  ]);
  for (const r of [settings, recips, spend]) if (r.error) throw r.error;
  const sBy = new Map<string, any>((settings.data || []).map((s: any) => [s.client_id, s]));
  const lastSpend = new Map<string, string>();
  for (const r of spend.data || []) if (!lastSpend.has(r.client_id)) lastSpend.set(r.client_id, r.date);
  return (clients || []).map((c: any) => {
    const s = sBy.get(c.id);
    const config = buildClientConfig(c, s);
    const week = completedWeeks(now, config.timezone, 1)[0];
    const approved = (recips.data || []).filter((r: any) => isApprovedWeeklyRecipient(r, c.id)).length;
    const checks = readiness({
      hasMetaAccount: !!(c.meta_ad_account_id || c.meta_ad_account_ids?.length),
      spendSyncOk: (c.consecutive_meta_failures || 0) > 0 ? false : lastSpend.has(c.id) ? true : null,
      hasGhlLocation: !!c.ghl_location_id || !!c.hubspot_portal_id,
      crmSyncOk: (c.consecutive_ghl_failures || 0) > 0 ? false : (c.last_ghl_sync_at || c.last_hubspot_sync_at) ? true : null,
      timezoneConfigured: config.timezoneConfigured,
      trackedCalendars: config.trackedCalendarIds.length,
      isCapital: config.isCapital,
      hasFundedMapping: !!(s?.funded_stage_ids?.length || s?.committed_stage_ids?.length || s?.hubspot_funded_stage_ids?.length),
      raiseGoal: config.raiseGoal,
      lastSpendDate: lastSpend.get(c.id) || null,
      lastCrmSync: c.last_ghl_sync_at || c.last_hubspot_sync_at || null,
      weekEnd: week.to,
      approvedRecipients: approved,
    }, now);
    return { id: c.id, name: c.name, status: c.status, industry: c.industry, config, checks, gate: liveDeliveryGate(checks, WEEKLY_REPORT_DISPATCH_ARMED) };
  });
}

export interface ReportRows {
  leads: any[]; calls: any[]; spend: any[]; formLeads: any[]; funded: any[]; adDaily: any[]; adMeta: any[];
}

/** Pure: rows → report model. Rejects any row from another client. */
export function buildReportModel(entry: RosterEntry, rows: ReportRows, now = new Date()): WeeklyClientReport {
  const cfg = entry.config; const id = entry.id;
  assertIsolated(id, rows.leads, rows.calls, rows.spend, rows.formLeads, rows.funded, rows.adDaily, rows.adMeta);
  const weeks = completedWeeks(now, cfg.timezone, 4);
  const data = { leads: rows.leads, calls: rows.calls, spend: rows.spend, formLeads: rows.formLeads, funded: rows.funded };
  const metrics = weeks.map((w) => computeWeek(cfg, w, data, now));
  const cur = metrics[0];
  const adDays = new Set(rows.adDaily.filter((a) => a.date >= weeks[0].from && a.date <= weeks[0].to).map((a) => a.date)).size;

  const exceptions: string[] = [];
  if (cur.spendDaysCovered < 7) exceptions.push(`Spend covers ${cur.spendDaysCovered}/7 days`);
  if (cur.metaFormLeads.value != null && cur.verifiedLeads.value != null && Math.abs(cur.metaFormLeads.value - cur.verifiedLeads.value) > Math.max(3, cur.metaFormLeads.value * 0.2))
    exceptions.push(`Meta form leads (${cur.metaFormLeads.value}) differ from verified CRM leads (${cur.verifiedLeads.value})`);
  if (!cfg.crmConnected) exceptions.push('CRM never synced — CRM metrics unavailable');
  if (adDays < 7) exceptions.push(`Per-ad insights cover ${adDays}/7 days`);
  if (cur.shows.value == null) exceptions.push('Shows unavailable — configure tracked calendars');
  for (const c of entry.checks) if (c.level !== 'ok') exceptions.push(`${c.label}: ${c.detail}`);

  const wk = rows.leads.filter((l) => { const d = localDate(l.created_at, cfg.timezone); return d >= weeks[0].from && d <= weeks[0].to; });
  const spam = wk.filter((l) => l.is_spam).length;
  const incomplete = wk.filter((l) => !l.is_spam && (!(l.name || '').trim() || (!l.email && !l.phone))).length;
  const verified = verifiedLeads(rows.leads, weeks[0], cfg.timezone).length;
  const fundedToDate = cfg.isCapital && cfg.crmConnected
    ? rows.funded.filter((f) => f.is_verified_funded).reduce((a, f) => a + Number(f.funded_amount || 0), 0) : null;
  const crm = cfg.crmConnected;
  return {
    clientId: id, clientName: entry.name, config: cfg, weeks: metrics,
    creatives: topCreatives(rows.adDaily, rows.adMeta, id, weeks[0], 6),
    creativeDays: adDays,
    raise: { goal: cfg.raiseGoal, fundedToDate, deadline: cfg.raiseDeadline },
    quality: crm
      ? { total: wk.length, spam, incomplete, verified, duplicates: Math.max(0, wk.length - spam - incomplete - verified) }
      : { total: null, spam: null, incomplete: null, verified: null, duplicates: null },
    exceptions,
  };
}

/** Reads all rows for one client, every query scoped by client_id. */
export async function loadReportRows(sb: any, entry: RosterEntry, now = new Date()): Promise<ReportRows> {
  const weeks = completedWeeks(now, entry.config.timezone, 4);
  return loadRowsBetween(sb, entry, weeks[3].from, weeks[0].to, weeks[0]);
}

/** Rows for any custom range plus its prior equal-length period. */
export async function loadRangeRows(sb: any, entry: RosterEntry, range: WeekRange): Promise<ReportRows> {
  return loadRowsBetween(sb, entry, priorRange(range).from, range.to, range);
}

// ---------------------------------------------------------------------------
// Custom-range client report (Analytics → Reporting)

export type AttentionTone = 'alert' | 'watch' | 'good';
export interface AttentionItem { tone: AttentionTone; title: string; detail: string; source: 'system' | 'ai' | 'agent' | 'human'; author?: string }

export interface RangeReport {
  clientId: string; clientName: string; config: ClientReportConfig;
  range: WeekRange; prior: WeekRange; days: number;
  cur: WeekMetrics; prev: WeekMetrics; daily: DayRow[];
  raise: { goal: number | null; fundedToDate: number | null; fundedInvestors: number | null; remaining: number | null; deadline: string | null; verbalAmount: number | null; verbalCount: number | null };
  activity: CapitalEvent[];
  creatives: ReturnType<typeof topCreatives>; creativeDays: number;
  attention: AttentionItem[];
  sources: string[];
}

const pct = (v: number) => `${Math.abs(Math.round(v * 100))}%`;

/** Rule-based attention items computed from the same verified numbers the report shows. */
export function systemAttention(entry: RosterEntry, r: Omit<RangeReport, 'attention'>): AttentionItem[] {
  const out: AttentionItem[] = [];
  const add = (tone: AttentionTone, title: string, detail: string) => out.push({ tone, title, detail, source: 'system' });
  const check = (k: string) => entry.checks.find((c) => c.key === k);
  const { cur, prev, days } = r;
  if (check('meta')?.level === 'block') add('alert', 'No ad account linked', 'Spend, CPL and creative results can’t be reported until an ad account is linked.');
  else if (check('metaToken')?.level === 'block') add('alert', 'Ad account access failing', 'The last spend sync failed. Spend, CPL and creative performance are unverified for this period.');
  if (cur.spend.value == null) add('alert', 'No spend data for this period', 'Spend is shown as N/A rather than $0.');
  else if (cur.spend.partial) add('watch', `Spend covers ${cur.spendDaysCovered}/${days} days`, 'Totals and cost metrics are partial for the selected period.');
  if (!r.config.crmConnected) add('alert', 'CRM not syncing', 'Leads, booked calls, shows and funding are unavailable until the CRM syncs.');
  else if (check('crm')?.level === 'block') add('alert', 'CRM sync reporting errors', 'CRM-based figures may be incomplete.');
  if (cur.shows.value == null && r.config.crmConnected) add('watch', 'Show tracking off', 'Pick the tracked calendars in client settings to report shows and cost per show.');
  if (cur.metaFormLeads.value != null && cur.verifiedLeads.value != null && Math.abs(cur.metaFormLeads.value - cur.verifiedLeads.value) > Math.max(3, cur.metaFormLeads.value * 0.2))
    add('watch', 'Meta leads don’t match CRM', `Meta reported ${cur.metaFormLeads.value} form leads; ${cur.verifiedLeads.value} verified leads reached the CRM.`);
  if ((cur.spend.value || 0) > 0 && cur.verifiedLeads.value === 0) add('alert', 'Spend with zero verified leads', 'Check the form → CRM connection and lead routing.');
  const full = (m: Metric) => m.value != null && !m.partial;
  if (full(cur.cpl) && full(prev.cpl) && prev.cpl.value! > 0) {
    const ch = (cur.cpl.value! - prev.cpl.value!) / prev.cpl.value!;
    if (ch <= -0.15) add('good', `Cost per lead down ${pct(ch)}`, `$${cur.cpl.value!.toFixed(2)} vs $${prev.cpl.value!.toFixed(2)} the prior period.`);
    else if (ch >= 0.25) add('watch', `Cost per lead up ${pct(ch)}`, `$${cur.cpl.value!.toFixed(2)} vs $${prev.cpl.value!.toFixed(2)} the prior period.`);
  }
  if ((cur.verifiedLeads.value || 0) >= 10 && cur.bookedCalls.value != null && cur.bookedCalls.value / cur.verifiedLeads.value! < 0.1)
    add('watch', 'Low booking rate', `${cur.bookedCalls.value} booked from ${cur.verifiedLeads.value} verified leads.`);
  if (r.creativeDays > 0 && r.creativeDays < days) add('watch', `Per-ad data covers ${r.creativeDays}/${days} days`, 'Creative results are partial.');
  if (!out.some((o) => o.tone !== 'good')) add('good', 'All sources reporting', 'Spend and CRM data are complete for the selected period.');
  return out;
}

export function buildRangeReport(entry: RosterEntry, rows: ReportRows, range: WeekRange, now = new Date()): RangeReport {
  const cfg = entry.config; const id = entry.id;
  assertIsolated(id, rows.leads, rows.calls, rows.spend, rows.formLeads, rows.funded, rows.adDaily, rows.adMeta);
  const prior = priorRange(range);
  const data = { leads: rows.leads, calls: rows.calls, spend: rows.spend, formLeads: rows.formLeads, funded: rows.funded };
  const cur = computeWeek(cfg, range, data, now), prev = computeWeek(cfg, prior, data, now);
  const daily = dailyRows(cfg, range, data, now);
  const creativeDays = new Set(rows.adDaily.filter((a) => inRange(a.date, range)).map((a) => a.date)).size;
  const verified = rows.funded.filter((f) => f.is_verified_funded && Number(f.funded_amount || 0) > 0);
  const verbal = rows.funded.filter((f) => Number(f.commitment_amount || 0) > 0 && !(f.is_verified_funded && Number(f.funded_amount || 0) > 0));
  const capOk = cfg.isCapital && cfg.crmConnected;
  const fundedToDate = capOk ? verified.reduce((a, f) => a + Number(f.funded_amount), 0) : null;
  const base: Omit<RangeReport, 'attention'> = {
    clientId: id, clientName: entry.name, config: cfg, range, prior, days: rangeDays(range), cur, prev, daily,
    raise: {
      goal: cfg.raiseGoal, fundedToDate, fundedInvestors: capOk ? verified.length : null,
      remaining: cfg.raiseGoal != null && fundedToDate != null ? Math.max(0, cfg.raiseGoal - fundedToDate) : null,
      deadline: cfg.raiseDeadline,
      verbalAmount: capOk ? verbal.reduce((a, f) => a + Number(f.commitment_amount), 0) : null,
      verbalCount: capOk ? verbal.length : null,
    },
    activity: capitalEvents(cfg, rows.funded, range),
    creatives: topCreatives(rows.adDaily, rows.adMeta, id, range, 6),
    creativeDays,
    sources: [entry.checks.find((c) => c.key === 'meta')?.level === 'ok' ? 'Meta Ads' : null, cfg.crmConnected ? 'CRM pipeline' : null].filter(Boolean) as string[],
  };
  return { ...base, attention: systemAttention(entry, base) };
}

/** Compact, PII-free facts for AI and external-agent review (no names, emails or phones). */
export function reportFacts(r: RangeReport) {
  const m = (x: Metric) => (x.value == null ? { value: null, note: x.note } : { value: Math.round(x.value * 100) / 100, partial: !!x.partial });
  const pick = (w: WeekMetrics) => ({ spend: m(w.spend), verified_leads: m(w.verifiedLeads), meta_form_leads: m(w.metaFormLeads), cpl: m(w.cpl), booked: m(w.bookedCalls), cpbc: m(w.cpbc), shows: m(w.shows), cost_per_show: m(w.costPerShow), committed: m(w.committed), funded: m(w.funded) });
  return {
    client: r.clientName, is_capital: r.config.isCapital, timezone: r.config.timezone,
    period: r.range, prior_period: r.prior, current: pick(r.cur), prior: pick(r.prev),
    daily: r.daily, raise: r.raise,
    capital_activity: r.activity.map((a) => ({ kind: a.kind, date: a.date, amount: a.amount })),
    creatives: r.creatives.map((c) => ({ name: c.name, spend: c.spend, leads: c.leads, cpl: c.cpl })),
    creative_days_covered: r.creativeDays,
    system_flags: r.attention.map(({ tone, title, detail }) => ({ tone, title, detail })),
  };
}

/** Short stable hash of the facts, so a review can be flagged once the data changes. */
export async function factsHash(facts: unknown) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(facts)));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadRowsBetween(sb: any, entry: RosterEntry, from: string, to: string, adRange: WeekRange): Promise<ReportRows> {
  const id = entry.id;
  const weeks = [adRange];
  const fromTs = new Date(Date.parse(from) - 2 * 86400000).toISOString();
  const toTs = new Date(Date.parse(to) + 2 * 86400000).toISOString();
  const [leads, calls, spend, form, funded, ads] = await Promise.all([
    sb.from('leads').select('id,client_id,name,created_at,email,phone,is_spam,status,current_disposition,opportunity_value,pipeline_value').eq('client_id', id).gte('created_at', fromTs).lte('created_at', toTs).limit(5000),
    sb.from('calls').select('id,client_id,lead_id,scheduled_at,booked_at,showed,appointment_status,ghl_appointment_id,ghl_calendar_id,is_reconnect').eq('client_id', id).or(`booked_at.gte.${fromTs},scheduled_at.gte.${fromTs}`).limit(5000),
    sb.from('daily_metrics').select('client_id,date,ad_spend').eq('client_id', id).gte('date', from).lte('date', to),
    sb.from('ad_spend_daily').select('client_id,date,leads').eq('client_id', id).gte('date', from).lte('date', to),
    sb.from('funded_investors').select('client_id,name,commitment_amount,committed_at,funded_amount,funded_at,is_verified_funded').eq('client_id', id).limit(5000),
    sb.from('meta_ad_daily_insights').select('client_id,date,meta_ad_id,spend,leads').eq('client_id', id).gte('date', weeks[0].from).lte('date', weeks[0].to).limit(10000),
  ]);
  for (const r of [leads, calls, spend, form, funded, ads]) if (r.error) throw r.error;
  const adIds = [...new Set((ads.data || []).map((a: any) => a.meta_ad_id))].slice(0, 500);
  let adMeta: any[] = [];
  if (adIds.length) {
    const m = await sb.from('meta_ads').select('client_id,meta_ad_id,name,thumbnail_url,image_url').eq('client_id', id).in('meta_ad_id', adIds);
    if (m.error) throw m.error;
    adMeta = m.data || [];
  }
  return { leads: leads.data || [], calls: calls.data || [], spend: spend.data || [], formLeads: form.data || [], funded: funded.data || [], adDaily: ads.data || [], adMeta };
}
