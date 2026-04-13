-- 1. meta_ad_accounts: cache ad account timezones
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  ad_account_id TEXT PRIMARY KEY,
  timezone_name TEXT NOT NULL DEFAULT 'America/New_York',
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read meta_ad_accounts"
  ON public.meta_ad_accounts FOR SELECT USING (true);

CREATE POLICY "Service insert/update meta_ad_accounts"
  ON public.meta_ad_accounts FOR ALL USING (true) WITH CHECK (true);

-- 2. meta_api_calls: paper trail for every Meta API call
CREATE TABLE IF NOT EXISTS public.meta_api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  params JSONB,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  status_code INTEGER,
  response_summary JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read meta_api_calls"
  ON public.meta_api_calls FOR SELECT USING (true);

CREATE POLICY "Service insert meta_api_calls"
  ON public.meta_api_calls FOR INSERT WITH CHECK (true);

CREATE INDEX idx_meta_api_calls_client_id ON public.meta_api_calls(client_id);
CREATE INDEX idx_meta_api_calls_started_at ON public.meta_api_calls(started_at DESC);

-- 3. sync_runs: observability for sync functions
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running',
  rows_written INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sync_runs"
  ON public.sync_runs FOR SELECT USING (true);

CREATE POLICY "Service insert/update sync_runs"
  ON public.sync_runs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_sync_runs_function ON public.sync_runs(function_name);
CREATE INDEX idx_sync_runs_client ON public.sync_runs(client_id);
CREATE INDEX idx_sync_runs_started ON public.sync_runs(started_at DESC);

-- 4. Add date_account_tz to daily_metrics
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS date_account_tz DATE;

-- Backfill from existing date column
UPDATE public.daily_metrics
  SET date_account_tz = date::date
  WHERE date_account_tz IS NULL;

-- Add unique constraint for upserts on (client_id, date_account_tz)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_client_date_tz
  ON public.daily_metrics(client_id, date_account_tz);