
-- Persistent outbound GHL request/response logging
CREATE TABLE public.ghl_outbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id),
  client_id uuid REFERENCES public.clients(id),
  function_name text NOT NULL,
  endpoint text NOT NULL,
  http_method text NOT NULL DEFAULT 'POST',
  request_payload jsonb,
  response_status_code integer,
  response_body jsonb,
  ghl_contact_id text,
  duration_ms integer,
  attempt_number integer DEFAULT 1,
  final_state text NOT NULL DEFAULT 'pending',
  error_class text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_ghl_outbound_log_client ON public.ghl_outbound_log(client_id);
CREATE INDEX idx_ghl_outbound_log_lead ON public.ghl_outbound_log(lead_id);
CREATE INDEX idx_ghl_outbound_log_state ON public.ghl_outbound_log(final_state);
CREATE INDEX idx_ghl_outbound_log_created ON public.ghl_outbound_log(created_at DESC);

ALTER TABLE public.ghl_outbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ghl_outbound_log"
  ON public.ghl_outbound_log FOR ALL
  USING (true) WITH CHECK (true);

-- Daily reconciliation results table
CREATE TABLE public.ghl_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  reconciliation_date date NOT NULL DEFAULT CURRENT_DATE,
  local_lead_count integer NOT NULL DEFAULT 0,
  ghl_contact_count integer NOT NULL DEFAULT 0,
  missing_in_ghl integer NOT NULL DEFAULT 0,
  extra_in_ghl integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  sample_missing_lead_ids uuid[] DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, reconciliation_date)
);

CREATE INDEX idx_ghl_recon_client_date ON public.ghl_reconciliation_results(client_id, reconciliation_date DESC);

ALTER TABLE public.ghl_reconciliation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ghl_reconciliation_results"
  ON public.ghl_reconciliation_results FOR ALL
  USING (true) WITH CHECK (true);
