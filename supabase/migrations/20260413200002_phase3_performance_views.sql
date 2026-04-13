-- Phase 3: Source-of-truth views for dashboard consumption
-- All derived metrics computed in SQL, not client-side JavaScript.
-- Dashboard reads from these views exclusively.

-- ============================================================
-- 1. v_client_performance_daily — Single source of truth
-- ============================================================
CREATE OR REPLACE VIEW public.v_client_performance_daily AS
SELECT
  dm.id,
  dm.client_id,
  c.name AS client_name,
  c.status AS client_status,
  COALESCE(dm.date_account_tz, dm.date) AS report_date,
  dm.date AS date_utc,
  dm.date_account_tz,

  -- Ad metrics (owned by sync-meta-ads)
  COALESCE(dm.ad_spend, 0) AS ad_spend,
  COALESCE(dm.impressions, 0) AS impressions,
  COALESCE(dm.clicks, 0) AS clicks,
  COALESCE(dm.ctr, 0) AS ctr,
  COALESCE(dm.reach, 0) AS reach,
  COALESCE(dm.frequency, 0) AS frequency,

  -- CRM metrics (owned by recalculate-daily-metrics)
  COALESCE(dm.leads, 0) AS leads,
  COALESCE(dm.spam_leads, 0) AS spam_leads,
  COALESCE(dm.calls, 0) AS calls,
  COALESCE(dm.showed_calls, 0) AS showed_calls,
  COALESCE(dm.reconnect_calls, 0) AS reconnect_calls,
  COALESCE(dm.reconnect_showed, 0) AS reconnect_showed,
  COALESCE(dm.commitments, 0) AS commitments,
  COALESCE(dm.commitment_dollars, 0) AS commitment_dollars,
  COALESCE(dm.funded_investors, 0) AS funded_investors,
  COALESCE(dm.funded_dollars, 0) AS funded_dollars,
  COALESCE(dm.unattributed_leads, 0) AS unattributed_leads,

  -- Derived metrics (computed here, not in JS)
  CASE WHEN COALESCE(dm.leads, 0) > 0
    THEN ROUND(COALESCE(dm.ad_spend, 0) / dm.leads, 2)
    ELSE 0
  END AS cpl,

  CASE WHEN COALESCE(dm.calls, 0) > 0
    THEN ROUND(COALESCE(dm.ad_spend, 0) / dm.calls, 2)
    ELSE 0
  END AS dollar_per_call,

  CASE WHEN COALESCE(dm.showed_calls, 0) > 0
    THEN ROUND(COALESCE(dm.ad_spend, 0) / dm.showed_calls, 2)
    ELSE 0
  END AS dollar_per_show,

  CASE WHEN COALESCE(dm.calls, 0) > 0
    THEN ROUND((COALESCE(dm.showed_calls, 0)::NUMERIC / dm.calls) * 100, 1)
    ELSE 0
  END AS show_pct,

  CASE WHEN COALESCE(dm.funded_investors, 0) > 0
    THEN ROUND(COALESCE(dm.ad_spend, 0) / dm.funded_investors, 2)
    ELSE 0
  END AS cpa,

  CASE WHEN COALESCE(dm.funded_dollars, 0) > 0
    THEN ROUND((COALESCE(dm.ad_spend, 0) / dm.funded_dollars) * 100, 2)
    ELSE 0
  END AS cost_of_capital_pct,

  dm.created_at,
  dm.updated_at
FROM public.daily_metrics dm
JOIN public.clients c ON c.id = dm.client_id;

-- ============================================================
-- 2. v_client_performance_weekly — Aggregated from daily
-- ============================================================
CREATE OR REPLACE VIEW public.v_client_performance_weekly AS
SELECT
  client_id,
  client_name,
  client_status,
  date_trunc('week', report_date)::DATE AS week_start,
  (date_trunc('week', report_date) + INTERVAL '6 days')::DATE AS week_end,
  EXTRACT(ISOYEAR FROM report_date)::INTEGER AS iso_year,
  EXTRACT(WEEK FROM report_date)::INTEGER AS iso_week,

  SUM(ad_spend) AS ad_spend,
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  CASE WHEN SUM(impressions) > 0
    THEN ROUND((SUM(clicks)::NUMERIC / SUM(impressions)) * 100, 4)
    ELSE 0
  END AS ctr,
  SUM(reach) AS reach,

  SUM(leads) AS leads,
  SUM(spam_leads) AS spam_leads,
  SUM(calls) AS calls,
  SUM(showed_calls) AS showed_calls,
  SUM(reconnect_calls) AS reconnect_calls,
  SUM(reconnect_showed) AS reconnect_showed,
  SUM(commitments) AS commitments,
  SUM(commitment_dollars) AS commitment_dollars,
  SUM(funded_investors) AS funded_investors,
  SUM(funded_dollars) AS funded_dollars,

  -- Derived (recomputed from sums, not averaged)
  CASE WHEN SUM(leads) > 0
    THEN ROUND(SUM(ad_spend) / SUM(leads), 2)
    ELSE 0
  END AS cpl,

  CASE WHEN SUM(calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(calls), 2)
    ELSE 0
  END AS dollar_per_call,

  CASE WHEN SUM(showed_calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2)
    ELSE 0
  END AS dollar_per_show,

  CASE WHEN SUM(calls) > 0
    THEN ROUND((SUM(showed_calls)::NUMERIC / SUM(calls)) * 100, 1)
    ELSE 0
  END AS show_pct,

  CASE WHEN SUM(funded_investors) > 0
    THEN ROUND(SUM(ad_spend) / SUM(funded_investors), 2)
    ELSE 0
  END AS cpa,

  CASE WHEN SUM(funded_dollars) > 0
    THEN ROUND((SUM(ad_spend) / SUM(funded_dollars)) * 100, 2)
    ELSE 0
  END AS cost_of_capital_pct,

  COUNT(*) AS days_in_period

FROM public.v_client_performance_daily
GROUP BY client_id, client_name, client_status, date_trunc('week', report_date), EXTRACT(ISOYEAR FROM report_date), EXTRACT(WEEK FROM report_date);

-- ============================================================
-- 3. v_client_performance_monthly — Aggregated from daily
-- ============================================================
CREATE OR REPLACE VIEW public.v_client_performance_monthly AS
SELECT
  client_id,
  client_name,
  client_status,
  date_trunc('month', report_date)::DATE AS month_start,
  EXTRACT(YEAR FROM report_date)::INTEGER AS year,
  EXTRACT(MONTH FROM report_date)::INTEGER AS month,

  SUM(ad_spend) AS ad_spend,
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  CASE WHEN SUM(impressions) > 0
    THEN ROUND((SUM(clicks)::NUMERIC / SUM(impressions)) * 100, 4)
    ELSE 0
  END AS ctr,
  SUM(reach) AS reach,

  SUM(leads) AS leads,
  SUM(spam_leads) AS spam_leads,
  SUM(calls) AS calls,
  SUM(showed_calls) AS showed_calls,
  SUM(reconnect_calls) AS reconnect_calls,
  SUM(reconnect_showed) AS reconnect_showed,
  SUM(commitments) AS commitments,
  SUM(commitment_dollars) AS commitment_dollars,
  SUM(funded_investors) AS funded_investors,
  SUM(funded_dollars) AS funded_dollars,

  -- Derived (recomputed from sums)
  CASE WHEN SUM(leads) > 0
    THEN ROUND(SUM(ad_spend) / SUM(leads), 2)
    ELSE 0
  END AS cpl,

  CASE WHEN SUM(calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(calls), 2)
    ELSE 0
  END AS dollar_per_call,

  CASE WHEN SUM(showed_calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2)
    ELSE 0
  END AS dollar_per_show,

  CASE WHEN SUM(calls) > 0
    THEN ROUND((SUM(showed_calls)::NUMERIC / SUM(calls)) * 100, 1)
    ELSE 0
  END AS show_pct,

  CASE WHEN SUM(funded_investors) > 0
    THEN ROUND(SUM(ad_spend) / SUM(funded_investors), 2)
    ELSE 0
  END AS cpa,

  CASE WHEN SUM(funded_dollars) > 0
    THEN ROUND((SUM(ad_spend) / SUM(funded_dollars)) * 100, 2)
    ELSE 0
  END AS cost_of_capital_pct,

  COUNT(*) AS days_in_period

FROM public.v_client_performance_daily
GROUP BY client_id, client_name, client_status, date_trunc('month', report_date), EXTRACT(YEAR FROM report_date), EXTRACT(MONTH FROM report_date);

-- ============================================================
-- 4. v_agency_performance_monthly — Portfolio rollup (weighted by spend)
-- ============================================================
CREATE OR REPLACE VIEW public.v_agency_performance_monthly AS
SELECT
  year,
  month,
  month_start,
  COUNT(DISTINCT client_id) AS client_count,

  SUM(ad_spend) AS total_ad_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks,
  SUM(leads) AS total_leads,
  SUM(calls) AS total_calls,
  SUM(showed_calls) AS total_showed_calls,
  SUM(commitments) AS total_commitments,
  SUM(commitment_dollars) AS total_commitment_dollars,
  SUM(funded_investors) AS total_funded_investors,
  SUM(funded_dollars) AS total_funded_dollars,

  -- Agency-level derived metrics (weighted, not averaged)
  CASE WHEN SUM(leads) > 0
    THEN ROUND(SUM(ad_spend) / SUM(leads), 2)
    ELSE 0
  END AS avg_cpl,

  CASE WHEN SUM(calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(calls), 2)
    ELSE 0
  END AS avg_dollar_per_call,

  CASE WHEN SUM(showed_calls) > 0
    THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2)
    ELSE 0
  END AS avg_dollar_per_show,

  CASE WHEN SUM(calls) > 0
    THEN ROUND((SUM(showed_calls)::NUMERIC / SUM(calls)) * 100, 1)
    ELSE 0
  END AS avg_show_pct,

  CASE WHEN SUM(funded_investors) > 0
    THEN ROUND(SUM(ad_spend) / SUM(funded_investors), 2)
    ELSE 0
  END AS avg_cpa,

  -- Cost of Capital: SUM(spend) / SUM(funded$), NOT AVG of per-client ratios
  CASE WHEN SUM(funded_dollars) > 0
    THEN ROUND((SUM(ad_spend) / SUM(funded_dollars)) * 100, 2)
    ELSE 0
  END AS cost_of_capital_pct

FROM public.v_client_performance_monthly
GROUP BY year, month, month_start;
