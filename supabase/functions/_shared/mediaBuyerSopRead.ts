/**
 * Shared read adapter for the Capital Raising SOP review.
 *
 * Used by BOTH the prepared media-buyer-sop-review edge function and the
 * read-only preview UI, so the two can never disagree about columns, ranges,
 * truncation or blockers. Pure TypeScript: no Deno APIs, no imports beyond the
 * rules module; the caller passes in a supabase-like client.
 *
 * Only columns that actually exist in the live schema are selected. Verified
 * against information_schema:
 *  - clients(id, name, status, meta_ad_account_id)
 *  - client_settings(client_id, stats_report_timezone)
 *  - client_kpi_targets(client_id, max_daily_budget, autonomy_mode, guardrails)
 *  - meta_ad_accounts(ad_account_id, timezone_name, account_name, assets_synced_at)
 *  - daily_metrics(client_id, date, date_account_tz, ad_spend, impressions,
 *    clicks, leads, funded_dollars, commitment_dollars)
 *  - meta_ads: has NO daily_budget and NO per-day rows (lifetime aggregates
 *    only), so no ad-level window can be built from it. Reported as a gap.
 */
import {
  addDays,
  assessClient,
  daysBetween,
  enumerateDates,
  monthWindow,
  resolveTimezone,
  todayInTz,
  type AssessClientInput,
  type ClientSopReport,
  type KpiTargetRow,
  type MonthWindow,
  type TimezoneResolution,
  type Window,
} from './mediaBuyerSop.ts';

export interface SupabaseLike {
  from(table: string): any;
}

/** Hard row cap per source read. Exceeding it is reported as truncation. */
export const ROW_CAP = 2000;

const UNAVAILABLE_FREQUENCY = {
  available: false as const,
  reason: 'aggregate unique-reach frequency is not directly sourced by any connected table',
};

export interface DailyRow {
  client_id: string;
  date: string | null;
  date_account_tz: string | null;
  ad_spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  funded_dollars: number | null;
  commitment_dollars: number | null;
}

export const DAILY_METRICS_COLUMNS =
  'client_id, date, date_account_tz, ad_spend, impressions, clicks, leads, funded_dollars, commitment_dollars';

/**
 * Sums a column with fail-closed semantics: a null, NaN or negative value makes
 * the whole sum unavailable rather than silently contributing zero.
 */
export function sumStrict(rows: DailyRow[], key: keyof DailyRow): number | null {
  let acc = 0;
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    acc += n;
  }
  return Math.round(acc * 100) / 100;
}

export function rowDate(r: DailyRow): string | null {
  const d = r.date_account_tz ?? r.date;
  return typeof d === 'string' && d.length >= 10 ? d.slice(0, 10) : null;
}

export interface LoadedClientSop {
  report: ClientSopReport | null;
  /** Set when the review cannot even be attempted (client missing/unreadable). */
  fatal: string | null;
  timezone: TimezoneResolution;
  month: MonthWindow | null;
  expectedCurrent: { start: string; end: string } | null;
  expectedPrior: { start: string; end: string } | null;
  source_blockers: string[];
  connection_gaps: string[];
}

/** Normalizes `act_123` / `123` to the stored ad_account_id form. */
export function normalizeAdAccountId(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.trim().replace(/^act_/i, '');
}

/**
 * Loads everything one client needs and returns the deterministic report.
 * Never writes. Never calls a model. Truncation is detected for EVERY source.
 */
export async function loadClientSopReport(
  sb: SupabaseLike,
  clientId: string,
  nowIso: string,
): Promise<LoadedClientSop> {
  const sourceBlockers: string[] = [];
  const gaps: string[] = [];

  const { data: client, error: clientErr } = await sb
    .from('clients')
    .select('id, name, status, meta_ad_account_id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) {
    return {
      report: null, fatal: 'client_read_failed', timezone: { timezone: null, source: null, blockers: ['timezone_unresolved'], notes: [] },
      month: null, expectedCurrent: null, expectedPrior: null, source_blockers: ['clients_read_failed'], connection_gaps: gaps,
    };
  }
  if (!client) {
    return {
      report: null, fatal: 'client_not_found', timezone: { timezone: null, source: null, blockers: ['timezone_unresolved'], notes: [] },
      month: null, expectedCurrent: null, expectedPrior: null, source_blockers: [], connection_gaps: gaps,
    };
  }

  const [settingsRes, targetsRes] = await Promise.all([
    sb.from('client_settings').select('client_id, stats_report_timezone').eq('client_id', clientId).maybeSingle(),
    sb.from('client_kpi_targets').select('client_id, max_daily_budget, autonomy_mode, guardrails').eq('client_id', clientId).maybeSingle(),
  ]);
  if (settingsRes.error) sourceBlockers.push('client_settings_read_failed');
  if (targetsRes.error) sourceBlockers.push('client_kpi_targets_read_failed');

  // Ad-account binding must be VERIFIED from meta_ad_accounts.
  const adAccountId = normalizeAdAccountId((client as any).meta_ad_account_id);
  let adAccountVerified = false;
  let adAccountTimezone: string | null = null;
  if (adAccountId) {
    const { data: acct, error: acctErr } = await sb
      .from('meta_ad_accounts')
      .select('ad_account_id, timezone_name, account_name')
      .eq('ad_account_id', adAccountId)
      .maybeSingle();
    if (acctErr) sourceBlockers.push('meta_ad_accounts_read_failed');
    else if (acct) {
      adAccountVerified = true;
      adAccountTimezone = (acct as any).timezone_name ?? null;
      if (!adAccountTimezone) gaps.push('meta_ad_accounts.timezone_name is empty for the bound ad account');
    }
  }

  const timezone = resolveTimezone({
    adAccountBound: !!adAccountId,
    adAccountTimezone,
    reportTimezone: (settingsRes.data as any)?.stats_report_timezone ?? null,
  });

  const kpiTargets: KpiTargetRow | null = targetsRes.data
    ? {
        client_id: (targetsRes.data as any).client_id,
        max_daily_budget: (targetsRes.data as any).max_daily_budget == null ? null : Number((targetsRes.data as any).max_daily_budget),
        autonomy_mode: (targetsRes.data as any).autonomy_mode ?? null,
        guardrails: ((targetsRes.data as any).guardrails ?? {}) as Record<string, unknown>,
      }
    : null;

  // Sources that simply do not exist yet. Reported, never synthesised.
  gaps.push('Matured qualified-lead cohort (spend + qualified leads for the same acquisition cohort) has no source table — CPQL cannot be computed.');
  gaps.push('Attribution/tracking freshness and coverage have no source table — tracking health is unknown.');
  gaps.push('meta_ads stores lifetime aggregates with no per-day rows and no budget column — per-ad windows, budget owners and change history are unavailable.');
  gaps.push('Campaign/ad set budget ownership, baseline daily spend and budget/creative change history are not connected — no numeric scale proposal is possible.');
  gaps.push('Sales capacity headroom has no source — scale capacity gate stays unknown.');

  // Without a timezone we refuse to calculate any dates.
  if (!timezone.timezone) {
    const report = assessClient(buildAssessInput({
      client, timezone, kpiTargets, nowIso,
      month: null, expectedCurrent: null, expectedPrior: null,
      currentWindow: null, priorWindow: null,
      mtdSpendUsd: null, funded: null, commitments: null,
      adAccountVerified, sourceBlockers, gaps,
    }));
    return { report, fatal: null, timezone, month: null, expectedCurrent: null, expectedPrior: null, source_blockers: sourceBlockers, connection_gaps: gaps };
  }

  const today = todayInTz(nowIso, timezone.timezone);
  const month = monthWindow(today);
  const curEnd = addDays(today, -1);
  const curStart = addDays(curEnd, -6);
  const priorEnd = addDays(curStart, -1);
  const priorStart = addDays(priorEnd, -6);
  const expectedCurrent = { start: curStart, end: curEnd };
  const expectedPrior = { start: priorStart, end: priorEnd };

  // One read covering the earliest needed day (prior window start or the first
  // of the month, whichever is earlier) through yesterday. MTD therefore always
  // spans the first of the month to yesterday, even late in the month.
  const readStart = priorStart < month.month_start ? priorStart : month.month_start;
  const readEnd = curEnd > month.mtd_end ? curEnd : month.mtd_end;
  const { data: dailyData, error: dailyErr, count: dailyCount } = await sb
    .from('daily_metrics')
    .select(DAILY_METRICS_COLUMNS, { count: 'exact' })
    .eq('client_id', clientId)
    .gte('date', readStart)
    .lte('date', readEnd)
    .order('date', { ascending: true })
    .range(0, ROW_CAP - 1);
  if (dailyErr) sourceBlockers.push('daily_metrics_read_failed');
  const daily = (dailyData ?? []) as DailyRow[];
  const dailyTruncated = typeof dailyCount === 'number' ? dailyCount > daily.length : daily.length >= ROW_CAP;
  if (dailyTruncated) sourceBlockers.push('daily_metrics_truncated');

  // Truncation must be detected for EVERY source, including ads.
  const { data: adRows, error: adErr, count: adCount } = await sb
    .from('meta_ads')
    .select('meta_ad_id, client_id, status', { count: 'exact' })
    .eq('client_id', clientId)
    .range(0, ROW_CAP - 1);
  if (adErr) sourceBlockers.push('meta_ads_read_failed');
  const adList = (adRows ?? []) as Array<{ meta_ad_id: string; client_id: string }>;
  const adsTruncated = typeof adCount === 'number' ? adCount > adList.length : adList.length >= ROW_CAP;
  if (adsTruncated) sourceBlockers.push('meta_ads_truncated');
  if (adList.some((a) => a.client_id !== clientId)) sourceBlockers.push('meta_ads_returned_foreign_client_rows');
  if (adList.length) gaps.push(`${adList.length} ad row(s) exist for this client but cannot be assessed without per-day ad metrics.`);

  // Account-local dates are what every window is expressed in. A row without one
  // cannot be placed in the client's day, so it blocks rather than being guessed.
  const missingAccountLocalDates = daily.some((r) => !(typeof r.date_account_tz === 'string' && r.date_account_tz.length >= 10));
  if (missingAccountLocalDates) sourceBlockers.push('daily_metrics_missing_account_local_dates');

  const inRange = (from: string, to: string) =>
    daily.filter((r) => {
      const d = rowDate(r);
      return d !== null && d >= from && d <= to;
    });

  const buildWindow = (from: string, to: string): Window => {
    const rows = inRange(from, to);
    const dates = rows.map(rowDate).filter((d): d is string => d !== null);
    const expectedLen = enumerateDates(from, to).length;
    const unique = new Set(dates);
    return {
      client_id: clientId,
      timezone: timezone.timezone as string,
      start_date: from,
      end_date: to,
      expected_days: expectedLen,
      dates,
      spend_usd: sumStrict(rows, 'ad_spend'),
      impressions: sumStrict(rows, 'impressions'),
      clicks_outbound: sumStrict(rows, 'clicks'),
      leads: sumStrict(rows, 'leads'),
      frequency: UNAVAILABLE_FREQUENCY,
      // No matured acquisition cohort source exists — never synthesised.
      matured_cohort: null,
      source_complete: !dailyErr && !dailyTruncated && unique.size === expectedLen && unique.size === dates.length,
      source_error: dailyErr ? 'daily_metrics_read_failed' : null,
      truncated: dailyTruncated,
    };
  };

  const mtdRows = inRange(month.month_start, month.mtd_end);
  const mtdDates = new Set(mtdRows.map(rowDate).filter((d): d is string => d !== null));
  if (month.mtd_expected_days > 0 && mtdDates.size !== month.mtd_expected_days) {
    sourceBlockers.push(`month_to_date_incomplete_${mtdDates.size}_of_${month.mtd_expected_days}_days`);
  }
  if (month.mtd_expected_days > 0 && daysBetween(month.month_start, month.mtd_end) + 1 !== month.mtd_expected_days) {
    sourceBlockers.push('month_to_date_range_inconsistent');
  }

  const report = assessClient(buildAssessInput({
    client, timezone, kpiTargets, nowIso, month,
    expectedCurrent, expectedPrior,
    currentWindow: buildWindow(curStart, curEnd),
    priorWindow: buildWindow(priorStart, priorEnd),
    mtdSpendUsd: sumStrict(mtdRows, 'ad_spend'),
    funded: sumStrict(mtdRows, 'funded_dollars'),
    commitments: sumStrict(mtdRows, 'commitment_dollars'),
    adAccountVerified, sourceBlockers, gaps,
  }));

  return { report, fatal: null, timezone, month, expectedCurrent, expectedPrior, source_blockers: sourceBlockers, connection_gaps: gaps };
}

function buildAssessInput(args: {
  client: any;
  timezone: TimezoneResolution;
  kpiTargets: KpiTargetRow | null;
  nowIso: string;
  month: MonthWindow | null;
  expectedCurrent: { start: string; end: string } | null;
  expectedPrior: { start: string; end: string } | null;
  currentWindow: Window | null;
  priorWindow: Window | null;
  mtdSpendUsd: number | null;
  funded: number | null;
  commitments: number | null;
  adAccountVerified: boolean;
  sourceBlockers: string[];
  gaps: string[];
}): AssessClientInput {
  return {
    client: {
      id: args.client.id,
      name: args.client.name,
      status: args.client.status ?? null,
      meta_ad_account_id: args.client.meta_ad_account_id ?? null,
    },
    timezone: args.timezone,
    kpiTargets: args.kpiTargets,
    expectedCurrent: args.expectedCurrent,
    expectedPrior: args.expectedPrior,
    currentWindow: args.currentWindow,
    priorWindow: args.priorWindow,
    // No tracking-health source exists yet — unknown, which blocks.
    tracking: null,
    ads: [],
    adAccountVerified: args.adAccountVerified,
    retargetingViable: false,
    mtdSpendUsd: args.mtdSpendUsd,
    mtdRange: args.month ? { start: args.month.month_start, end: args.month.mtd_end } : null,
    daysRemainingIncludingToday: args.month ? args.month.days_remaining_including_today : null,
    salesCapacityHeadroom: null,
    fundedClearedUsd: args.funded,
    commitmentsUsd: args.commitments,
    sourceBlockers: args.sourceBlockers,
    connectionGaps: args.gaps,
    nowIso: args.nowIso,
  };
}
