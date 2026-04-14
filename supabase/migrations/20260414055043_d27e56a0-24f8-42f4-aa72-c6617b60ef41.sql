-- Remove duplicate sync-meta-ads-daily standalone cron (Job 15)
-- daily-master-sync at 08:00 UTC already calls it
SELECT cron.unschedule(15);

-- Remove duplicate sync-ghl-all-clients every-2-hour crons (Jobs 23 and 26)
-- These fire 24 times/day combined = too many GHL API calls
SELECT cron.unschedule(23);
SELECT cron.unschedule(26);

-- Add single evening GHL sync at 20:00 UTC (3:00 PM EST) for afternoon data freshness
-- Morning sync already handled by daily-master-sync at 08:00 UTC
SELECT cron.schedule(
  'sync-ghl-evening',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/sync-ghl-all-clients',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4"}'::jsonb,
    body := '{"sinceDateDays": 1}'::jsonb
  ) AS request_id;
  $$
);