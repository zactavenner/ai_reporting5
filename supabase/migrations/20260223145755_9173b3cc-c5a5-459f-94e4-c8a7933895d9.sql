
-- Fix 3: Add day-specific columns to daily_metrics for accurate per-day tracking
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS leads_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_scheduled integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_showed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commitments_on_day integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funded_on_day integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unattributed_leads integer DEFAULT 0;

-- Fix 5: Add funded_tag_pattern to client_settings for configurable tag detection
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS funded_tag_pattern text DEFAULT NULL;

-- Fix 4: Create sync_warnings table for logging unknown statuses and sync issues
CREATE TABLE IF NOT EXISTS public.sync_warnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  warning_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view sync_warnings"
  ON public.sync_warnings FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to sync_warnings"
  ON public.sync_warnings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sync_warnings_client_created 
  ON public.sync_warnings(client_id, created_at DESC);

-- Auto-cleanup old warnings (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_sync_warnings_created_at 
  ON public.sync_warnings(created_at);
