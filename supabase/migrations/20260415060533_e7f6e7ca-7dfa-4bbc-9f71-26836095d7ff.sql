-- Add consecutive failure tracking to clients
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS consecutive_meta_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_ghl_failures integer NOT NULL DEFAULT 0;

-- Create client_sync_health view
CREATE OR REPLACE VIEW public.client_sync_health AS
WITH last_meta_sync AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    started_at,
    finished_at,
    status,
    error_message
  FROM public.sync_runs
  WHERE function_name IN ('sync-meta-ads', 'sync-meta-ads-daily', 'daily-master-sync')
    AND source IS NOT DISTINCT FROM 'master'
    AND client_id IS NOT NULL
    AND status = 'completed'
  ORDER BY client_id, finished_at DESC
),
last_meta_attempt AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    finished_at,
    status,
    error_message
  FROM public.sync_runs
  WHERE function_name IN ('sync-meta-ads', 'daily-master-sync')
    AND client_id IS NOT NULL
  ORDER BY client_id, finished_at DESC
),
last_ghl_sync AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    started_at,
    finished_at,
    status,
    error_message
  FROM public.sync_runs
  WHERE function_name IN ('sync-ghl-contacts', 'sync-ghl-all-clients', 'daily-master-sync')
    AND client_id IS NOT NULL
    AND status = 'completed'
  ORDER BY client_id, finished_at DESC
),
last_ghl_attempt AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    finished_at,
    status,
    error_message
  FROM public.sync_runs
  WHERE function_name IN ('sync-ghl-contacts', 'daily-master-sync')
    AND client_id IS NOT NULL
  ORDER BY client_id, finished_at DESC
),
recent_data AS (
  SELECT 
    client_id,
    COALESCE(SUM(ad_spend), 0) AS recent_spend,
    COALESCE(SUM(leads), 0) AS recent_leads
  FROM public.daily_metrics
  WHERE date >= (CURRENT_DATE - 7)
  GROUP BY client_id
)
SELECT
  c.id AS client_id,
  c.name AS client_name,
  c.status AS client_status,
  c.meta_ad_account_id,
  c.ghl_location_id,
  c.ghl_api_key IS NOT NULL AS has_ghl_credentials,
  -- Meta health
  lms.finished_at AS last_meta_success_at,
  lma.finished_at AS last_meta_attempt_at,
  lma.status AS last_meta_attempt_status,
  lma.error_message AS last_meta_error,
  c.consecutive_meta_failures,
  EXTRACT(EPOCH FROM (NOW() - lms.finished_at)) / 3600.0 AS meta_hours_since_success,
  -- GHL health
  lgs.finished_at AS last_ghl_success_at,
  lga.finished_at AS last_ghl_attempt_at,
  lga.status AS last_ghl_attempt_status,
  lga.error_message AS last_ghl_error,
  c.consecutive_ghl_failures,
  EXTRACT(EPOCH FROM (NOW() - lgs.finished_at)) / 3600.0 AS ghl_hours_since_success,
  -- Data presence
  COALESCE(rd.recent_spend, 0) AS recent_spend,
  COALESCE(rd.recent_leads, 0) AS recent_leads,
  (COALESCE(rd.recent_spend, 0) > 0 OR COALESCE(rd.recent_leads, 0) > 0) AS expected_data_present,
  -- Overall health
  CASE
    WHEN c.meta_ad_account_id IS NOT NULL AND (lms.finished_at IS NULL OR EXTRACT(EPOCH FROM (NOW() - lms.finished_at)) / 3600.0 > 48) THEN 'failing'
    WHEN c.ghl_api_key IS NOT NULL AND (lgs.finished_at IS NULL OR EXTRACT(EPOCH FROM (NOW() - lgs.finished_at)) / 3600.0 > 48) THEN 'failing'
    WHEN c.consecutive_meta_failures > 0 OR c.consecutive_ghl_failures > 0 THEN 'degraded'
    WHEN lms.finished_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - lms.finished_at)) / 3600.0 > 24 THEN 'stale'
    WHEN lgs.finished_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - lgs.finished_at)) / 3600.0 > 24 THEN 'stale'
    ELSE 'healthy'
  END AS overall_health
FROM public.clients c
LEFT JOIN last_meta_sync lms ON lms.client_id = c.id
LEFT JOIN last_meta_attempt lma ON lma.client_id = c.id
LEFT JOIN last_ghl_sync lgs ON lgs.client_id = c.id
LEFT JOIN last_ghl_attempt lga ON lga.client_id = c.id
LEFT JOIN recent_data rd ON rd.client_id = c.id
WHERE c.status IN ('active', 'onboarding');