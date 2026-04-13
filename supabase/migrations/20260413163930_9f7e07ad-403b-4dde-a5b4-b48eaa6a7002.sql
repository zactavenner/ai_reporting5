
-- Agency-level monthly rollup — spend-weighted, not simple-averaged
CREATE OR REPLACE VIEW public.v_agency_performance_monthly AS
SELECT
  date_trunc('month', date_account_tz)::date AS month_start,
  SUM(ad_spend)              AS ad_spend,
  SUM(leads)                 AS leads,
  SUM(calls)                 AS calls,
  SUM(showed_calls)          AS showed_calls,
  SUM(commitments)           AS commitments,
  SUM(commitment_dollars)    AS commitment_dollars,
  SUM(funded_count)          AS funded_count,
  SUM(funded_dollars)        AS funded_dollars,
  CASE WHEN SUM(leads) > 0
       THEN ROUND(SUM(ad_spend) / SUM(leads), 2) ELSE 0 END AS cpl,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(calls), 2) ELSE 0 END AS dollar_per_call,
  CASE WHEN SUM(showed_calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2) ELSE 0 END AS dollar_per_show,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(showed_calls)::numeric / SUM(calls) * 100, 1) ELSE 0 END AS show_pct,
  CASE WHEN SUM(funded_count) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_count), 2) ELSE 0 END AS cpa,
  CASE WHEN SUM(funded_dollars) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_dollars) * 100, 2) ELSE 0 END AS cost_of_capital_pct,
  COUNT(DISTINCT client_id)  AS client_count
FROM public.v_client_performance_daily
GROUP BY date_trunc('month', date_account_tz);

-- Agency-level weekly rollup for sparklines
CREATE OR REPLACE VIEW public.v_agency_performance_weekly AS
SELECT
  date_trunc('week', date_account_tz)::date AS week_start,
  SUM(ad_spend)              AS ad_spend,
  SUM(funded_dollars)        AS funded_dollars,
  CASE WHEN SUM(funded_dollars) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_dollars) * 100, 2) ELSE 0 END AS cost_of_capital_pct,
  COUNT(DISTINCT client_id)  AS client_count
FROM public.v_client_performance_daily
GROUP BY date_trunc('week', date_account_tz);

-- Set security invoker
ALTER VIEW public.v_agency_performance_monthly SET (security_invoker = on);
ALTER VIEW public.v_agency_performance_weekly SET (security_invoker = on);
