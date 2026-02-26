
-- =============================================
-- FIX 2: Deal Pipeline Tables
-- =============================================

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_name text NOT NULL,
  deal_value numeric(12,2) NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'Lead',
  probability integer NOT NULL DEFAULT 0,
  expected_close_date date,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  source text,
  assigned_to text,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view deals" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Public can insert deals" ON public.deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update deals" ON public.deals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete deals" ON public.deals FOR DELETE USING (true);

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note',
  description text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view deal_activities" ON public.deal_activities FOR SELECT USING (true);
CREATE POLICY "Public can insert deal_activities" ON public.deal_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete deal_activities" ON public.deal_activities FOR DELETE USING (true);

-- =============================================
-- FIX 3: Reconciliation Tables
-- =============================================

CREATE TABLE public.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  total_checks integer NOT NULL DEFAULT 0,
  mismatches_found integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view reconciliation_runs" ON public.reconciliation_runs FOR SELECT USING (true);
CREATE POLICY "Public can insert reconciliation_runs" ON public.reconciliation_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update reconciliation_runs" ON public.reconciliation_runs FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  source_name text NOT NULL,
  dashboard_value numeric,
  source_value numeric,
  delta numeric,
  delta_percent numeric,
  is_mismatch boolean NOT NULL DEFAULT false,
  threshold_percent numeric NOT NULL DEFAULT 5.0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view reconciliation_items" ON public.reconciliation_items FOR SELECT USING (true);
CREATE POLICY "Public can insert reconciliation_items" ON public.reconciliation_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update reconciliation_items" ON public.reconciliation_items FOR UPDATE USING (true) WITH CHECK (true);
