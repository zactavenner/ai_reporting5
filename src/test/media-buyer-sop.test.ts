import { describe, it, expect } from 'vitest';
import {
  BUDGET_TIERS,
  planDailyBudgetTier,
  planColdStart,
  computeTestDays,
  resolveTimezone,
  resolveSopConfig,
  validateWindow,
  checkTrackingHealth,
  validateBinding,
  classifyAd,
  computePacing,
  buildDraftActions,
  buildCreativeBriefs,
  assessClient,
  monthWindow,
  todayInTz,
  PERF_QL_FLOOR,
  type AdInput,
  type ClassifyContext,
  type KpiTargetRow,
  type TierPlan,
  type Window,
} from '../../supabase/functions/_shared/mediaBuyerSop';
import { validateRequestShape, validateClientId } from '../../supabase/functions/_shared/mediaBuyerSopRequest';
import { DAILY_METRICS_COLUMNS, loadClientSopReport, normalizeAdAccountId, rowDate, sumStrict, type DailyRow } from '../../supabase/functions/_shared/mediaBuyerSopRead';
import { handleSopReview } from '../../supabase/functions/_shared/mediaBuyerSopReview';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TZ = 'America/Los_Angeles';
const NOW = '2026-03-10T19:00:00Z'; // 2026-03-10 12:00 in Los Angeles
const CUR = { start: '2026-03-03', end: '2026-03-09' };
const PRIOR = { start: '2026-02-24', end: '2026-03-02' };

function dates(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  while (d <= end) {
    out.push(d);
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    d = t.toISOString().slice(0, 10);
  }
  return out;
}

function makeWindow(range: { start: string; end: string }, over: Partial<Window> = {}): Window {
  return {
    client_id: CLIENT,
    timezone: TZ,
    start_date: range.start,
    end_date: range.end,
    expected_days: dates(range.start, range.end).length,
    dates: dates(range.start, range.end),
    spend_usd: 700,
    impressions: 100_000,
    clicks_outbound: 1_000,
    leads: 40,
    frequency: { available: false, reason: 'not directly sourced' },
    matured_cohort: {
      start_date: range.start,
      end_date: range.end,
      spend_usd: 700,
      qualified_leads_matured: 10,
      source: 'test',
    },
    source_complete: true,
    source_error: null,
    truncated: false,
    ...over,
  };
}

const VALID_OPTS = (range: { start: string; end: string }) => ({
  clientId: CLIENT,
  timezone: TZ,
  nowIso: NOW,
  expectedStart: range.start,
  expectedEnd: range.end,
  qualificationLagDays: 1,
});

const FULL_CONFIG = resolveSopConfig({
  client_id: CLIENT,
  max_daily_budget: 500,
  autonomy_mode: 'suggest',
  guardrails: {
    target_cpql: 100,
    qualification_lag_days: 1,
    funding_lag_days: 14,
    monthly_media_budget: 15000,
    pilot_loss_limit: 2000,
    sales_capacity_calls_per_week: 25,
    tracking_max_staleness_hours: 24,
    tracking_min_coverage_pct: 90,
    offer_reference: 'offer-1',
    offer_approved: true,
  },
}).config;

const TIER_500 = planDailyBudgetTier(500, true) as TierPlan;

function ctx(over: Partial<ClassifyContext> = {}): ClassifyContext {
  return {
    config: FULL_CONFIG,
    dataBlockers: [],
    configMissing: [],
    clientId: CLIENT,
    timezone: TZ,
    nowIso: NOW,
    expectedCurrent: CUR,
    expectedPrior: PRIOR,
    monthly_headroom_usd: 5000,
    sales_capacity_headroom: 10,
    ...over,
  };
}

function ad(over: Partial<AdInput> = {}): AdInput {
  return {
    ad_id: 'ad-1',
    client_id: CLIENT,
    hours_live: 500,
    current: makeWindow(CUR),
    prior: makeWindow(PRIOR),
    downstream_quality: 'acceptable',
    change_history: { available: true, last_budget_change_at: '2026-01-01T00:00:00Z', last_creative_change_at: '2026-01-01T00:00:00Z', source: 'test' },
    budget_owner: { level: 'adset', object_id: 'as-1', daily_budget_usd: 350, verified: true, baseline_daily_spend_usd: 340 },
    ...over,
  };
}

/* ------------------------------- budgets -------------------------------- */

describe('daily budget tiers', () => {
  it('allocates each of the four DAILY tiers exactly and sums to the daily budget', () => {
    const expected = [
      { daily: 200, core: 160, test: 40, rt: 0, concepts: 2, variants: 2, assets: 4 },
      { daily: 300, core: 210, test: 60, rt: 30, concepts: 2, variants: 3, assets: 5 },
      { daily: 500, core: 350, test: 100, rt: 50, concepts: 3, variants: 3, assets: 6 },
      { daily: 1000, core: 700, test: 200, rt: 100, concepts: 4, variants: 4, assets: 8 },
    ];
    for (const e of expected) {
      const plan = planDailyBudgetTier(e.daily, true) as TierPlan;
      expect('error' in plan).toBe(false);
      expect(plan.core_usd).toBe(e.core);
      expect(plan.test_usd).toBe(e.test);
      expect(plan.retargeting_usd).toBe(e.rt);
      expect(plan.core_usd + plan.test_usd + plan.retargeting_usd).toBe(e.daily);
      expect(plan.weekly_new_concepts).toBe(e.concepts);
      expect(plan.weekly_variants_total).toBe(e.variants);
      expect(plan.weekly_prepared_assets_total).toBe(e.assets);
      expect(plan.weekly_new_concepts + plan.weekly_variants_total).toBe(e.assets);
    }
  });

  it('returns retargeting to core (never to test) when retargeting is unviable, keeping the daily sum', () => {
    const plan = planDailyBudgetTier(500, false) as TierPlan;
    expect(plan.core_usd).toBe(400);
    expect(plan.test_usd).toBe(100);
    expect(plan.retargeting_usd).toBe(0);
    expect(plan.core_usd + plan.test_usd + plan.retargeting_usd).toBe(500);
  });

  it('requires a custom plan for a non-tier daily budget instead of flooring', () => {
    const r = planDailyBudgetTier(450, true);
    expect('error' in r && r.error).toBe('custom_daily_budget_requires_custom_plan');
    const r2 = planDailyBudgetTier(150, true);
    expect('error' in r2 && r2.error).toBe('custom_daily_budget_requires_custom_plan');
  });

  it('reports unavailable for missing or invalid daily budgets', () => {
    for (const v of [null, undefined, 0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect('error' in (planDailyBudgetTier(v as number, true) as never)).toBe(true);
    }
  });

  it('cold start is a structural 3–6 ads with no per-ad affordability heuristic', () => {
    const cold = planColdStart(2000, TIER_500);
    expect('error' in cold).toBe(false);
    if ('error' in cold) return;
    expect(cold.campaigns).toBe(1);
    expect(cold.prospecting_adsets).toBe(1);
    expect(cold.min_ads).toBe(3);
    expect(cold.max_ads).toBe(6);
    expect(cold.notes.join(' ')).toMatch(/not derived from a per-ad spend heuristic/);
    expect(cold.notes.join(' ')).not.toMatch(/\$20\b/);
  });

  it('blocks cold start without a pilot loss limit', () => {
    expect('error' in planColdStart(null, TIER_500)).toBe(true);
  });
});

describe('test duration', () => {
  it('uses the DAILY test allocation as-is: $500/day tier, $100 CPQL, lag 2 => 5 days', () => {
    const r = computeTestDays(100, TIER_500.test_usd, 2);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(TIER_500.test_usd).toBe(100);
    expect(r.spend_days).toBe(3);
    expect(r.days).toBe(5);
  });

  it('applies the 72h floor and the lag separately', () => {
    const r = computeTestDays(100, 200, 1);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.floor_days).toBe(3);
    expect(r.days).toBe(4);
  });

  it('never divides the daily test allocation by 7', () => {
    const weeklyish = computeTestDays(100, TIER_500.test_usd / 7, 0);
    const daily = computeTestDays(100, TIER_500.test_usd, 0);
    expect('error' in weeklyish || 'error' in daily).toBe(false);
    if ('error' in weeklyish || 'error' in daily) return;
    expect(daily.days).toBeLessThan(weeklyish.days);
    expect(daily.days).toBe(3);
  });

  it('withholds a duration when CPQL or the test allocation is unavailable', () => {
    expect('error' in computeTestDays(null, 100, 1)).toBe(true);
    expect('error' in computeTestDays(100, null, 1)).toBe(true);
    expect('error' in computeTestDays(100, 100, null)).toBe(true);
  });
});

/* ------------------------------ timezone -------------------------------- */

describe('timezone resolution', () => {
  it('uses the verified bound ad account timezone', () => {
    const r = resolveTimezone({ adAccountBound: true, adAccountTimezone: 'America/New_York', reportTimezone: null });
    expect(r.timezone).toBe('America/New_York');
    expect(r.blockers).toEqual([]);
  });

  it('blocks and calculates no dates when no timezone source exists', () => {
    const r = resolveTimezone({ adAccountBound: true, adAccountTimezone: null, reportTimezone: null });
    expect(r.timezone).toBeNull();
    expect(r.blockers).toContain('meta_ad_account_timezone_unavailable');
    expect(validateWindow(makeWindow(CUR), { ...VALID_OPTS(CUR), timezone: null }).blockers).toContain('timezone_unresolved');
  });

  it('NEVER falls back to the client reporting timezone: it may differ from Meta', () => {
    const r = resolveTimezone({ adAccountBound: true, adAccountTimezone: null, reportTimezone: 'America/Chicago' });
    expect(r.timezone).toBeNull();
    expect(r.source).toBeNull();
    expect(r.blockers).toContain('meta_ad_account_timezone_unavailable');
    expect(r.blockers).toContain('timezone_unresolved');
    expect(r.notes.join(' ')).toContain('NOT used');
  });

  it('rejects an invalid timezone string', () => {
    const r = resolveTimezone({ adAccountBound: true, adAccountTimezone: 'Not/AZone', reportTimezone: null });
    expect(r.timezone).toBeNull();
    expect(r.blockers).toContain('ad_account_timezone_invalid');
  });
});

/* ---------------------------- configuration ----------------------------- */

describe('configuration resolution', () => {
  it('reports every missing guardrail with its source field and never infers CPQL from CPL', () => {
    const row: KpiTargetRow = { client_id: CLIENT, max_daily_budget: null, guardrails: { target_cpl: 40 } };
    const r = resolveSopConfig(row);
    expect(r.ok).toBe(false);
    expect(r.config.target_cpql).toBeNull();
    const cpql = r.fields.find((f) => f.key === 'target_cpql');
    expect(cpql?.source_field).toBe('client_kpi_targets.guardrails.target_cpql');
    expect(r.missing.map((m) => m.key)).toContain('monthly_media_budget');
    expect(r.missing.map((m) => m.key)).toContain('approved_daily_budget');
  });

  it('flags invalid numbers rather than using them', () => {
    const r = resolveSopConfig({
      client_id: CLIENT,
      max_daily_budget: -5,
      guardrails: {
        target_cpql: 0,
        qualification_lag_days: -1,
        monthly_media_budget: Number.NaN,
        pilot_loss_limit: -10,
        tracking_min_coverage_pct: 140,
        tracking_max_staleness_hours: 0,
      },
    });
    const invalid = r.invalid.map((f) => f.key);
    for (const k of ['target_cpql', 'qualification_lag_days', 'monthly_media_budget', 'approved_daily_budget', 'pilot_loss_limit', 'tracking_min_coverage_pct', 'tracking_max_staleness_hours']) {
      expect(invalid).toContain(k);
    }
    expect(r.config.target_cpql).toBeNull();
    expect(r.config.tracking_min_coverage_pct).toBeNull();
  });

  it('accepts a complete configuration', () => {
    expect(FULL_CONFIG.target_cpql).toBe(100);
    expect(FULL_CONFIG.approved_daily_budget_usd).toBe(500);
  });
});

/* ------------------------------- evidence ------------------------------- */

describe('evidence validation', () => {
  it('accepts a complete expected window', () => {
    expect(validateWindow(makeWindow(CUR), VALID_OPTS(CUR)).ok).toBe(true);
  });

  it('does not call the prior window stale merely for being prior', () => {
    expect(validateWindow(makeWindow(PRIOR), VALID_OPTS(PRIOR)).ok).toBe(true);
  });

  it('rejects a window that is not the exact expected adjacent range', () => {
    const shifted = { start: '2026-03-02', end: '2026-03-08' };
    expect(validateWindow(makeWindow(shifted), VALID_OPTS(CUR)).blockers).toContain('evidence_window_not_expected_range');
  });

  it('fails closed on missing evidence', () => {
    expect(validateWindow(null, VALID_OPTS(CUR)).blockers).toContain('evidence_missing');
  });

  it('rejects evidence from another client', () => {
    expect(validateWindow(makeWindow(CUR, { client_id: OTHER }), VALID_OPTS(CUR)).blockers).toContain('evidence_wrong_client');
  });

  it('rejects a window that includes the partial current day', () => {
    const today = todayInTz(NOW, TZ);
    const w = makeWindow({ start: '2026-03-04', end: today });
    expect(validateWindow(w, { ...VALID_OPTS(CUR), expectedStart: '2026-03-04', expectedEnd: today }).blockers).toContain('evidence_includes_partial_current_day');
  });

  it('rejects future, malformed, duplicated, incomplete and out-of-range source dates', () => {
    expect(validateWindow(makeWindow(CUR, { dates: ['2026-03-03', '2026-03-03', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'] }), VALID_OPTS(CUR)).blockers).toContain('evidence_duplicate_dates');
    expect(validateWindow(makeWindow(CUR, { dates: ['2026-03-03'] }), VALID_OPTS(CUR)).blockers).toContain('evidence_incomplete_dates');
    expect(validateWindow(makeWindow(CUR, { dates: [...dates(CUR.start, CUR.end), '2026-03-15'] }), VALID_OPTS(CUR)).blockers).toContain('evidence_dates_out_of_range');
    expect(validateWindow(makeWindow(CUR, { dates: ['2026-02-30', ...dates(CUR.start, CUR.end).slice(1)] }), VALID_OPTS(CUR)).blockers).toContain('evidence_malformed_source_dates');
    expect(validateWindow(makeWindow(CUR, { dates: null }), VALID_OPTS(CUR)).blockers).toContain('evidence_dates_unavailable');
  });

  it('treats null and invalid metrics as blockers rather than zero', () => {
    expect(validateWindow(makeWindow(CUR, { spend_usd: null }), VALID_OPTS(CUR)).blockers).toContain('evidence_null_spend_usd');
    expect(validateWindow(makeWindow(CUR, { leads: null }), VALID_OPTS(CUR)).blockers).toContain('evidence_null_leads');
    expect(validateWindow(makeWindow(CUR, { spend_usd: -1 }), VALID_OPTS(CUR)).blockers).toContain('evidence_invalid_spend_usd');
    expect(validateWindow(makeWindow(CUR, { impressions: Number.NaN }), VALID_OPTS(CUR)).blockers).toContain('evidence_invalid_impressions');
  });

  it('blocks on truncated or errored sources and incomplete windows', () => {
    expect(validateWindow(makeWindow(CUR, { truncated: true }), VALID_OPTS(CUR)).blockers).toContain('evidence_truncated');
    expect(validateWindow(makeWindow(CUR, { source_error: 'boom' }), VALID_OPTS(CUR)).blockers).toContain('evidence_source_error');
    expect(validateWindow(makeWindow(CUR, { source_complete: false }), VALID_OPTS(CUR)).blockers).toContain('evidence_window_incomplete');
  });

  it('requires a matured acquisition cohort and a known qualification lag', () => {
    expect(validateWindow(makeWindow(CUR, { matured_cohort: null }), VALID_OPTS(CUR)).blockers).toContain('matured_cohort_unavailable');
    expect(validateWindow(makeWindow(CUR), { ...VALID_OPTS(CUR), qualificationLagDays: null }).blockers).toContain('qualification_lag_days_unavailable');
  });

  it('rejects a cohort that has not matured past the client lag', () => {
    const r = validateWindow(makeWindow(CUR), { ...VALID_OPTS(CUR), qualificationLagDays: 7 });
    expect(r.blockers).toContain('qualification_cohort_not_matured');
  });

  it('rejects a cohort whose spend or qualified leads are null (never zero-filled)', () => {
    const nullSpend = makeWindow(CUR, { matured_cohort: { start_date: CUR.start, end_date: CUR.end, spend_usd: null, qualified_leads_matured: 5, source: 't' } });
    expect(validateWindow(nullSpend, VALID_OPTS(CUR)).blockers).toContain('matured_cohort_null_spend');
    const nullQl = makeWindow(CUR, { matured_cohort: { start_date: CUR.start, end_date: CUR.end, spend_usd: 100, qualified_leads_matured: null, source: 't' } });
    expect(validateWindow(nullQl, VALID_OPTS(CUR)).blockers).toContain('matured_cohort_null_qualified_leads');
  });
});

describe('tracking health and binding', () => {
  it('treats unknown tracking as a blocker', () => {
    expect(checkTrackingHealth(null, FULL_CONFIG, NOW).blockers).toContain('tracking_health_unknown');
    expect(checkTrackingHealth({ freshness_hours: null, coverage_pct: null }, FULL_CONFIG, NOW).ok).toBe(false);
  });

  it('rejects invalid, out-of-range and future-dated tracking readings', () => {
    expect(checkTrackingHealth({ freshness_hours: -1, coverage_pct: 95 }, FULL_CONFIG, NOW).blockers).toContain('tracking_freshness_invalid');
    expect(checkTrackingHealth({ freshness_hours: 1, coverage_pct: 120 }, FULL_CONFIG, NOW).blockers).toContain('tracking_coverage_invalid');
    expect(checkTrackingHealth({ freshness_hours: 1, coverage_pct: 95, measured_at: '2027-01-01T00:00:00Z' }, FULL_CONFIG, NOW).blockers).toContain('tracking_measured_at_in_future');
  });

  it('blocks stale or under-covered tracking and passes healthy tracking', () => {
    expect(checkTrackingHealth({ freshness_hours: 100, coverage_pct: 95 }, FULL_CONFIG, NOW).blockers).toContain('tracking_stale');
    expect(checkTrackingHealth({ freshness_hours: 2, coverage_pct: 50 }, FULL_CONFIG, NOW).blockers).toContain('tracking_coverage_below_requirement');
    expect(checkTrackingHealth({ freshness_hours: 2, coverage_pct: 95, measured_at: '2026-03-10T18:00:00Z' }, FULL_CONFIG, NOW).ok).toBe(true);
  });

  it('blocks an unverified or missing ad-account binding', () => {
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: null, adAccountVerified: false, offerReference: 'o' }).blockers).toContain('meta_ad_account_unbound');
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: '123', adAccountVerified: false, offerReference: 'o' }).blockers).toContain('meta_ad_account_binding_unverified');
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: '123', adAccountVerified: true, offerReference: 'o', offerClientId: OTHER }).blockers).toContain('offer_client_mismatch');
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: '123', adAccountVerified: true, offerReference: 'o' }).ok).toBe(true);
  });
});

/* ---------------------------- classification ---------------------------- */

const cohort = (spend: number, qls: number, range = CUR) => ({
  matured_cohort: { start_date: range.start, end_date: range.end, spend_usd: spend, qualified_leads_matured: qls, source: 'test' },
});

describe('ad classification', () => {
  it('DATA BLOCKED when the client data health failed', () => {
    const a = classifyAd(ad(), ctx({ dataBlockers: ['current:evidence_truncated'] }));
    expect(a.status).toBe('DATA_BLOCKED');
  });

  it("validates each ad's OWN window — client aggregate health cannot prove ad completeness", () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, { dates: ['2026-03-03'] }) }), ctx());
    expect(a.status).toBe('DATA_BLOCKED');
    expect(a.ad_blockers).toContain('current:evidence_incomplete_dates');
  });

  it('rejects an ad belonging to another client', () => {
    const a = classifyAd(ad({ client_id: OTHER }), ctx());
    expect(a.status).toBe('DATA_BLOCKED');
    expect(a.ad_blockers).toContain('ad_wrong_client');
  });

  it('CONFIGURATION NEEDED is never KEEP', () => {
    const a = classifyAd(ad(), ctx({ configMissing: ['target_cpql'], config: { ...FULL_CONFIG, target_cpql: null } }));
    expect(a.status).toBe('CONFIGURATION_NEEDED');
  });

  it('INSUFFICIENT DATA under 72h live or with unknown time live', () => {
    expect(classifyAd(ad({ hours_live: 40 }), ctx()).status).toBe('INSUFFICIENT_DATA');
    expect(classifyAd(ad({ hours_live: null }), ctx()).status).toBe('INSUFFICIENT_DATA');
  });

  it('INSUFFICIENT DATA below the 5 matured qualified-lead floor', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(200, 4)) }), ctx());
    expect(PERF_QL_FLOOR).toBe(5);
    expect(a.status).toBe('INSUFFICIENT_DATA');
  });

  it('PAUSE candidate at >= 3x target spend with zero matured QLs on healthy data', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(300, 0)) }), ctx());
    expect(a.status).toBe('PAUSE_CANDIDATE');
  });

  it('PAUSE candidate only when persistently over 1.25x across two mature windows', () => {
    const one = classifyAd(ad({
      current: makeWindow(CUR, cohort(1200, 6)),
      prior: makeWindow(PRIOR, { ...cohort(900, 6, PRIOR) }),
    }), ctx());
    expect(one.status).toBe('PAUSE_CANDIDATE');
    const notPersistent = classifyAd(ad({
      current: makeWindow(CUR, cohort(900, 6)),
      prior: makeWindow(PRIOR, { ...cohort(500, 6, PRIOR) }),
    }), ctx());
    expect(notPersistent.status).toBe('WATCH');
  });

  it('KEEP when cost is within target with acceptable downstream quality', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(500, 10)), change_history: { available: false } }), ctx());
    expect(a.status).toBe('KEEP');
  });

  it('WATCH between target and 1.25x target, or on mixed quality', () => {
    expect(classifyAd(ad({ current: makeWindow(CUR, cohort(1150, 10)) }), ctx()).status).toBe('WATCH');
    expect(classifyAd(ad({ current: makeWindow(CUR, cohort(500, 10)), downstream_quality: 'mixed' }), ctx()).status).toBe('WATCH');
  });

  it('cheap cost with poor downstream quality never scales', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(100, 20)), downstream_quality: 'poor' }), ctx());
    expect(a.status).not.toBe('SCALE_CANDIDATE');
    expect(a.status).toBe('WATCH');
  });

  it('unknown downstream quality is DATA BLOCKED', () => {
    expect(classifyAd(ad({ downstream_quality: 'unknown' }), ctx()).status).toBe('DATA_BLOCKED');
  });

  it('ITERATE needs >=25% matured CPQL deterioration plus a CTR decline >=15%', () => {
    const a = classifyAd(ad({
      current: makeWindow(CUR, { ...cohort(1000, 8), clicks_outbound: 500, impressions: 100_000 }),
      prior: makeWindow(PRIOR, { ...cohort(600, 8, PRIOR), clicks_outbound: 1000, impressions: 100_000 }),
    }), ctx());
    expect(a.status).toBe('ITERATE');
    expect(a.cpql_change_pct).toBeGreaterThanOrEqual(25);
  });

  it('CPQL deterioration alone, without a CTR or sourced frequency signal, is not ITERATE', () => {
    const a = classifyAd(ad({
      current: makeWindow(CUR, { ...cohort(900, 8), clicks_outbound: 1000, impressions: 100_000 }),
      prior: makeWindow(PRIOR, { ...cohort(700, 8, PRIOR), clicks_outbound: 1000, impressions: 100_000 }),
    }), ctx());
    expect(a.status).not.toBe('ITERATE');
  });

  it('frequency alone never kills an ad and aggregate frequency is reported unavailable', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, { ...cohort(1150, 10), frequency: { available: false, reason: 'not directly sourced' } }) }), ctx());
    expect(a.status).toBe('WATCH');
    expect(a.frequency_note).toContain('unavailable');
    const withFreq = classifyAd(ad({ current: makeWindow(CUR, { ...cohort(1150, 10), frequency: { available: true, value: 3.5, source: 'meta window' } }) }), ctx());
    expect(withFreq.status).toBe('WATCH');
    expect(withFreq.reasons.join(' ')).toContain('never a kill signal');
  });

  it('7 completed report days without change history cannot scale', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(500, 12)), change_history: { available: false } }), ctx());
    expect(a.status).toBe('KEEP');
    expect(a.scale_gate_failures.join(' ')).toContain('change history unavailable');
  });

  it('a budget or creative change inside the measured window withholds scale', () => {
    const a = classifyAd(ad({
      current: makeWindow(CUR, cohort(500, 12)),
      change_history: { available: true, last_budget_change_at: '2026-03-05T00:00:00Z' },
    }), ctx());
    expect(a.status).toBe('KEEP');
    expect(a.scale_gate_failures.join(' ')).toContain('budget changed inside the measured window');
  });

  it('withholds scale when headroom or sales capacity is unknown', () => {
    const noHeadroom = classifyAd(ad({ current: makeWindow(CUR, cohort(500, 12)) }), ctx({ monthly_headroom_usd: null }));
    expect(noHeadroom.scale_gate_failures.join(' ')).toContain('monthly budget headroom unknown');
    const noCapacity = classifyAd(ad({ current: makeWindow(CUR, cohort(500, 12)) }), ctx({ sales_capacity_headroom: null }));
    expect(noCapacity.scale_gate_failures.join(' ')).toContain('sales capacity unknown');
  });

  it('SCALE candidate only when every gate passes', () => {
    const a = classifyAd(ad({ current: makeWindow(CUR, cohort(500, 12)) }), ctx());
    expect(a.status).toBe('SCALE_CANDIDATE');
    expect(a.recommendation_only).toBe(true);
  });
});

/* -------------------------------- pacing -------------------------------- */

describe('pacing', () => {
  it('uses remaining days INCLUDING today because MTD excludes today', () => {
    const p = computePacing({ mtdSpendUsd: 4500, mtdRange: { start: '2026-03-01', end: '2026-03-09' }, monthlyBudgetUsd: 15000, approvedDailyUsd: 500, daysRemainingIncludingToday: 22 });
    expect(p.remaining_usd).toBe(10500);
    expect(p.implied_daily_usd).toBeCloseTo(477.27, 1);
    expect(p.status).toBe('on_pace');
  });

  it('is unknown when the budget, MTD spend or remaining days are unavailable', () => {
    expect(computePacing({ mtdSpendUsd: null, mtdRange: null, monthlyBudgetUsd: 15000, approvedDailyUsd: 500, daysRemainingIncludingToday: 20 }).status).toBe('unknown');
    expect(computePacing({ mtdSpendUsd: 100, mtdRange: null, monthlyBudgetUsd: null, approvedDailyUsd: 500, daysRemainingIncludingToday: 20 }).status).toBe('unknown');
    expect(computePacing({ mtdSpendUsd: 100, mtdRange: null, monthlyBudgetUsd: 15000, approvedDailyUsd: 500, daysRemainingIncludingToday: null }).status).toBe('unknown');
  });

  it('month window spans the first of the month through yesterday, even after day 14', () => {
    const m = monthWindow('2026-03-20');
    expect(m.month_start).toBe('2026-03-01');
    expect(m.mtd_end).toBe('2026-03-19');
    expect(m.mtd_expected_days).toBe(19);
    expect(m.days_remaining_including_today).toBe(12);
  });
});

/* ----------------------------- draft actions ---------------------------- */

const draftCtx = {
  dataBlockers: [] as string[],
  configMissing: [] as string[],
  monthly_headroom_usd: 5000,
  approved_daily_cap_usd: 500,
  days_remaining_including_today: 20,
};

describe('draft actions', () => {
  it('proposes nothing at all when data is blocked or configuration is missing', () => {
    const a = ad();
    const assessment = classifyAd(a, ctx());
    expect(buildDraftActions([assessment], [a], { ...draftCtx, dataBlockers: ['x'] }).actions).toEqual([]);
    expect(buildDraftActions([assessment], [a], { ...draftCtx, configMissing: ['target_cpql'] }).blocked).toBe(true);
  });

  it('pausing an ad claims no saving, no negative delta and no zero-budget proposal', () => {
    const a = ad({ current: makeWindow(CUR, cohort(300, 0)) });
    const assessment = classifyAd(a, ctx());
    const { actions, total_delta_usd, total_monthly_impact_usd } = buildDraftActions([assessment], [a], draftCtx);
    const pause = actions.find((x) => x.kind === 'pause_ad')!;
    expect(pause.savings_claimed).toBe(false);
    expect(pause.delta_usd).toBeNull();
    expect(pause.proposed_daily_budget_usd).toBeNull();
    expect(pause.monthly_impact_usd).toBeNull();
    expect(pause.blockers).toContain('shared_budget_may_redistribute_spend');
    expect(total_delta_usd).toBe(0);
    expect(total_monthly_impact_usd).toBe(0);
  });

  it('emits NO numeric budget increase at all in this preview, even with a fully verified owner', () => {
    const a = ad({ current: makeWindow(CUR, cohort(500, 12)) });
    const assessment = classifyAd(a, ctx());
    const { actions, total_delta_usd, total_monthly_impact_usd } = buildDraftActions([assessment], [a], draftCtx);
    expect(actions.some((x) => x.kind === 'increase_object_daily_budget')).toBe(false);
    const na = actions.find((x) => x.kind === 'no_action')!;
    expect(na.budget_object).toEqual({ level: 'adset', object_id: 'as-1' });
    expect(na.proposed_daily_budget_usd).toBeNull();
    expect(na.current_daily_budget_usd).toBeNull();
    expect(na.delta_usd).toBeNull();
    expect(na.monthly_impact_usd).toBeNull();
    expect(na.projected_baseline_remaining_usd).toBeNull();
    expect(na.blockers).toContain('verified_client_wide_baseline_and_total_current_budget_not_connected');
    expect(na.inert).toBe(true);
    expect(na.requires_human_approval).toBe(true);
    expect(total_delta_usd).toBe(0);
    expect(total_monthly_impact_usd).toBe(0);
  });

  it('still reports the specific missing gates on the scale candidate', () => {
    const cases: Array<[Partial<AdInput>, Partial<typeof draftCtx>, string]> = [
      [{ budget_owner: null }, {}, 'budget_owner_unknown_ads_do_not_own_budget'],
      [{ budget_owner: { level: 'adset', object_id: 'as-1', daily_budget_usd: 350, verified: false, baseline_daily_spend_usd: 340 } }, {}, 'budget_owner_unverified'],
      [{ budget_owner: { level: 'adset', object_id: 'as-1', daily_budget_usd: 350, verified: true, baseline_daily_spend_usd: null } }, {}, 'owner_baseline_daily_spend_unavailable'],
      [{}, { approved_daily_cap_usd: null }, 'approved_client_daily_cap_unknown'],
      [{}, { days_remaining_including_today: null }, 'remaining_days_unknown'],
      [{}, { monthly_headroom_usd: null }, 'monthly_headroom_unknown'],
    ];
    for (const [adOver, ctxOver, blocker] of cases) {
      const a = ad({ current: makeWindow(CUR, cohort(500, 12)), ...adOver });
      const assessment = classifyAd(a, ctx());
      const { actions } = buildDraftActions([assessment], [a], { ...draftCtx, ...ctxOver });
      const na = actions.find((x) => x.kind === 'no_action');
      expect(na, blocker).toBeTruthy();
      expect(na!.blockers).toContain(blocker);
      expect(na!.proposed_daily_budget_usd).toBeNull();
    }
  });

  it('groups scale candidates one explanation per budget-owning object, never per ad', () => {
    const a1 = ad({ ad_id: 'ad-1', current: makeWindow(CUR, cohort(500, 12)) });
    const a2 = ad({ ad_id: 'ad-2', current: makeWindow(CUR, cohort(500, 12)) });
    const assessments = [classifyAd(a1, ctx()), classifyAd(a2, ctx())];
    const { actions } = buildDraftActions(assessments, [a1, a2], draftCtx);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('no_action');
    expect(actions[0].ad_ids).toEqual(['ad-1', 'ad-2']);
  });



  it('never inflates monthly headroom: no increase is sized at all, whatever the headroom', () => {
    const a = ad({ current: makeWindow(CUR, cohort(500, 12)) });
    const assessment = classifyAd(a, ctx());
    for (const headroom of [100, 5000, null]) {
      const { actions, total_monthly_impact_usd } = buildDraftActions([assessment], [a], { ...draftCtx, monthly_headroom_usd: headroom });
      expect(actions[0].kind).toBe('no_action');
      expect(actions[0].blockers).toContain('verified_client_wide_baseline_and_total_current_budget_not_connected');
      expect(actions[0].monthly_impact_usd).toBeNull();
      expect(total_monthly_impact_usd).toBe(0);
    }
  });
});

/* --------------------------- creative delivery -------------------------- */

describe('creative briefs', () => {
  it('produces net-new concepts plus a weekly variant TOTAL (never per concept)', () => {
    for (const tier of BUDGET_TIERS) {
      const plan = planDailyBudgetTier(tier.daily_budget_usd, true) as TierPlan;
      const briefs = buildCreativeBriefs(plan, 0);
      expect(briefs).toHaveLength(tier.weekly_prepared_assets_total);
      expect(briefs.filter((b) => b.kind === 'net_new_concept')).toHaveLength(tier.weekly_new_concepts);
      expect(briefs.filter((b) => b.kind === 'variant')).toHaveLength(tier.weekly_variants_total);
    }
  });

  it('carries the compliance language on every brief', () => {
    const briefs = buildCreativeBriefs(TIER_500, 1);
    expect(briefs.every((b) => b.compliance.some((c) => c.includes('targeted returns')))).toBe(true);
    expect(briefs.every((b) => b.compliance.some((c) => c.includes('not revenue ROAS')))).toBe(true);
  });
});

/* ---------------------------- client assessment ------------------------- */

const baseAssess = {
  client: { id: CLIENT, name: 'Test Client', status: 'active', meta_ad_account_id: '123' },
  timezone: resolveTimezone({ adAccountBound: true, adAccountTimezone: TZ, reportTimezone: null }),
  kpiTargets: {
    client_id: CLIENT,
    max_daily_budget: 500,
    guardrails: {
      target_cpql: 100, qualification_lag_days: 1, funding_lag_days: 14, monthly_media_budget: 15000,
      pilot_loss_limit: 2000, sales_capacity_calls_per_week: 25, tracking_max_staleness_hours: 24,
      tracking_min_coverage_pct: 90, offer_reference: 'offer-1', offer_approved: true,
    },
  } as KpiTargetRow,
  expectedCurrent: CUR,
  expectedPrior: PRIOR,
  currentWindow: makeWindow(CUR),
  priorWindow: makeWindow(PRIOR),
  tracking: { freshness_hours: 2, coverage_pct: 95, measured_at: '2026-03-10T18:00:00Z' },
  ads: [] as AdInput[],
  adAccountVerified: true,
  retargetingViable: true,
  mtdSpendUsd: 4500,
  mtdRange: { start: '2026-03-01', end: '2026-03-09' },
  daysRemainingIncludingToday: 22,
  salesCapacityHeadroom: 10,
  fundedClearedUsd: 250000,
  commitmentsUsd: 400000,
  sourceBlockers: [] as string[],
  connectionGaps: [] as string[],
  nowIso: NOW,
};

describe('client assessment', () => {
  it('is READY only when configuration, binding, tracking and both windows hold', () => {
    const r = assessClient(baseAssess);
    expect(r.readiness).toBe('READY');
    expect(r.tier_plan?.matched_tier_daily_budget_usd).toBe(500);
    expect(r.capital.note).toContain('not revenue ROAS');
  });

  it('reports CONFIGURATION NEEDED (never KEEP) when target CPQL is unset', () => {
    const r = assessClient({ ...baseAssess, kpiTargets: { client_id: CLIENT, max_daily_budget: 500, guardrails: { qualification_lag_days: 1, offer_reference: 'o', offer_approved: true } } });
    expect(r.readiness).toBe('CONFIGURATION_NEEDED');
    expect(r.config_missing.map((f) => f.key)).toContain('target_cpql');
    expect(r.draft_actions).toEqual([]);
  });

  it('is DATA BLOCKED with no proposals when the timezone cannot be resolved', () => {
    const r = assessClient({
      ...baseAssess,
      timezone: resolveTimezone({ adAccountBound: true, adAccountTimezone: null, reportTimezone: null }),
      expectedCurrent: null, expectedPrior: null, currentWindow: null, priorWindow: null,
    });
    expect(r.readiness).toBe('DATA_BLOCKED');
    expect(r.windows.current).toBeNull();
    expect(r.draft_actions).toEqual([]);
  });

  it('is DATA BLOCKED when a source read was truncated', () => {
    const r = assessClient({ ...baseAssess, sourceBlockers: ['daily_metrics_truncated'] });
    expect(r.readiness).toBe('DATA_BLOCKED');
    expect(r.blockers).toContain('source:daily_metrics_truncated');
  });

  it('rejects foreign-client ad rows before any classification or draft action', () => {
    const r = assessClient({ ...baseAssess, ads: [ad({ client_id: OTHER })] });
    expect(r.readiness).toBe('DATA_BLOCKED');
    expect(r.blockers.join(' ')).toContain('foreign_ad_rows_1');
    expect(r.ad_assessments).toHaveLength(0);
    expect(r.draft_actions).toEqual([]);
  });

  it('is INADEQUATE EVIDENCE when only the prior window is unusable', () => {
    const r = assessClient({ ...baseAssess, priorWindow: null });
    expect(r.readiness).toBe('INADEQUATE_EVIDENCE');
  });

  it('reports a custom daily budget as needing a custom plan', () => {
    const r = assessClient({ ...baseAssess, kpiTargets: { ...baseAssess.kpiTargets, max_daily_budget: 450 } });
    expect(r.tier_error).toBe('custom_daily_budget_requires_custom_plan');
    expect(r.tier_plan).toBeNull();
  });
});

/* ------------------------- endpoint request contract -------------------- */

describe('review endpoint request contract', () => {
  it('rejects non-POST methods', () => {
    for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const r = validateRequestShape(m, '{}');
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ status: 405, code: 'method_not_allowed' });
    }
  });

  it('rejects malformed JSON and non-object bodies explicitly', () => {
    for (const b of ['{oops', '[]', '"str"', '']) {
      const r = validateRequestShape('POST', b);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ status: 400 });
    }
  });

  it('requires a uuid client_id and has no portfolio mode', () => {
    expect(validateClientId(undefined).ok).toBe(false);
    expect(validateClientId('all').ok).toBe(false);
    expect(validateClientId('*').ok).toBe(false);
    expect(validateClientId(CLIENT).ok).toBe(true);
  });
});

/* ------------------------------ read adapter ---------------------------- */

interface FakeTables {
  clients?: unknown;
  client_settings?: unknown;
  client_kpi_targets?: unknown;
  meta_ad_accounts?: unknown;
  daily_metrics?: { rows: unknown[]; count?: number; error?: unknown };
  meta_ads?: { rows: unknown[]; count?: number; error?: unknown };
}

function fakeSupabase(tables: FakeTables) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const listed = (tables as Record<string, { rows: unknown[]; count?: number; error?: unknown } | undefined>)[table];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ['select', 'eq', 'gte', 'lte', 'order']) chain[m] = self;
      chain.range = () => Promise.resolve({ data: listed?.rows ?? [], error: listed?.error ?? null, count: listed?.count ?? (listed?.rows?.length ?? 0) });
      chain.maybeSingle = () => Promise.resolve({ data: (tables as Record<string, unknown>)[table] ?? null, error: null });
      return chain;
    },
  };
  return { client, reads };
}

describe('shared read adapter', () => {
  it('sums strictly: a null, NaN or negative value makes the sum unavailable rather than zero', () => {
    const rows = (vals: Array<number | null>): DailyRow[] => vals.map((v) => ({
      client_id: CLIENT, date: '2026-03-03', date_account_tz: '2026-03-03', ad_spend: v,
      impressions: 0, clicks: 0, leads: 0, funded_dollars: 0, commitment_dollars: 0,
    }));
    expect(sumStrict(rows([1, 2, 3]), 'ad_spend')).toBe(6);
    expect(sumStrict(rows([1, null]), 'ad_spend')).toBeNull();
    expect(sumStrict(rows([1, Number.NaN]), 'ad_spend')).toBeNull();
    expect(sumStrict(rows([1, -5]), 'ad_spend')).toBeNull();
  });

  it('normalises ad account ids', () => {
    expect(normalizeAdAccountId('act_123')).toBe('123');
    expect(normalizeAdAccountId('123')).toBe('123');
    expect(normalizeAdAccountId('')).toBeNull();
    expect(normalizeAdAccountId(null)).toBeNull();
  });

  it('blocks without reading dates when no timezone source is available', async () => {
    const { client } = fakeSupabase({
      clients: { id: CLIENT, name: 'C', status: 'active', meta_ad_account_id: null },
      client_settings: { client_id: CLIENT, stats_report_timezone: null },
      client_kpi_targets: { client_id: CLIENT, max_daily_budget: 500, guardrails: {} },
    });
    const loaded = await loadClientSopReport(client as never, CLIENT, NOW);
    expect(loaded.timezone.timezone).toBeNull();
    expect(loaded.month).toBeNull();
    expect(loaded.report?.readiness).toBe('DATA_BLOCKED');
    expect(loaded.report?.windows.current).toBeNull();
  });

  it('reports a missing client instead of guessing', async () => {
    const { client } = fakeSupabase({});
    const loaded = await loadClientSopReport(client as never, CLIENT, NOW);
    expect(loaded.fatal).toBe('client_not_found');
    expect(loaded.report).toBeNull();
  });

  it('detects truncation on the ads source as well as daily metrics', async () => {
    const { client } = fakeSupabase({
      clients: { id: CLIENT, name: 'C', status: 'active', meta_ad_account_id: 'act_9' },
      client_settings: { client_id: CLIENT, stats_report_timezone: TZ },
      client_kpi_targets: { client_id: CLIENT, max_daily_budget: 500, guardrails: {} },
      meta_ad_accounts: { ad_account_id: '9', timezone_name: TZ, account_name: 'A' },
      daily_metrics: { rows: [], count: 9999 },
      meta_ads: { rows: [{ meta_ad_id: 'a', client_id: CLIENT, status: 'ACTIVE' }], count: 9999 },
    });
    const loaded = await loadClientSopReport(client as never, CLIENT, NOW);
    expect(loaded.source_blockers).toContain('daily_metrics_truncated');
    expect(loaded.source_blockers).toContain('meta_ads_truncated');
    expect(loaded.report?.readiness).toBe('DATA_BLOCKED');
  });

  it('excludes the partial current day and reads MTD from the first of the month through yesterday', async () => {
    const { client } = fakeSupabase({
      clients: { id: CLIENT, name: 'C', status: 'active', meta_ad_account_id: 'act_9' },
      client_settings: { client_id: CLIENT, stats_report_timezone: TZ },
      client_kpi_targets: { client_id: CLIENT, max_daily_budget: 500, guardrails: {} },
      meta_ad_accounts: { ad_account_id: '9', timezone_name: TZ, account_name: 'A' },
      daily_metrics: { rows: [], count: 0 },
      meta_ads: { rows: [], count: 0 },
    });
    const loaded = await loadClientSopReport(client as never, CLIENT, NOW);
    expect(loaded.expectedCurrent).toEqual(CUR);
    expect(loaded.expectedPrior).toEqual(PRIOR);
    expect(loaded.month?.month_start).toBe('2026-03-01');
    expect(loaded.month?.mtd_end).toBe('2026-03-09');
    expect(loaded.month?.days_remaining_including_today).toBe(22);
  });

  it('never proposes a numeric action while the qualified-lead cohort source is missing', async () => {
    const { client } = fakeSupabase({
      clients: { id: CLIENT, name: 'C', status: 'active', meta_ad_account_id: 'act_9' },
      client_settings: { client_id: CLIENT, stats_report_timezone: TZ },
      client_kpi_targets: {
        client_id: CLIENT, max_daily_budget: 500,
        guardrails: { target_cpql: 100, qualification_lag_days: 1, funding_lag_days: 14, monthly_media_budget: 15000, pilot_loss_limit: 2000, sales_capacity_calls_per_week: 25, tracking_max_staleness_hours: 24, tracking_min_coverage_pct: 90, offer_reference: 'o', offer_approved: true },
      },
      meta_ad_accounts: { ad_account_id: '9', timezone_name: TZ, account_name: 'A' },
      daily_metrics: { rows: [], count: 0 },
      meta_ads: { rows: [], count: 0 },
    });
    const loaded = await loadClientSopReport(client as never, CLIENT, NOW);
    expect(loaded.report?.readiness).toBe('DATA_BLOCKED');
    expect(loaded.report?.draft_actions).toEqual([]);
    expect(loaded.connection_gaps.join(' ')).toContain('Matured qualified-lead cohort');
    expect(loaded.connection_gaps.join(' ')).toContain('tracking');
  });
});

/* ------------------- endpoint contract: auth before reads ---------------- */

describe('media-buyer-sop-review request handler (auth precedes every privileged read)', () => {
  const okLoaded = {
    report: null, fatal: null,
    timezone: { timezone: null, source: null, blockers: ['timezone_unresolved'], notes: [] },
    month: null, expectedCurrent: null, expectedPrior: null,
    source_blockers: [], connection_gaps: [],
  } as never;

  const CID = '11111111-2222-3333-4444-555555555555';

  function deps(over: Record<string, unknown> = {}) {
    const calls = { authorize: 0, load: 0 };
    const base = {
      method: 'POST',
      rawBody: JSON.stringify({ client_id: CID }),
      nowIso: '2026-03-20T10:00:00Z',
      startedAtMs: 0,
      elapsedMs: () => 1,
      authorize: async () => { calls.authorize++; return { ok: true, via: 'admin' }; },
      load: async () => { calls.load++; return okLoaded; },
      ...over,
    };
    return { base: base as never, calls };
  }

  it('performs ZERO privileged reads when the caller is unauthorized', async () => {
    const { base, calls } = deps({ authorize: async () => ({ ok: false, status: 401, error: 'missing token', code: 'missing_token' }) });
    const r = await handleSopReview(base);
    expect(r.status).toBe(401);
    expect(calls.load).toBe(0);
  });

  it('rejects a non-POST method before authorizing or reading anything', async () => {
    const { base, calls } = deps({ method: 'GET' });
    const r = await handleSopReview(base);
    expect(r.status).toBe(405);
    expect(calls.authorize).toBe(0);
    expect(calls.load).toBe(0);
  });

  it('rejects malformed JSON explicitly, with no authorization or read', async () => {
    const { base, calls } = deps({ rawBody: '{not json' });
    const r = await handleSopReview(base);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('malformed_json');
    expect(calls.authorize).toBe(0);
    expect(calls.load).toBe(0);
  });

  it('requires a client_id and never sweeps the whole portfolio', async () => {
    const { base, calls } = deps({ rawBody: JSON.stringify({}) });
    const r = await handleSopReview(base);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('client_id_required');
    expect(calls.load).toBe(0);
  });

  it('refuses a client-scoped caller asking about another client, before reading', async () => {
    const { base, calls } = deps({ authorize: async () => ({ ok: true, via: 'client_token', clientId: '99999999-2222-3333-4444-555555555555' }) });
    const r = await handleSopReview(base);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('client_scope_mismatch');
    expect(calls.load).toBe(0);
  });

  it('authorizes first, then reads once, and reports that nothing executes', async () => {
    const { base, calls } = deps();
    const r = await handleSopReview(base);
    expect(r.status).toBe(200);
    expect(calls.authorize).toBe(1);
    expect(calls.load).toBe(1);
    expect(r.body.executes_nothing).toBe(true);
    expect(r.body.narration).toBe('disabled_in_preview');
    expect(r.body.numeric_budget_proposals).toBe('disabled_in_preview');
  });

  it('serves the exportable operating instructions without any privileged read', async () => {
    const { base, calls } = deps({ rawBody: JSON.stringify({ action: 'operating_instructions' }) });
    const r = await handleSopReview(base);
    expect(r.status).toBe(200);
    expect(calls.load).toBe(0);
    expect(String(r.body.instructions)).toContain('DAILY');
  });
});

/* ----------------------------- read adapter ------------------------------ */

describe('read adapter date and metric mapping', () => {
  it('treats the account-local date as authoritative and never falls back to date', () => {
    expect(rowDate({ date_account_tz: '2026-03-10', date: '2026-03-09' } as never)).toBe('2026-03-10');
    expect(rowDate({ date_account_tz: null, date: '2026-03-09' } as never)).toBeNull();
  });

  it('never lets a null, NaN or negative value contribute zero to a sum', () => {
    expect(sumStrict([{ ad_spend: 10 }, { ad_spend: 5 }] as never, 'ad_spend')).toBe(15);
    expect(sumStrict([{ ad_spend: 10 }, { ad_spend: null }] as never, 'ad_spend')).toBeNull();
    expect(sumStrict([{ ad_spend: -1 }] as never, 'ad_spend')).toBeNull();
    expect(sumStrict([{ ad_spend: Number.NaN }] as never, 'ad_spend')).toBeNull();
  });

  it('selects only real daily_metrics columns', () => {
    expect(DAILY_METRICS_COLUMNS).toContain('date_account_tz');
    expect(DAILY_METRICS_COLUMNS).not.toContain('*');
  });
});
