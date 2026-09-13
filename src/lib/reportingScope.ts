/**
 * ONE explicit reporting scope for the agency dashboard.
 *
 * Rules enforced here (previously the headline totals and the client rows could
 * disagree, because the headline summed the database metrics for ALL clients while
 * the table overlaid Google Sheet metrics for the VISIBLE clients only):
 *
 *  1. Exactly one source is selected. Sources are never silently merged.
 *  2. Headline totals and client rows are built from the SAME client set.
 *  3. A client whose numbers are missing, still loading, or failed is EXCLUDED —
 *     it is never counted as zero.
 *  4. Ratios are computed from summed numerators / summed denominators. When the
 *     denominator is missing or zero the ratio is `null`, which the UI renders as
 *     an em dash rather than 0.
 *  5. Meta (ad platform) leads and CRM leads stay separate values.
 */

export type ReportingSource = 'sheet' | 'database';

export type ClientMetricStatus = 'ok' | 'loading' | 'error' | 'not_configured';

export interface ClientMetricValues {
  totalAdSpend?: number | null;
  totalLeads?: number | null;
  spamLeads?: number | null;
  totalCalls?: number | null;
  showedCalls?: number | null;
  totalCommitments?: number | null;
  commitmentDollars?: number | null;
  fundedInvestors?: number | null;
  fundedDollars?: number | null;
  pipelineValue?: number | null;
  impressions?: number | null;
  clicks?: number | null;
}

export interface ResolveScopeInput {
  source: ReportingSource;
  /** Clients currently visible in the table (e.g. paused hidden). */
  visibleClientIds: string[];
  databaseMetrics: Record<string, ClientMetricValues>;
  sheetMetrics: Record<string, ClientMetricValues>;
  /** Per-client load status of the selected source, when known. */
  sheetStatuses?: Record<string, ClientMetricStatus>;
  databaseStatuses?: Record<string, ClientMetricStatus>;
}

export interface ReportingScope {
  source: ReportingSource;
  /** Only clients with usable numbers for the selected source. */
  metricsByClient: Record<string, ClientMetricValues>;
  includedClientIds: string[];
  excludedClientIds: string[];
  statusByClient: Record<string, ClientMetricStatus>;
  totalClients: number;
  includedClients: number;
  isPartial: boolean;
  isLoading: boolean;
  hasError: boolean;
}

export function resolveReportingScope(input: ResolveScopeInput): ReportingScope {
  const { source, visibleClientIds } = input;
  const raw = source === 'sheet' ? input.sheetMetrics : input.databaseMetrics;
  const statuses = (source === 'sheet' ? input.sheetStatuses : input.databaseStatuses) ?? {};

  const metricsByClient: Record<string, ClientMetricValues> = {};
  const statusByClient: Record<string, ClientMetricStatus> = {};
  const includedClientIds: string[] = [];
  const excludedClientIds: string[] = [];

  for (const id of visibleClientIds) {
    const explicit = statuses[id];
    const values = raw[id];
    // Any EXPLICIT non-ok status is authoritative — including `not_configured`.
    // Cached/stale values must never override it, or a client whose source is
    // unavailable would be silently counted from an old fetch.
    let status: ClientMetricStatus;
    if (explicit && explicit !== 'ok') status = explicit;
    else if (values) status = 'ok';
    else status = explicit ?? 'not_configured';


    statusByClient[id] = status;
    if (status === 'ok' && values) {
      metricsByClient[id] = values;
      includedClientIds.push(id);
    } else {
      excludedClientIds.push(id);
    }
  }

  return {
    source,
    metricsByClient,
    includedClientIds,
    excludedClientIds,
    statusByClient,
    totalClients: visibleClientIds.length,
    includedClients: includedClientIds.length,
    isPartial: includedClientIds.length !== visibleClientIds.length,
    isLoading: Object.values(statusByClient).some((s) => s === 'loading'),
    hasError: Object.values(statusByClient).some((s) => s === 'error'),
  };
}

export interface ReportingTotals {
  adSpend: number;
  crmLeads: number;
  spamLeads: number;
  calls: number;
  showedCalls: number;
  commitments: number;
  commitmentDollars: number;
  fundedInvestors: number;
  fundedDollars: number;
  pipelineValue: number;
  impressions: number;
  clicks: number;
  /** Ratios: null means "no usable denominator" and must render as an em dash. */
  costPerLead: number | null;
  costPerCall: number | null;
  costPerShow: number | null;
  costPerInvestor: number | null;
  costOfCapital: number | null;
  showRate: number | null;
  closeRate: number | null;
  leadToBookedPercent: number | null;
  ctr: number | null;
  includedClients: number;
  totalClients: number;
}

/** Sum numerators/denominators. `null` when the denominator is 0 or missing. */
export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

function sum(rows: ClientMetricValues[], key: keyof ClientMetricValues): number {
  return rows.reduce((acc, r) => acc + (Number(r[key] ?? 0) || 0), 0);
}

export function aggregateScopeTotals(scope: ReportingScope): ReportingTotals {
  const rows = scope.includedClientIds.map((id) => scope.metricsByClient[id]);

  const adSpend = sum(rows, 'totalAdSpend');
  const crmLeads = sum(rows, 'totalLeads');
  const calls = sum(rows, 'totalCalls');
  const showedCalls = sum(rows, 'showedCalls');
  const fundedInvestors = sum(rows, 'fundedInvestors');
  const fundedDollars = sum(rows, 'fundedDollars');
  const impressions = sum(rows, 'impressions');
  const clicks = sum(rows, 'clicks');

  const pct = (v: number | null) => (v == null ? null : v * 100);

  return {
    adSpend,
    crmLeads,
    spamLeads: sum(rows, 'spamLeads'),
    calls,
    showedCalls,
    commitments: sum(rows, 'totalCommitments'),
    commitmentDollars: sum(rows, 'commitmentDollars'),
    fundedInvestors,
    fundedDollars,
    pipelineValue: sum(rows, 'pipelineValue'),
    impressions,
    clicks,
    costPerLead: ratio(adSpend, crmLeads),
    costPerCall: ratio(adSpend, calls),
    costPerShow: ratio(adSpend, showedCalls),
    costPerInvestor: ratio(adSpend, fundedInvestors),
    costOfCapital: pct(ratio(adSpend, fundedDollars)),
    showRate: pct(ratio(showedCalls, calls)),
    closeRate: pct(ratio(fundedInvestors, showedCalls)),
    leadToBookedPercent: pct(ratio(calls, crmLeads)),
    ctr: pct(ratio(clicks, impressions)),
    includedClients: scope.includedClients,
    totalClients: scope.totalClients,
  };
}

/**
 * Totals summed from stored `daily_metrics` rows.
 *
 * PROVENANCE (verified by reading the writers):
 *  - `recalculate-daily-metrics` materialises daily_metrics from
 *    public.v_daily_funnel_day, so `daily_metrics.leads` is a CRM lead count
 *    bucketed by America/Los_Angeles — it is NOT a Meta-attributed count and
 *    must never be labelled "Meta leads".
 *  - `sync-meta-ad-spend` supplies the ad-platform figures (spend, impressions,
 *    clicks) from the Meta API, so those three are ad-platform provenance.
 *  - Meta's own lead count is written to `ad_spend_daily`, which this dashboard
 *    does not read, so no Meta lead figure is available here at all.
 */
export interface StoredDailyTotals {
  /** CRM-derived lead count materialised into daily_metrics. Provenance: CRM. */
  storedLeads: number;
  /** Ad-platform provenance (Meta sync). */
  impressions: number;
  clicks: number;
  adSpend: number;
  ctr: number | null;
}

interface DailyRow {
  client_id: string;
  ad_spend?: number | null;
  leads?: number | null;
  impressions?: number | null;
  clicks?: number | null;
}

/**
 * Stored daily totals for the SAME client set as the selected scope.
 * No Meta lead count is derived here — see the provenance note above.
 */
export function aggregateStoredDailyTotals(dailyRows: DailyRow[], includedClientIds: string[]): StoredDailyTotals {
  const allowed = new Set(includedClientIds);
  let storedLeads = 0;
  let impressions = 0;
  let clicks = 0;
  let adSpend = 0;
  for (const row of dailyRows) {
    if (!allowed.has(row.client_id)) continue;
    storedLeads += Number(row.leads ?? 0) || 0;
    impressions += Number(row.impressions ?? 0) || 0;
    clicks += Number(row.clicks ?? 0) || 0;
    adSpend += Number(row.ad_spend ?? 0) || 0;
  }
  const ctr = ratio(clicks, impressions);
  return {
    storedLeads,
    impressions,
    clicks,
    adSpend,
    ctr: ctr == null ? null : ctr * 100,
  };
}

export function sourceLabel(source: ReportingSource): string {
  return source === 'sheet' ? 'Google Sheet (client KPI sheet)' : 'Connected CRM + Meta (stored sync data)';
}

export function coverageLabel(scope: ReportingScope): string {
  if (scope.totalClients === 0) return 'No clients in view';
  if (!scope.isPartial) return `All ${scope.totalClients} clients in view included`;
  return `${scope.includedClients} of ${scope.totalClients} clients in view included`;
}

/* ------------------------------------------------------------------------- *
 * Metric labels.
 *
 * The CRM count is "contactable, non-spam leads that have BOTH an email and a
 * phone" — that definition is proven by the CRM aggregators only. Sheet numbers
 * come from a per-client column mapping, so a sheet lead count may be anything
 * the sheet owner mapped and must NOT claim the contactable definition.
 *
 * No count on this dashboard may be labelled "Meta leads": the only lead column
 * available here (daily_metrics.leads) is CRM-derived. Nothing may be labelled
 * qualified or accredited either — no such mapping is stored.
 * ------------------------------------------------------------------------- */
export const CRM_LEADS_LABEL = 'Contactable CRM leads';
export const CRM_LEADS_HINT = 'Non-spam CRM records with both an email and a phone. Not Meta-attributed, not qualified/accredited.';
export const CRM_COST_PER_LEAD_LABEL = 'Cost per contactable CRM lead';
export const SHEET_LEADS_LABEL = 'Leads (as mapped in sheet)';
export const SHEET_LEADS_HINT = 'Whatever the client KPI sheet maps to leads. The contactable email+phone definition is not proven for sheets.';
export const SHEET_COST_PER_LEAD_LABEL = 'Cost per lead (sheet)';
export const STORED_LEADS_LABEL = 'Stored daily leads (CRM-derived)';
export const STORED_LEADS_HINT = 'daily_metrics.leads is materialised from CRM lead records, not reported by Meta.';

/** Source-accurate lead labels — never claims Meta or the contactable definition for sheets. */
export function leadLabels(source: ReportingSource): { leads: string; leadsHint: string; costPerLead: string } {
  if (source === 'sheet') {
    return { leads: SHEET_LEADS_LABEL, leadsHint: SHEET_LEADS_HINT, costPerLead: SHEET_COST_PER_LEAD_LABEL };
  }
  return { leads: CRM_LEADS_LABEL, leadsHint: CRM_LEADS_HINT, costPerLead: CRM_COST_PER_LEAD_LABEL };
}

/**
 * True when the selected source is fully loaded, error-free and complete enough
 * for an AI summary or an export to be drawn from. Incomplete scopes must not be
 * handed to the AI, otherwise it draws conclusions from partial data.
 */
export function scopeIsCompleteForAI(scope: ReportingScope): boolean {
  return (
    scope.totalClients > 0 &&
    !scope.isLoading &&
    !scope.hasError &&
    !scope.isPartial
  );
}

export function scopeBlockReason(scope: ReportingScope): string | null {
  if (scope.totalClients === 0) return 'No clients are in view for the selected filters.';
  if (scope.isLoading) return 'Some clients for the selected source are still loading.';
  if (scope.hasError) return 'Some clients failed to load from the selected source.';
  if (scope.isPartial) return `Only ${scope.includedClients} of ${scope.totalClients} clients in view have numbers for the selected source.`;
  return null;
}

export interface FundingTotals {
  /** Money actually recorded as received. Commitments are NEVER folded in. */
  receivedFundingDollars: number;
  /** Investors with a positive recorded funded amount. */
  fundedInvestors: number;
  /** Pledged but not received. Reported separately, never added to funding. */
  commitmentDollars: number;
  commitments: number;
  /** Received funding per funded investor; null when nobody funded. */
  averageFundingPerInvestor: number | null;
}

interface FundingRow {
  funded_amount?: number | null;
  commitment_amount?: number | null;
}

/**
 * Received funding excludes commitments entirely: a row with a pledge but no
 * recorded funded amount contributes to `commitmentDollars` only.
 */
export function aggregateFundingTotals(rows: FundingRow[]): FundingTotals {
  let receivedFundingDollars = 0;
  let fundedInvestors = 0;
  let commitmentDollars = 0;
  let commitments = 0;

  for (const row of rows) {
    const funded = Number(row.funded_amount ?? 0) || 0;
    const commitment = Number(row.commitment_amount ?? 0) || 0;
    if (funded > 0) {
      receivedFundingDollars += funded;
      fundedInvestors += 1;
    }
    if (commitment > 0) {
      commitmentDollars += commitment;
      commitments += 1;
    }
  }

  return {
    receivedFundingDollars,
    fundedInvestors,
    commitmentDollars,
    commitments,
    averageFundingPerInvestor: ratio(receivedFundingDollars, fundedInvestors),
  };
}
