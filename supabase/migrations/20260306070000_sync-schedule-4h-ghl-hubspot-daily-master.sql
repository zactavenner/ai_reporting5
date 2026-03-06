-- ============================================================
-- 1. Revert GHL sync from every 2 hours back to every 4 hours
-- ============================================================
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sync-ghl-all-clients-4h'),
  schedule := '0 0,4,8,12,16,20 * * *'
);

-- ============================================================
-- 2. Add HubSpot all-clients sync every 4 hours (offset by 1h from GHL)
-- Runs at 1,5,9,13,17,21 UTC so GHL and HubSpot don't overlap
-- ============================================================
SELECT cron.schedule(
  'sync-hubspot-all-clients-4h',
  '0 1,5,9,13,17,21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/sync-hubspot-all-clients',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================
-- 3. Add daily master sync at 7:00 AM UTC
--    Runs: Meta Ads → GHL → HubSpot → Recalculate Metrics
--          → Accuracy Check → RetargetIQ → Token Health
-- ============================================================
SELECT cron.schedule(
  'daily-master-sync-7am',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/daily-master-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
