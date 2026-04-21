
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS weekly_sync_day smallint,
  ADD COLUMN IF NOT EXISTS weekly_sync_time time,
  ADD COLUMN IF NOT EXISTS weekly_sync_timezone text DEFAULT 'America/New_York';
