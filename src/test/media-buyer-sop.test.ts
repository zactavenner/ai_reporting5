import { describe, it, expect } from 'vitest';
import {
  BUDGET_TIERS,
  planBudgetTier,
  planColdStart,
  computeTestDays,
  resolveSopConfig,
  validateWindow,
  checkTrackingHealth,
  validateBinding,
  classifyAd,
  buildDraftActions,
  computePacing,
  assessClient,
  todayInTz,
  addDays,
  buildOperatingInstructions,
  SOP_NARRATOR_SYSTEM_PROMPT,
  type AdInput,
  type ClassifyContext,
  type SopConfig,
  type Window,
} from '../../supabase/functions/_shared/mediaBuyerSop.ts';

const TZ = 'America/Los_Angeles';
const CLIENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-09-08T12:00:00Z'; // 05:00 in Los Angeles

function fullConfig(): SopConfig {
  return {
    target_cpql: 400,
    qualification_lag_days: 3,
    funding_lag_days: 30,
    monthly_media_budget_usd: 12000,
    approved_daily_budget_usd: 400,
    offer_reference: 'offer-abc',
    offer_approved: true,
    pilot_loss_limit_usd: 2000,
    sales_capacity_calls_per_week: 20,
    tracking_max_staleness_hours: 24,
    tracking_min_coverage_pct: 90,
  };
}

function guardrailsRow() {
  return {
    client_id: CLIENT,
    max_daily_budget: 400,
    guardrails: {
      target_cpql: 400,
      qualification_lag_days: 3,
      funding_lag_days: 30,
      monthly_media_budget: 12000,
      offer_reference: 'offer-abc',
      offer_approved: true,
      pilot_loss_limit: 2000,
      sales_capacity_calls_per_week: 20,
      tracking_max_staleness_hours: 24,
      tracking_min_coverage_pct: 90,
    },
  };
}

function win(over: Partial<Window> = {}): Window {
  const today = todayInTz(NOW, TZ);
  const end = addDays(today, -1);
  return {
    client_id: CLIENT,
    timezone: TZ,
    start_date: addDays(end, -6),
    end_date: end,
    complete_days: 7,
    expected_days: 7,
    spend_usd: 2800,
    impressions: 100000,
    clicks_outbound: 1200,
    leads: 40,
    qualified_leads_matured: 8,
    qualification_cohort_end: addDays(today, -4),
    frequency: { available: false, reason: 'not directly sourced' },
    source_complete: true,
    truncated: false,
    ...over,
  };
}

function ctx(over: Partial<ClassifyContext> = {}): ClassifyContext {
  return {
    config: fullConfig(),
    dataBlockers: [],
    configMissing: [],
    complete_days: 7,
    monthly_headroom_usd: 6000,
    sales_capacity_headroom: 10,
    ...over,
  };
}

function ad(over: Partial<AdInput> = {}): AdInput {
  return {
    ad_id: 'ad-1',
    client_id: CLIENT,
    hours_live: 240,
    daily_budget_usd: 100,
    current: {
      spend_usd: 2000, clicks_outbound: 500, impressions: 50000,
      qualified_leads_matured: 10, frequency: { available: false, reason: 'not sourced' },
    },
    prior: {
      spend_usd: 2000, clicks_outbound: 500, impressions: 50000,
      qualified_leads_matured: 10, frequency: { available: false, reason: 'not sourced' },
    },
    downstream_quality: 'acceptable',
    ...over,
  };
}

/* ---------------------------------------------------------------- */

describe('budget tiers', () => {
  it('every published tier sums to its weekly budget', () => {
    for (const t of BUDGET_TIERS) {
      expect(t.core_usd + t.test_usd + t.retargeting_usd).toBe(t.weekly_budget_usd);
    }
    expect(BUDGET_TIERS.map((t) => t.weekly_budget_usd)).toEqual([200, 300, 500, 1000]);
  });

  it('matches each exact tier with its concepts and variants', () => {
    const expected = [
      [200, 160, 40, 0, 2, 2],
      [300, 210, 60, 30, 2, 3],
      [500, 350, 100, 50, 3, 3],
      [1000, 700, 200, 100, 4, 4],
    ];
    for (const [budget, core, test, rt, concepts, variants] of expected) {
      const p = planBudgetTier(budget, true);
      if ('error' in p) throw new Error('unexpected tier error');
      expect([p.core_usd, p.test_usd, p.retargeting_usd, p.weekly_concepts, p.variants_per_concept])
        .toEqual([core, test, rt, concepts, variants]);
      expect(p.core_usd + p.test_usd + p.retargeting_usd).toBe(budget);
    }
  });

  it('returns retargeting to core when retargeting is unviable, keeping the sum', () => {
    const p = planBudgetTier(500, false);
    if ('error' in p) throw new Error('unexpected');
    expect(p.retargeting_usd).toBe(0);
    expect(p.core_usd).toBe(400);
    expect(p.test_usd).toBe(100);
    expect(p.core_usd + p.test_usd + p.retargeting_usd).toBe(500);
  });

  it('fails closed on unknown or sub-minimum budgets', () => {
    expect(planBudgetTier(null, true)).toEqual({ error: 'weekly_budget_unavailable' });
    expect(planBudgetTier(-1, true)).toEqual({ error: 'weekly_budget_unavailable' });
    expect(planBudgetTier(150, true)).toEqual({ error: 'weekly_budget_below_minimum_tier_200' });
  });

  it('prepared assets are inventory, and cold start stays one campaign / one ad set / 3-6 ads', () => {
    const p = planBudgetTier(1000, true);
    if ('error' in p) throw new Error('unexpected');
    expect(p.prepared_assets_per_week).toBe(16);
    expect(p.notes.join(' ')).toMatch(/not a launch quota/i);
    const cs = planColdStart(2000, p);
    if ('error' in cs) throw new Error('unexpected');
    expect(cs.campaigns).toBe(1);
    expect(cs.prospecting_adsets).toBe(1);
    expect(cs.min_ads).toBe(3);
    expect(cs.max_ads).toBeLessThanOrEqual(6);
  });

  it('does not force many ads on a small test budget and needs a pilot loss limit', () => {
    const small = planBudgetTier(200, true);
    if ('error' in small) throw new Error('unexpected');
    const cs = planColdStart(500, small);
    if ('error' in cs) throw new Error('unexpected');
    expect(cs.max_ads).toBe(3);
    expect(cs.notes.join(' ')).toMatch(/do not force testing of many ads/i);
    expect(planColdStart(null, small)).toEqual({ error: 'pilot_loss_limit_unavailable' });
  });
});

describe('test duration', () => {
  it('uses 3x target CPQL over actual test daily spend, with the 72h floor and lag', () => {
    const r = computeTestDays(400, 100, 3);
    if ('error' in r) throw new Error('unexpected');
    expect(r.spend_days).toBe(12);
    expect(r.days).toBe(15);
  });

  it('never returns less than 72h plus the lag', () => {
    const r = computeTestDays(100, 1000, 2);
    if ('error' in r) throw new Error('unexpected');
    expect(r.days).toBe(5);
  });

  it('fails closed without a target CPQL or a lag', () => {
    expect(computeTestDays(null, 100, 3)).toEqual({ error: 'target_cpql_unavailable' });
    expect(computeTestDays(400, 100, null)).toEqual({ error: 'qualification_lag_days_unavailable' });
  });
});

describe('configuration resolution', () => {
  it('reports every missing key with its source field and never infers CPQL from CPL', () => {
    const r = resolveSopConfig({ client_id: CLIENT, guardrails: { target_cpl: 120 } });
    expect(r.ok).toBe(false);
    expect(r.config.target_cpql).toBeNull();
    const keys = r.missing.map((m) => m.key);
    expect(keys).toContain('target_cpql');
    expect(keys).toContain('qualification_lag_days');
    const cpql = r.fields.find((f) => f.key === 'target_cpql')!;
    expect(cpql.source_field).toBe('client_kpi_targets.guardrails.target_cpql');
  });

  it('accepts a fully configured row', () => {
    const r = resolveSopConfig(guardrailsRow());
    expect(r.ok).toBe(true);
    expect(r.config.target_cpql).toBe(400);
    expect(r.config.approved_daily_budget_usd).toBe(400);
  });

  it('treats a null row as fully unconfigured, not as zeroes', () => {
    const r = resolveSopConfig(null);
    expect(r.ok).toBe(false);
    expect(r.config.monthly_media_budget_usd).toBeNull();
    expect(r.missing.length).toBe(r.fields.length);
  });
});

describe('evidence validation', () => {
  const opts = { clientId: CLIENT, nowIso: NOW, timezone: TZ, qualificationLagDays: 3 };

  it('accepts a clean completed window', () => {
    expect(validateWindow(win(), opts)).toEqual({ ok: true, blockers: [] });
  });

  it('rejects missing evidence', () => {
    expect(validateWindow(null, opts)).toEqual({ ok: false, blockers: ['evidence_missing'] });
  });

  it('rejects evidence from another client', () => {
    const r = validateWindow(win({ client_id: OTHER }), opts);
    expect(r.blockers).toContain('evidence_wrong_client');
  });

  it('rejects a window that includes the partial current day', () => {
    const today = todayInTz(NOW, TZ);
    const r = validateWindow(win({ start_date: addDays(today, -6), end_date: today }), opts);
    expect(r.blockers).toContain('evidence_includes_partial_current_day');
  });

  it('rejects future-dated windows', () => {
    const today = todayInTz(NOW, TZ);
    const r = validateWindow(win({ start_date: addDays(today, 1), end_date: addDays(today, 7) }), opts);
    expect(r.ok).toBe(false);
    expect(r.blockers).toContain('evidence_includes_partial_current_day');
  });

  it('rejects stale windows', () => {
    const today = todayInTz(NOW, TZ);
    const end = addDays(today, -20);
    const r = validateWindow(win({ start_date: addDays(end, -6), end_date: end, qualification_cohort_end: end }), opts);
    expect(r.blockers).toContain('evidence_stale');
  });

  it('rejects malformed dates, incomplete day counts, truncation and source errors', () => {
    expect(validateWindow(win({ start_date: 'nope' }), opts).blockers).toContain('evidence_malformed_dates');
    expect(validateWindow(win({ complete_days: 5 }), opts).blockers).toContain('evidence_day_count_mismatch');
    expect(validateWindow(win({ truncated: true }), opts).blockers).toContain('evidence_truncated');
    expect(validateWindow(win({ source_error: 'timeout' }), opts).blockers).toContain('evidence_source_error');
    expect(validateWindow(win({ source_complete: false }), opts).blockers).toContain('evidence_window_incomplete');
  });

  it('treats null as unavailable and rejects negative counts', () => {
    expect(validateWindow(win({ leads: null }), opts).blockers).toContain('evidence_null_leads');
    expect(validateWindow(win({ spend_usd: -5 }), opts).blockers).toContain('evidence_invalid_spend_usd');
    expect(validateWindow(win({ qualified_leads_matured: null }), opts).blockers)
      .toContain('evidence_null_qualified_leads_matured');
  });

  it('requires the qualification cohort to honour the client lag', () => {
    const today = todayInTz(NOW, TZ);
    const r = validateWindow(win({ qualification_cohort_end: addDays(today, -1) }), opts);
    expect(r.blockers).toContain('qualification_cohort_not_matured');
    const noLag = validateWindow(win(), { ...opts, qualificationLagDays: null });
    expect(noLag.blockers).toContain('qualification_lag_days_unavailable');
  });

  it('excludes the current day using the client timezone, not UTC', () => {
    // 2026-09-08T02:00Z is still 2026-09-07 in Los Angeles.
    const iso = '2026-09-08T02:00:00Z';
    expect(todayInTz(iso, TZ)).toBe('2026-09-07');
    expect(todayInTz(iso, 'UTC')).toBe('2026-09-08');
    const r = validateWindow(win({ end_date: '2026-09-07', start_date: '2026-09-01', qualification_cohort_end: '2026-09-01' }), { ...opts, nowIso: iso });
    expect(r.blockers).toContain('evidence_includes_partial_current_day');
  });

  it('fails closed on unknown tracking freshness or coverage', () => {
    expect(checkTrackingHealth(null, fullConfig()).blockers).toContain('tracking_health_unknown');
    expect(checkTrackingHealth({ freshness_hours: null, coverage_pct: 95 }, fullConfig()).blockers)
      .toContain('tracking_freshness_unknown');
    expect(checkTrackingHealth({ freshness_hours: 100, coverage_pct: 95 }, fullConfig()).blockers)
      .toContain('tracking_stale');
    expect(checkTrackingHealth({ freshness_hours: 2, coverage_pct: 50 }, fullConfig()).blockers)
      .toContain('tracking_coverage_below_requirement');
    expect(checkTrackingHealth({ freshness_hours: 2, coverage_pct: 95 }, fullConfig()).ok).toBe(true);
  });

  it('validates the client + offer + ad account binding', () => {
    expect(validateBinding({ clientId: CLIENT, clientStatus: 'active', metaAdAccountId: 'act_1', offerReference: 'offer-abc' }).ok).toBe(true);
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: null, offerReference: 'o' }).blockers).toContain('meta_ad_account_unbound');
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: 'a', offerReference: 'o', offerClientId: OTHER }).blockers)
      .toContain('offer_client_mismatch');
    expect(validateBinding({ clientId: CLIENT, metaAdAccountId: 'a', offerReference: 'o', adAccountClientId: OTHER }).blockers)
      .toContain('ad_account_client_mismatch');
  });
});

describe('ad classification', () => {
  it('puts data health first and proposes nothing when blocked', () => {
    const a = classifyAd(ad(), ctx({ dataBlockers: ['current:evidence_stale'] }));
    expect(a.status).toBe('DATA_BLOCKED');
    const drafts = buildDraftActions([a], [ad()], ctx({ dataBlockers: ['current:evidence_stale'] }));
    expect(drafts.actions).toEqual([]);
    expect(drafts.blocked).toBe(true);
    expect(drafts.total_delta_usd).toBe(0);
  });

  it('never returns KEEP when configuration is missing', () => {
    const missing = ctx({ configMissing: ['target_cpql'], config: { ...fullConfig(), target_cpql: null } });
    const a = classifyAd(ad(), missing);
    expect(a.status).toBe('CONFIGURATION_NEEDED');
    expect(buildDraftActions([a], [ad()], missing).actions).toEqual([]);
  });

  it('is INSUFFICIENT DATA under 72h live', () => {
    expect(classifyAd(ad({ hours_live: 40 }), ctx()).status).toBe('INSUFFICIENT_DATA');
    expect(classifyAd(ad({ hours_live: null }), ctx()).status).toBe('INSUFFICIENT_DATA');
  });

  it('is INSUFFICIENT DATA below the spend and matured-event floors', () => {
    const a = classifyAd(ad({ current: { spend_usd: 500, clicks_outbound: 100, impressions: 20000, qualified_leads_matured: 1, frequency: { available: false, reason: 'x' } } }), ctx());
    expect(a.status).toBe('INSUFFICIENT_DATA');
  });

  it('flags a pause candidate at 3x target CPQL with zero matured qualified leads', () => {
    const a = classifyAd(ad({
      current: { spend_usd: 1300, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 0, frequency: { available: false, reason: 'x' } },
    }), ctx());
    expect(a.status).toBe('PAUSE_CANDIDATE');
    expect(a.recommendation_only).toBe(true);
  });

  it('flags a pause candidate only after two completed windows above 1.25x target', () => {
    const over = { spend_usd: 3000, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 4, frequency: { available: false, reason: 'x' } };
    expect(classifyAd(ad({ current: over, prior: over }), ctx()).status).toBe('PAUSE_CANDIDATE');
    const okPrior = { spend_usd: 1600, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 4, frequency: { available: false, reason: 'x' } };
    expect(classifyAd(ad({ current: over, prior: okPrior }), ctx()).status).not.toBe('PAUSE_CANDIDATE');
  });

  it('never kills on frequency alone', () => {
    const a = classifyAd(ad({
      current: { spend_usd: 1800, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 4, frequency: { available: true, value: 3.6, source: 'meta_unique_reach_window' } },
      prior: { spend_usd: 1800, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 4, frequency: { available: true, value: 1.2, source: 'meta_unique_reach_window' } },
    }), ctx());
    expect(a.status).not.toBe('PAUSE_CANDIDATE');
    expect(['WATCH', 'ITERATE']).toContain(a.status);
  });

  it('marks aggregate frequency unavailable rather than reconstructing it', () => {
    const a = classifyAd(ad(), ctx());
    expect(a.frequency_note).toMatch(/unavailable/i);
    expect(a.frequency_note).toMatch(/never reconstructed/i);
  });

  it('iterates on 25% CPQL deterioration plus a 15% outbound CTR decline', () => {
    const a = classifyAd(ad({
      current: { spend_usd: 2000, clicks_outbound: 300, impressions: 60000, qualified_leads_matured: 4, frequency: { available: false, reason: 'x' } },
      prior: { spend_usd: 2000, clicks_outbound: 600, impressions: 60000, qualified_leads_matured: 8, frequency: { available: false, reason: 'x' } },
    }), ctx());
    expect(a.status).toBe('ITERATE');
    expect(a.cpql_change_pct).toBeCloseTo(100, 5);
  });

  it('keeps a healthy ad and never scales a cheap ad with poor downstream quality', () => {
    const keep = classifyAd(ad({ current: { spend_usd: 1200, clicks_outbound: 500, impressions: 50000, qualified_leads_matured: 12, frequency: { available: false, reason: 'x' } } }), ctx());
    expect(keep.status).toBe('SCALE_CANDIDATE');
    const poor = classifyAd(ad({
      downstream_quality: 'poor',
      current: { spend_usd: 1200, clicks_outbound: 500, impressions: 50000, qualified_leads_matured: 12, frequency: { available: false, reason: 'x' } },
    }), ctx());
    expect(poor.status).toBe('WATCH');
    expect(poor.reasons.join(' ')).toMatch(/quality poor/i);
  });

  it('holds back scale when maturity, headroom or capacity is missing', () => {
    const cheap = { spend_usd: 1200, clicks_outbound: 500, impressions: 50000, qualified_leads_matured: 5, frequency: { available: false as const, reason: 'x' } };
    expect(classifyAd(ad({ current: cheap }), ctx()).status).toBe('KEEP');
    const rich = { ...cheap, qualified_leads_matured: 12 };
    expect(classifyAd(ad({ current: rich }), ctx({ sales_capacity_headroom: null })).status).toBe('KEEP');
    expect(classifyAd(ad({ current: rich }), ctx({ monthly_headroom_usd: 0 })).status).toBe('KEEP');
    expect(classifyAd(ad({ current: rich }), ctx({ complete_days: 4 })).status).toBe('KEEP');
  });

  it('DATA BLOCKS when downstream quality is unknown', () => {
    expect(classifyAd(ad({ downstream_quality: 'unknown' }), ctx()).status).toBe('DATA_BLOCKED');
  });
});

describe('draft actions', () => {
  it('caps a scale step at +20% and computes sums, not model guesses', () => {
    const rich = { spend_usd: 1200, clicks_outbound: 500, impressions: 50000, qualified_leads_matured: 12, frequency: { available: false as const, reason: 'x' } };
    const a = ad({ current: rich, daily_budget_usd: 100 });
    const assessment = classifyAd(a, ctx());
    const d = buildDraftActions([assessment], [a], ctx());
    expect(d.actions[0].kind).toBe('increase_daily_budget');
    expect(d.actions[0].proposed_daily_budget_usd).toBe(120);
    expect(d.actions[0].delta_usd).toBe(20);
    expect(d.actions[0].monthly_impact_usd).toBe(600);
    expect(d.actions[0].requires_human_approval).toBe(true);
    expect(d.actions[0].inert).toBe(true);
    expect(d.total_delta_usd).toBe(20);
    expect(d.total_monthly_impact_usd).toBe(600);
  });

  it('withholds an increase that breaches the monthly cap', () => {
    const rich = { spend_usd: 1200, clicks_outbound: 500, impressions: 50000, qualified_leads_matured: 12, frequency: { available: false as const, reason: 'x' } };
    const a = ad({ current: rich, daily_budget_usd: 100 });
    const c = ctx({ monthly_headroom_usd: 100 });
    const d = buildDraftActions([classifyAd(a, c)], [a], c);
    expect(d.actions[0].kind).toBe('no_action');
    expect(d.total_delta_usd).toBe(0);
  });
});

describe('pacing', () => {
  it('is unknown without a monthly budget and computes the implied daily otherwise', () => {
    expect(computePacing({ mtdSpendUsd: 1000, monthlyBudgetUsd: null, approvedDailyUsd: 400, daysRemaining: 10 }).status).toBe('unknown');
    const p = computePacing({ mtdSpendUsd: 6000, monthlyBudgetUsd: 12000, approvedDailyUsd: 400, daysRemaining: 15 });
    expect(p.remaining_usd).toBe(6000);
    expect(p.implied_daily_usd).toBe(400);
    expect(p.status).toBe('on_pace');
  });
});

describe('client assessment', () => {
  const baseInput = () => ({
    client: { id: CLIENT, name: 'Test Client', status: 'active', meta_ad_account_id: 'act_123', timezone: TZ },
    kpiTargets: guardrailsRow(),
    currentWindow: win(),
    priorWindow: win({ start_date: addDays(win().start_date, -7), end_date: addDays(win().end_date, -7), qualification_cohort_end: addDays(win().end_date, -7) }),
    tracking: { freshness_hours: 4, coverage_pct: 95 },
    ads: [ad()],
    weeklyBudgetUsd: 500,
    retargetingViable: true,
    mtdSpendUsd: 4000,
    daysRemainingInMonth: 20,
    salesCapacityHeadroom: 5,
    fundedClearedUsd: 250000,
    commitmentsUsd: 400000,
    nowIso: NOW,
  });

  it('reports CONFIGURATION NEEDED before anything else', () => {
    const r = assessClient({ ...baseInput(), kpiTargets: { client_id: CLIENT, guardrails: {} } });
    expect(r.readiness).toBe('CONFIGURATION_NEEDED');
    expect(r.draft_actions).toEqual([]);
    expect(r.config_missing.length).toBeGreaterThan(0);
  });

  it('reports DATA BLOCKED on stale tracking and proposes no spend', () => {
    const r = assessClient({ ...baseInput(), tracking: { freshness_hours: 200, coverage_pct: 95 } });
    expect(r.readiness).toBe('DATA_BLOCKED');
    expect(r.draft_actions).toEqual([]);
    expect(r.total_monthly_impact_usd).toBe(0);
  });

  it('is READY with clean evidence and keeps capital language separate', () => {
    const r = assessClient(baseInput());
    expect(r.readiness).toBe('READY');
    expect(r.tier_plan?.matched_tier_weekly_budget).toBe(500);
    expect(r.capital.funded_cleared_usd).toBe(250000);
    expect(r.capital.commitments_usd).toBe(400000);
    expect(r.capital.note).toMatch(/not revenue ROAS/i);
    expect(r.next_checks.length).toBeGreaterThan(0);
  });

  it('drops ads belonging to another client and flags the mix as a binding blocker', () => {
    const r = assessClient({ ...baseInput(), ads: [ad(), ad({ ad_id: 'ad-foreign', client_id: OTHER })] });
    expect(r.ad_assessments.map((a) => a.ad_id)).toEqual(['ad-1']);
    expect(r.blockers.join(' ')).toMatch(/foreign_ad_rows_1/);
  });

  it('marks inadequate evidence when the prior window is unusable', () => {
    const r = assessClient({ ...baseInput(), priorWindow: null });
    expect(r.readiness).toBe('INADEQUATE_EVIDENCE');
  });
});

describe('operating instructions and narrator prompt', () => {
  it('exports the SOP without claiming autonomy or deployment', () => {
    const text = buildOperatingInstructions();
    expect(text).toMatch(/RECOMMENDATION/);
    expect(text).toMatch(/\$200\/wk/);
    expect(text).toMatch(/not a launch quota/i);
    expect(text).not.toMatch(/autonomous/i);
  });

  it('constrains the optional narrator', () => {
    expect(SOP_NARRATOR_SYSTEM_PROMPT).toMatch(/UNTRUSTED DATA/);
    expect(SOP_NARRATOR_SYSTEM_PROMPT).toMatch(/never approve spending|Never approve spending/);
    expect(SOP_NARRATOR_SYSTEM_PROMPT).toMatch(/cannot override/i);
  });
});
