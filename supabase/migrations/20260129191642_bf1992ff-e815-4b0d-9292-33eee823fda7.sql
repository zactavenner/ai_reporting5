-- Create table for funnel step variants (A/B split tests)
CREATE TABLE public.funnel_step_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.client_funnel_steps(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Variant A',
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funnel_step_variants ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth required for this app)
CREATE POLICY "Allow all read access" ON public.funnel_step_variants
  FOR SELECT USING (true);

CREATE POLICY "Allow all insert access" ON public.funnel_step_variants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all update access" ON public.funnel_step_variants
  FOR UPDATE USING (true);

CREATE POLICY "Allow all delete access" ON public.funnel_step_variants
  FOR DELETE USING (true);

-- Add index for faster lookups
CREATE INDEX idx_funnel_step_variants_step_id ON public.funnel_step_variants(step_id);