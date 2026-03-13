
CREATE TABLE public.creative_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'ai_brief',
  winning_ad_summary JSONB,
  hook_patterns TEXT[],
  offer_angles TEXT[],
  recommended_variations JSONB,
  full_brief_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for authenticated users" ON public.creative_briefs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon users" ON public.creative_briefs
  FOR ALL TO anon USING (true) WITH CHECK (true);
