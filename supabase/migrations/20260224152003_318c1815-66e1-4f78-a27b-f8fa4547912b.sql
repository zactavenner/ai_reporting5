-- Remove the redundant hourly sync-ghl-contacts cron job (jobid 6)
-- It tries to sync ALL clients at once without background processing, causing 400 errors
SELECT cron.unschedule(6);

-- Remove the redundant hourly sync-ghl-pipelines job (jobid 11)
-- The orchestrator already handles pipelines per-client
SELECT cron.unschedule(11);

-- Update the GHL orchestrator to run every 4 hours instead of 6 for fresher data
SELECT cron.unschedule(16);
SELECT cron.schedule(
  'sync-ghl-all-clients-4h',
  '0 0,4,8,12,16,20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/sync-ghl-all-clients',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);