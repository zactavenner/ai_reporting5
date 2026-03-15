-- Data Accuracy Audit Log Table
-- Stores results of each automated accuracy check run

CREATE TABLE IF NOT EXISTS public.data_accuracy_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period TEXT NOT NULL DEFAULT 'last_30_days',
  client_id UUID REFERENCES public.clients(id),
  client_name TEXT,
  source TEXT NOT NULL,                    -- GHL, Meta_API, Meta_Campaign_Sum, DailyMetrics
  comparison_source TEXT,                  -- What it's being compared against
  metric TEXT NOT NULL,                    -- leads, calls, bookings, shows, spend, impressions, clicks
  expected_count NUMERIC,                  -- The "truth" value (raw source)
  actual_count NUMERIC,                    -- The "reported" value (aggregated/stored)
  discrepancy_pct NUMERIC,                 -- Absolute percentage difference
  threshold_pct NUMERIC NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'WARN')),
  alert_triggered BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_data_accuracy_audit_run ON public.data_accuracy_audit_log(run_id);
CREATE INDEX IF NOT EXISTS idx_data_accuracy_audit_client ON public.data_accuracy_audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_data_accuracy_audit_timestamp ON public.data_accuracy_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_data_accuracy_audit_status ON public.data_accuracy_audit_log(status);

-- Audit run summary table (one row per run)
CREATE TABLE IF NOT EXISTS public.data_accuracy_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period TEXT NOT NULL DEFAULT 'last_30_days',
  total_checks INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  pass_rate_pct NUMERIC,
  clients_audited INTEGER DEFAULT 0,
  open_discrepancies INTEGER DEFAULT 0,
  alert_triggered BOOLEAN DEFAULT FALSE,
  run_by TEXT DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_accuracy_runs_timestamp ON public.data_accuracy_audit_runs(timestamp DESC);

-- Enable RLS
ALTER TABLE public.data_accuracy_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_accuracy_audit_runs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read on audit_log" ON public.data_accuracy_audit_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read on audit_runs" ON public.data_accuracy_audit_runs
  FOR SELECT TO authenticated USING (true);

-- Allow service role to insert
CREATE POLICY "Allow service insert on audit_log" ON public.data_accuracy_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Allow service insert on audit_runs" ON public.data_accuracy_audit_runs
  FOR INSERT TO service_role WITH CHECK (true);
