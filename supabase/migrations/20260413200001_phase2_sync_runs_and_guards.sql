-- Phase 2: Sync observability + metric ownership guards
-- Every sync function logs a run. Metric ownership is enforced via comments
-- and a reference enum (soft guard — full column-level trigger guard is Phase 2b).

-- ============================================================
-- 1. sync_runs: Observability for every sync execution
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('meta', 'ghl', 'hubspot', 'fathom', 'manual', 'reconciliation')),
  function_name TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  rows_written INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view sync_runs"
  ON public.sync_runs FOR SELECT USING (true);

CREATE POLICY "Service role full access to sync_runs"
  ON public.sync_runs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_sync_runs_client ON public.sync_runs(client_id, started_at DESC);
CREATE INDEX idx_sync_runs_source ON public.sync_runs(source, started_at DESC);
CREATE INDEX idx_sync_runs_status ON public.sync_runs(status) WHERE status != 'success';

-- ============================================================
-- 2. Metric ownership reference (documented, soft-enforced)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.metric_ownership (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL DEFAULT 'daily_metrics',
  column_name TEXT NOT NULL,
  owner_function TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(table_name, column_name)
);

ALTER TABLE public.metric_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view metric_ownership"
  ON public.metric_ownership FOR SELECT USING (true);

CREATE POLICY "Service role full access to metric_ownership"
  ON public.metric_ownership FOR ALL USING (true) WITH CHECK (true);

-- Seed the ownership data
INSERT INTO public.metric_ownership (table_name, column_name, owner_function, description) VALUES
  ('daily_metrics', 'ad_spend', 'sync-meta-ads', 'Total ad spend from Meta Ads Manager'),
  ('daily_metrics', 'impressions', 'sync-meta-ads', 'Total impressions from Meta'),
  ('daily_metrics', 'clicks', 'sync-meta-ads', 'Total clicks from Meta'),
  ('daily_metrics', 'ctr', 'sync-meta-ads', 'Click-through rate from Meta'),
  ('daily_metrics', 'reach', 'sync-meta-ads', 'Total reach from Meta'),
  ('daily_metrics', 'frequency', 'sync-meta-ads', 'Average frequency from Meta'),
  ('daily_metrics', 'unattributed_leads', 'sync-meta-ads', 'Leads not attributed to any campaign'),
  ('daily_metrics', 'leads', 'recalculate-daily-metrics', 'Lead count from GHL/CRM'),
  ('daily_metrics', 'spam_leads', 'recalculate-daily-metrics', 'Spam lead count from GHL/CRM'),
  ('daily_metrics', 'calls', 'recalculate-daily-metrics', 'Call count from GHL calendars'),
  ('daily_metrics', 'showed_calls', 'recalculate-daily-metrics', 'Showed call count from GHL'),
  ('daily_metrics', 'reconnect_calls', 'recalculate-daily-metrics', 'Reconnect call count'),
  ('daily_metrics', 'reconnect_showed', 'recalculate-daily-metrics', 'Reconnect showed count'),
  ('daily_metrics', 'commitments', 'recalculate-daily-metrics', 'Commitment count from funded_investors'),
  ('daily_metrics', 'commitment_dollars', 'recalculate-daily-metrics', 'Commitment dollar total'),
  ('daily_metrics', 'funded_investors', 'recalculate-daily-metrics', 'Funded investor count'),
  ('daily_metrics', 'funded_dollars', 'recalculate-daily-metrics', 'Funded dollar total')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- ============================================================
-- 3. Function to validate metric ownership (callable from edge functions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_metric_ownership(
  p_column_names TEXT[],
  p_function_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invalid_count
  FROM unnest(p_column_names) AS col(name)
  JOIN public.metric_ownership mo ON mo.column_name = col.name AND mo.table_name = 'daily_metrics'
  WHERE mo.owner_function != p_function_name;

  RETURN v_invalid_count = 0;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;
