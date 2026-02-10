
-- Add MeetGeek settings to client_settings
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS meetgeek_api_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meetgeek_webhook_secret text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meetgeek_region text DEFAULT 'us',
  ADD COLUMN IF NOT EXISTS meetgeek_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meetgeek_last_sync timestamp with time zone DEFAULT NULL;
