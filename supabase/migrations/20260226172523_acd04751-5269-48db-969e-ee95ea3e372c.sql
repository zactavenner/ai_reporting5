
-- Funnel stages for conversion visualization
CREATE TABLE public.funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  stage_url text,
  conversion_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view funnel_stages" ON public.funnel_stages
  FOR SELECT USING (true);
CREATE POLICY "Public can insert funnel_stages" ON public.funnel_stages
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update funnel_stages" ON public.funnel_stages
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete funnel_stages" ON public.funnel_stages
  FOR DELETE USING (true);

-- Funnel snapshots for historical tracking
CREATE TABLE public.funnel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  conversion_rate numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view funnel_snapshots" ON public.funnel_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Public can insert funnel_snapshots" ON public.funnel_snapshots
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update funnel_snapshots" ON public.funnel_snapshots
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete funnel_snapshots" ON public.funnel_snapshots
  FOR DELETE USING (true);

-- Trigger for updated_at on funnel_stages
CREATE TRIGGER update_funnel_stages_updated_at
  BEFORE UPDATE ON public.funnel_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
