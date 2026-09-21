ALTER TABLE public.sendblue_accounts
  ADD COLUMN IF NOT EXISTS provider_slug TEXT,
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS webhook_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS webhook_receive_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_outbound_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_registered_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webhook_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_last_error TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_event_at TIMESTAMPTZ;