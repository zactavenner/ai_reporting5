
-- Cache page metadata so we don't re-fetch on every page load
CREATE TABLE public.funnel_step_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id uuid NOT NULL REFERENCES public.client_funnel_steps(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  description text,
  image text,
  site_name text,
  favicon text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(step_id)
);

-- No RLS needed - this is public metadata cache, same as funnel steps
ALTER TABLE public.funnel_step_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read funnel step metadata"
  ON public.funnel_step_metadata FOR SELECT USING (true);

CREATE POLICY "Anyone can insert funnel step metadata"
  ON public.funnel_step_metadata FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update funnel step metadata"
  ON public.funnel_step_metadata FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete funnel step metadata"
  ON public.funnel_step_metadata FOR DELETE USING (true);
