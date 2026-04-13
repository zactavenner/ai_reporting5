
-- 1. Add 'source' column to existing sync_runs table
ALTER TABLE public.sync_runs ADD COLUMN IF NOT EXISTS source TEXT;

-- 2. Daily performance view with ALL derived fields computed server-side
CREATE OR REPLACE VIEW public.v_client_performance_daily AS
SELECT
  dm.id,
  dm.client_id,
  c.name AS client_name,
  dm.date,
  COALESCE(dm.date_account_tz, dm.date) AS date_account_tz,
  COALESCE(dm.ad_spend, 0)::numeric          AS ad_spend,
  COALESCE(dm.impressions, 0)                 AS impressions,
  COALESCE(dm.clicks, 0)                      AS clicks,
  COALESCE(dm.ctr, 0)::numeric               AS ctr,
  COALESCE(dm.leads, 0)                       AS leads,
  COALESCE(dm.spam_leads, 0)                  AS spam_leads,
  COALESCE(dm.calls, 0)                       AS calls,
  COALESCE(dm.showed_calls, 0)                AS showed_calls,
  COALESCE(dm.reconnect_calls, 0)             AS reconnect_calls,
  COALESCE(dm.reconnect_showed, 0)            AS reconnect_showed,
  COALESCE(dm.commitments, 0)                 AS commitments,
  COALESCE(dm.commitment_dollars, 0)::numeric AS commitment_dollars,
  COALESCE(dm.funded_investors, 0)            AS funded_count,
  COALESCE(dm.funded_dollars, 0)::numeric     AS funded_dollars,
  CASE WHEN COALESCE(dm.leads, 0) > 0
       THEN ROUND(COALESCE(dm.ad_spend, 0)::numeric / dm.leads, 2)
       ELSE 0 END                             AS cpl,
  CASE WHEN COALESCE(dm.calls, 0) > 0
       THEN ROUND(COALESCE(dm.ad_spend, 0)::numeric / dm.calls, 2)
       ELSE 0 END                             AS dollar_per_call,
  CASE WHEN COALESCE(dm.showed_calls, 0) > 0
       THEN ROUND(COALESCE(dm.ad_spend, 0)::numeric / dm.showed_calls, 2)
       ELSE 0 END                             AS dollar_per_show,
  CASE WHEN COALESCE(dm.calls, 0) > 0
       THEN ROUND(COALESCE(dm.showed_calls, 0)::numeric / dm.calls * 100, 1)
       ELSE 0 END                             AS show_pct,
  CASE WHEN COALESCE(dm.funded_investors, 0) > 0
       THEN ROUND(COALESCE(dm.ad_spend, 0)::numeric / dm.funded_investors, 2)
       ELSE 0 END                             AS cpa,
  CASE WHEN COALESCE(dm.funded_dollars, 0) > 0
       THEN ROUND(COALESCE(dm.ad_spend, 0)::numeric / dm.funded_dollars * 100, 2)
       ELSE 0 END                             AS cost_of_capital_pct
FROM public.daily_metrics dm
JOIN public.clients c ON c.id = dm.client_id;

-- 3. Weekly performance view (Monday-based weeks via ISO week)
CREATE OR REPLACE VIEW public.v_client_performance_weekly AS
SELECT
  client_id,
  client_name,
  date_trunc('week', date_account_tz)::date   AS week_start,
  SUM(ad_spend)                                AS ad_spend,
  SUM(impressions)                             AS impressions,
  SUM(clicks)                                  AS clicks,
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2)
       ELSE 0 END                              AS ctr,
  SUM(leads)                                   AS leads,
  SUM(spam_leads)                              AS spam_leads,
  SUM(calls)                                   AS calls,
  SUM(showed_calls)                            AS showed_calls,
  SUM(reconnect_calls)                         AS reconnect_calls,
  SUM(reconnect_showed)                        AS reconnect_showed,
  SUM(commitments)                             AS commitments,
  SUM(commitment_dollars)                      AS commitment_dollars,
  SUM(funded_count)                            AS funded_count,
  SUM(funded_dollars)                          AS funded_dollars,
  CASE WHEN SUM(leads) > 0
       THEN ROUND(SUM(ad_spend) / SUM(leads), 2)
       ELSE 0 END                              AS cpl,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(calls), 2)
       ELSE 0 END                              AS dollar_per_call,
  CASE WHEN SUM(showed_calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2)
       ELSE 0 END                              AS dollar_per_show,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(showed_calls)::numeric / SUM(calls) * 100, 1)
       ELSE 0 END                              AS show_pct,
  CASE WHEN SUM(funded_count) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_count), 2)
       ELSE 0 END                              AS cpa,
  CASE WHEN SUM(funded_dollars) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_dollars) * 100, 2)
       ELSE 0 END                              AS cost_of_capital_pct
FROM public.v_client_performance_daily
GROUP BY client_id, client_name, date_trunc('week', date_account_tz);

-- 4. Monthly performance view
CREATE OR REPLACE VIEW public.v_client_performance_monthly AS
SELECT
  client_id,
  client_name,
  date_trunc('month', date_account_tz)::date   AS month_start,
  SUM(ad_spend)                                 AS ad_spend,
  SUM(impressions)                              AS impressions,
  SUM(clicks)                                   AS clicks,
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2)
       ELSE 0 END                               AS ctr,
  SUM(leads)                                    AS leads,
  SUM(spam_leads)                               AS spam_leads,
  SUM(calls)                                    AS calls,
  SUM(showed_calls)                             AS showed_calls,
  SUM(reconnect_calls)                          AS reconnect_calls,
  SUM(reconnect_showed)                         AS reconnect_showed,
  SUM(commitments)                              AS commitments,
  SUM(commitment_dollars)                       AS commitment_dollars,
  SUM(funded_count)                             AS funded_count,
  SUM(funded_dollars)                           AS funded_dollars,
  CASE WHEN SUM(leads) > 0
       THEN ROUND(SUM(ad_spend) / SUM(leads), 2)
       ELSE 0 END                               AS cpl,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(calls), 2)
       ELSE 0 END                               AS dollar_per_call,
  CASE WHEN SUM(showed_calls) > 0
       THEN ROUND(SUM(ad_spend) / SUM(showed_calls), 2)
       ELSE 0 END                               AS dollar_per_show,
  CASE WHEN SUM(calls) > 0
       THEN ROUND(SUM(showed_calls)::numeric / SUM(calls) * 100, 1)
       ELSE 0 END                               AS show_pct,
  CASE WHEN SUM(funded_count) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_count), 2)
       ELSE 0 END                               AS cpa,
  CASE WHEN SUM(funded_dollars) > 0
       THEN ROUND(SUM(ad_spend) / SUM(funded_dollars) * 100, 2)
       ELSE 0 END                               AS cost_of_capital_pct
FROM public.v_client_performance_daily
GROUP BY client_id, client_name, date_trunc('month', date_account_tz);
