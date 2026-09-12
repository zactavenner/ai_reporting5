import { describe, it, expect } from 'vitest';
import {
  resolveReportingScope,
  aggregateScopeTotals,
  aggregateMetaTotals,
  coverageLabel,
  ratio,
} from '@/lib/reportingScope';

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

describe('aggregateMetaTotals', () => {
  it('keeps Meta platform leads separate and scoped to the same clients', () => {
    const daily = [
      { client_id: 'a', ad_spend: 100, leads: 8, impressions: 1000, clicks: 50 },
      { client_id: 'b', ad_spend: 50, leads: 3, impressions: 500, clicks: 10 },
      { client_id: 'c', ad_spend: 999, leads: 77, impressions: 10, clicks: 1 },
    ];
    const scope = resolveReportingScope({ source: 'database', visibleClientIds: ['a', 'b'], databaseMetrics: db, sheetMetrics: sheet });
    const meta = aggregateMetaTotals(daily, scope.includedClientIds);
    expect(meta.metaLeads).toBe(11);
    expect(meta.adSpend).toBe(150);
    expect(aggregateScopeTotals(scope).crmLeads).toBe(15);
    expect(meta.costPerMetaLead).toBeCloseTo(150 / 11, 10);
  });

  it('returns null cost per Meta lead when Meta reported no leads', () => {
    const meta = aggregateMetaTotals([{ client_id: 'a', ad_spend: 100, leads: 0 }], ['a']);
    expect(meta.costPerMetaLead).toBeNull();
    expect(meta.ctr).toBeNull();
  });
});
