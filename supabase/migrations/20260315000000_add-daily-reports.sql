-- Daily Close Reports: enterprise-grade daily accuracy reporting
-- Stores a structured daily report per day with per-client metrics, discrepancies, and sync health

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'partial', 'failed')),

  -- Agency-wide totals for the report date
  total_clients integer NOT NULL DEFAULT 0,
  total_leads integer NOT NULL DEFAULT 0,
  total_calls integer NOT NULL DEFAULT 0,
  total_showed integer NOT NULL DEFAULT 0,
  total_funded integer NOT NULL DEFAULT 0,
  total_ad_spend numeric(12,2) NOT NULL DEFAULT 0,
  total_funded_dollars numeric(12,2) NOT NULL DEFAULT 0,

  -- Day-over-day deltas
  leads_delta integer DEFAULT 0,
  calls_delta integer DEFAULT 0,
  showed_delta integer DEFAULT 0,
  funded_delta integer DEFAULT 0,
  ad_spend_delta numeric(12,2) DEFAULT 0,

  -- Accuracy metrics
  discrepancies_found integer NOT NULL DEFAULT 0,
  discrepancies_fixed integer NOT NULL DEFAULT 0,
  clients_with_issues integer NOT NULL DEFAULT 0,

  -- Per-client breakdown (JSONB array)
  -- Each entry: { client_id, client_name, leads, calls, showed, funded, ad_spend,
  --               leads_delta, calls_delta, sync_status, discrepancies: [{metric, expected, actual, fixed}] }
  client_details jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Sync health summary
  healthy_clients integer NOT NULL DEFAULT 0,
  stale_clients integer NOT NULL DEFAULT 0,
  error_clients integer NOT NULL DEFAULT 0,
  not_configured_clients integer NOT NULL DEFAULT 0,

  -- Slack notification status
  slack_sent boolean NOT NULL DEFAULT false,
  slack_sent_at timestamp with time zone,

  -- Timing
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,

  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports (report_date DESC);

-- RLS
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view daily_reports" ON public.daily_reports FOR SELECT USING (true);
CREATE POLICY "Public can insert daily_reports" ON public.daily_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update daily_reports" ON public.daily_reports FOR UPDATE USING (true) WITH CHECK (true);
