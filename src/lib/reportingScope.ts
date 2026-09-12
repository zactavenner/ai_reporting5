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
    let status: ClientMetricStatus;
    if (explicit === 'loading' || explicit === 'error') status = explicit;
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

export interface MetaPlatformTotals {
  metaLeads: number;
  impressions: number;
  clicks: number;
  adSpend: number;
  ctr: number | null;
  /** Meta cost per platform-reported lead — deliberately NOT the CRM cost per lead. */
  costPerMetaLead: number | null;
}

interface DailyRow {
  client_id: string;
  ad_spend?: number | null;
  leads?: number | null;
  impressions?: number | null;
  clicks?: number | null;
}

/**
 * Ad-platform (Meta) totals for the SAME client set as the selected scope.
 * Kept separate from CRM leads on purpose — the two definitions differ.
 */
export function aggregateMetaTotals(dailyRows: DailyRow[], includedClientIds: string[]): MetaPlatformTotals {
  const allowed = new Set(includedClientIds);
  let metaLeads = 0;
  let impressions = 0;
  let clicks = 0;
  let adSpend = 0;
  for (const row of dailyRows) {
    if (!allowed.has(row.client_id)) continue;
    metaLeads += Number(row.leads ?? 0) || 0;
    impressions += Number(row.impressions ?? 0) || 0;
    clicks += Number(row.clicks ?? 0) || 0;
    adSpend += Number(row.ad_spend ?? 0) || 0;
  }
  const ctr = ratio(clicks, impressions);
  return {
    metaLeads,
    impressions,
    clicks,
    adSpend,
    ctr: ctr == null ? null : ctr * 100,
    costPerMetaLead: ratio(adSpend, metaLeads),
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
