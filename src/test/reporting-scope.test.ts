import { describe, it, expect } from 'vitest';
import {
  resolveReportingScope,
  aggregateScopeTotals,
  aggregateStoredDailyTotals,
  coverageLabel,
  ratio,
  scopeIsCompleteForAI,
  scopeBlockReason,
  aggregateFundingTotals,
  CRM_LEADS_LABEL,
  CRM_COST_PER_LEAD_LABEL,
  SHEET_LEADS_LABEL,
  STORED_LEADS_LABEL,
  leadLabels,
} from '@/lib/reportingScope';
import { aggregateFromSourceData } from '@/hooks/useSourceMetrics';

const db = {
  a: { totalAdSpend: 100, totalLeads: 10, totalCalls: 4, showedCalls: 2, fundedInvestors: 1, fundedDollars: 1000, impressions: 1000, clicks: 50 },
  b: { totalAdSpend: 50, totalLeads: 5, totalCalls: 0, showedCalls: 0, fundedInvestors: 0, fundedDollars: 0, impressions: 500, clicks: 10 },
  c: { totalAdSpend: 999, totalLeads: 99 },
};

const sheet = {
  a: { totalAdSpend: 120, totalLeads: 12, totalCalls: 6, showedCalls: 3 },
};

describe('resolveReportingScope', () => {
  it('uses exactly one source and never merges them', () => {
    const scope = resolveReportingScope({ source: 'sheet', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    expect(scope.metricsByClient.a?.totalAdSpend).toBe(120);
    expect(scope.metricsByClient.b).toBeUndefined();
    expect(scope.includedClientIds).toEqual(['a']);
  });

  it('restricts the aggregate to the visible clients (headline == rows)', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    const totals = aggregateScopeTotals(scope);
    // client "c" exists in the data but is not visible, so it must not be counted
    expect(scope.includedClientIds).toEqual(['a', 'b']);
    expect(totals.adSpend).toBe(150);
    expect(totals.crmLeads).toBe(15);
  });

  it('excludes loading and failed clients instead of treating them as zero', () => {
    const scope = resolveReportingScope({
      source: 'database',
      visibleClientIds: ['a', 'b', 'z'],
      databaseMetrics: db,
      sheetMetrics: sheet,
      databaseStatuses: { b: 'loading', z: 'error' },
    });
    expect(scope.includedClientIds).toEqual(['a']);
    expect(scope.statusByClient.b).toBe('loading');
    expect(scope.statusByClient.z).toBe('error');
    expect(scope.isLoading).toBe(true);
    expect(scope.hasError).toBe(true);
    expect(aggregateScopeTotals(scope).adSpend).toBe(100);
  });

  it('marks unconfigured clients as not_configured and reports partial coverage', () => {
    const scope = resolveReportingScope({ source: 'sheet', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    expect(scope.statusByClient.b).toBe('not_configured');
    expect(scope.isPartial).toBe(true);
    expect(coverageLabel(scope)).toBe('1 of 2 clients in view included');
  });

  it('reports full coverage when every visible client has data', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    expect(scope.isPartial).toBe(false);
    expect(coverageLabel(scope)).toBe('All 2 clients in view included');
  });
});

describe('ratios', () => {
  it('returns null for zero or missing denominators', () => {
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(10, null)).toBeNull();
    expect(ratio(null, 5)).toBeNull();
    expect(ratio(10, 5)).toBe(2);
  });

  it('computes ratios from summed numerators and denominators, not averages of ratios', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    const totals = aggregateScopeTotals(scope);
    expect(totals.costPerLead).toBe(150 / 15);
    expect(totals.costPerCall).toBe(150 / 4);
    expect(totals.ctr).toBeCloseTo((60 / 1500) * 100, 10);
  });

  it('yields null (dash) ratios when the denominator is empty', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['b'], databaseMetrics: db, sheetMetrics: sheet });
    const totals = aggregateScopeTotals(scope);
    expect(totals.costPerCall).toBeNull();
    expect(totals.costPerShow).toBeNull();
    expect(totals.costPerInvestor).toBeNull();
    expect(totals.costOfCapital).toBeNull();
    expect(totals.showRate).toBeNull();
    expect(totals.closeRate).toBeNull();
  });

  it('gives dash ratios and zero totals for an empty scope', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: [], databaseMetrics: db, sheetMetrics: sheet });
    const totals = aggregateScopeTotals(scope);
    expect(totals.adSpend).toBe(0);
    expect(totals.costPerLead).toBeNull();
    expect(coverageLabel(scope)).toBe('No clients in view');
  });
});

describe('aggregateStoredDailyTotals', () => {
  it('sums stored daily rows for exactly the included clients and never claims a Meta lead count', () => {
    const daily = [
      { client_id: 'a', ad_spend: 100, leads: 8, impressions: 1000, clicks: 50 },
      { client_id: 'b', ad_spend: 50, leads: 3, impressions: 500, clicks: 10 },
      { client_id: 'c', ad_spend: 999, leads: 77, impressions: 10, clicks: 1 },
    ];
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    const stored = aggregateStoredDailyTotals(daily, scope.includedClientIds);
    expect(stored.storedLeads).toBe(11);
    expect(stored.adSpend).toBe(150);
    expect(stored).not.toHaveProperty('metaLeads');
    expect(STORED_LEADS_LABEL.toLowerCase()).not.toContain('meta');
  });

  it('returns a null click-through rate when there were no impressions', () => {
    const stored = aggregateStoredDailyTotals([{ client_id: 'a', ad_spend: 100, leads: 0 }], ['a']);
    expect(stored.ctr).toBeNull();
  });
});

describe('AI gating on incomplete scopes', () => {
  it('blocks AI when a client is still loading, failed, or missing for the selected source', () => {
    const loading = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet, databaseStatuses: { b: 'loading' } });
    expect(scopeIsCompleteForAI(loading)).toBe(false);
    expect(scopeBlockReason(loading)).toMatch(/still loading/i);

    const failed = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet, databaseStatuses: { b: 'error' } });
    expect(scopeIsCompleteForAI(failed)).toBe(false);
    expect(scopeBlockReason(failed)).toMatch(/failed to load/i);

    const notConfigured = resolveReportingScope({ source: 'sheet', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    expect(scopeIsCompleteForAI(notConfigured)).toBe(false);

    const empty = resolveReportingScope({ source: 'database', visibleClientIds: [], databaseMetrics: db, sheetMetrics: sheet });
    expect(scopeIsCompleteForAI(empty)).toBe(false);
  });

  it('allows AI only when every visible client loaded from the selected source', () => {
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    expect(scopeIsCompleteForAI(scope)).toBe(true);
    expect(scopeBlockReason(scope)).toBeNull();
  });

  it('never falls back to the other source when the selected one fails', () => {
    const scope = resolveReportingScope({ source: 'sheet', visibleClientIds: ['a'], databaseMetrics: db, sheetMetrics: sheet, sheetStatuses: { a: 'error' } });
    expect(scope.includedClientIds).toEqual([]);
    expect(aggregateScopeTotals(scope).adSpend).toBe(0);
    expect(aggregateScopeTotals(scope).costPerLead).toBeNull();
  });
});

describe('denominator behaviour', () => {
  it('shows a dash for a cost with no denominator but zero for genuine zero spend with outcomes', () => {
    const zeroSpend = resolveReportingScope({
      source: 'database',
      visibleClientIds: ['z'],
      databaseMetrics: { z: { totalAdSpend: 0, totalLeads: 4, totalCalls: 2, showedCalls: 1, fundedInvestors: 1, fundedDollars: 500 } },
      sheetMetrics: {},
    });
    const t = aggregateScopeTotals(zeroSpend);
    expect(t.costPerLead).toBe(0);
    expect(t.costPerCall).toBe(0);
    expect(t.costOfCapital).toBe(0);

    const noOutcomes = resolveReportingScope({
      source: 'database',
      visibleClientIds: ['z'],
      databaseMetrics: { z: { totalAdSpend: 900, totalLeads: 0, totalCalls: 0, showedCalls: 0, fundedInvestors: 0, fundedDollars: 0 } },
      sheetMetrics: {},
    });
    const n = aggregateScopeTotals(noOutcomes);
    expect(n.costPerLead).toBeNull();
    expect(n.costPerShow).toBeNull();
    expect(n.costOfCapital).toBeNull();
  });
});

describe('metric labels', () => {
  it('never labels the contactable CRM count as Meta or qualified', () => {
    expect(CRM_LEADS_LABEL).toBe('Contactable CRM leads');
    expect(CRM_LEADS_LABEL.toLowerCase()).not.toMatch(/meta|qualified|accredited/);
    expect(CRM_COST_PER_LEAD_LABEL.toLowerCase()).not.toMatch(/meta/);
    expect(leadLabels('database').leads).toBe(CRM_LEADS_LABEL);
    expect(leadLabels('sheet').leads).toBe(SHEET_LEADS_LABEL);
    // A sheet-mapped count must not claim the contactable email+phone definition.
    expect(SHEET_LEADS_LABEL.toLowerCase()).not.toMatch(/contactable|meta|qualified|accredited/);
  });
});

describe('received funding excludes commitments', () => {
  it('ignores commitment amounts entirely when funding was not received', () => {
    const f = aggregateFundingTotals([
      { funded_amount: 50000, commitment_amount: 50000 },
      { funded_amount: 0, commitment_amount: 100000 },
      { funded_amount: null, commitment_amount: 25000 },
      { funded_amount: 10000, commitment_amount: null },
    ]);
    expect(f.receivedFundingDollars).toBe(60000);
    expect(f.fundedInvestors).toBe(2);
    expect(f.commitmentDollars).toBe(175000);
    expect(f.commitments).toBe(3);
    expect(f.averageFundingPerInvestor).toBe(30000);
  });

  it('reports zero received funding and a dash average when only commitments exist', () => {
    const f = aggregateFundingTotals([{ funded_amount: 0, commitment_amount: 250000 }]);
    expect(f.receivedFundingDollars).toBe(0);
    expect(f.fundedInvestors).toBe(0);
    expect(f.averageFundingPerInvestor).toBeNull();
    expect(f.commitmentDollars).toBe(250000);
  });
});


describe('production source aggregator: received funding only', () => {
  const calls: never[] = [];
  const leads: never[] = [];

  it('never substitutes a commitment for a missing or zero funded amount', () => {
    const m = aggregateFromSourceData(leads, calls, [
      { funded_amount: 50000, commitment_amount: 50000, time_to_fund_days: 10, calls_to_fund: 2 },
      { funded_amount: 0, commitment_amount: 100000, time_to_fund_days: 4, calls_to_fund: 8 },
      { funded_amount: null, commitment_amount: 25000, time_to_fund_days: 6, calls_to_fund: 6 },
      { funded_amount: 10000, commitment_amount: null, time_to_fund_days: 20, calls_to_fund: 4 },
    ] as never, []);
    expect(m.fundedDollars).toBe(60000);
    expect(m.fundedInvestors).toBe(2);
    // Averages cover only investors who actually funded: (10 + 20) / 2 and (2 + 4) / 2.
    expect(m.avgTimeToFund).toBe(15);
    expect(m.avgCallsToFund).toBe(3);
  });

  it('reports zero received funding when only commitments exist', () => {
    const m = aggregateFromSourceData(leads, calls, [
      { funded_amount: 0, commitment_amount: 250000 },
    ] as never, []);
    expect(m.fundedDollars).toBe(0);
    expect(m.fundedInvestors).toBe(0);
    expect(m.avgTimeToFund).toBe(0);
  });
});

describe('explicit statuses are authoritative over cached values', () => {
  it('excludes a client marked not_configured even when stale values exist, and blocks AI', () => {
    const scope = resolveReportingScope({
      source: 'sheet',
      visibleClientIds: ['a', 'b'],
      databaseMetrics: {},
      sheetMetrics: { a: { totalAdSpend: 100, totalLeads: 5 }, b: { totalAdSpend: 50, totalLeads: 2 } },
      sheetStatuses: { a: 'ok', b: 'not_configured' },
    });
    expect(scope.statusByClient.b).toBe('not_configured');
    expect(scope.includedClientIds).toEqual(['a']);
    expect(scope.excludedClientIds).toEqual(['b']);
    expect(scope.isPartial).toBe(true);
    expect(scopeIsCompleteForAI(scope)).toBe(false);
    expect(scopeBlockReason(scope)).toBeTruthy();
  });

  it('honours an explicit error status over cached values', () => {
    const scope = resolveReportingScope({
      source: 'database',
      visibleClientIds: ['a'],
      databaseMetrics: { a: { totalAdSpend: 10 } },
      sheetMetrics: {},
      databaseStatuses: { a: 'error' },
    });
    expect(scope.hasError).toBe(true);
    expect(scope.includedClientIds).toEqual([]);
  });
});
