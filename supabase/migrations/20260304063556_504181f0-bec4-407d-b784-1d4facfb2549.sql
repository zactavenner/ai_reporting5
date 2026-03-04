
-- Update GHL contacts sync from every 4 hours to every 2 hours for more real-time data
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sync-ghl-all-clients-4h'),
  schedule := '0 */2 * * *'
);
