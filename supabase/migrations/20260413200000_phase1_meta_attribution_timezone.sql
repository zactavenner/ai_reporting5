-- Phase 1: Fix Meta attribution window + timezone (root cause of data drift)
-- This migration creates infrastructure for proper Meta API timezone handling,
-- attribution window tracking, and API call auditing.

-- ============================================================
-- 1. meta_ad_accounts: Cache ad account timezone from Meta API
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  timezone_name TEXT NOT NULL DEFAULT 'America/New_York',
  currency TEXT DEFAULT 'USD',
  name TEXT,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meta_ad_accounts"
  ON public.meta_ad_accounts FOR SELECT USING (true);

CREATE POLICY "Service role full access to meta_ad_accounts"
  ON public.meta_ad_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_meta_ad_accounts_client ON public.meta_ad_accounts(client_id);
CREATE INDEX idx_meta_ad_accounts_ad_account ON public.meta_ad_accounts(ad_account_id);

-- ============================================================
-- 2. meta_api_calls: Audit trail for every Meta API call
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_api_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  status_code INTEGER,
  response_summary JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meta_api_calls"
  ON public.meta_api_calls FOR SELECT USING (true);

CREATE POLICY "Service role full access to meta_api_calls"
  ON public.meta_api_calls FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_meta_api_calls_client ON public.meta_api_calls(client_id, started_at DESC);
CREATE INDEX idx_meta_api_calls_started ON public.meta_api_calls(started_at DESC);

-- Auto-cleanup: keep 30 days of API call logs
CREATE INDEX idx_meta_api_calls_created ON public.meta_api_calls(created_at);

-- ============================================================
-- 3. Add date_account_tz to daily_metrics
-- ============================================================
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS date_account_tz DATE;

-- Backfill: copy existing date values (assumes they were approximately correct)
UPDATE public.daily_metrics
  SET date_account_tz = date
  WHERE date_account_tz IS NULL;

-- Create index for the new column (will become the primary lookup)
CREATE INDEX IF NOT EXISTS idx_daily_metrics_client_date_tz
  ON public.daily_metrics(client_id, date_account_tz);

-- Note: We don't drop the old unique constraint yet — we add a new one
-- and migrate gradually. The edge functions will prefer date_account_tz.
-- Once backfill is confirmed, a follow-up migration can swap the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_metrics_client_date_account_tz
  ON public.daily_metrics(client_id, date_account_tz)
  WHERE date_account_tz IS NOT NULL;

-- ============================================================
-- 4. Add reach + frequency columns to daily_metrics (fetched from Meta)
-- ============================================================
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,4) DEFAULT 0;
