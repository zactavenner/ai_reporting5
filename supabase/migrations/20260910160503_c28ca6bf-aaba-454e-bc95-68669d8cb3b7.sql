ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_status text,
  ADD COLUMN IF NOT EXISTS transcript_error text,
  ADD COLUMN IF NOT EXISTS transcript_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS generation_prompt text,
  ADD COLUMN IF NOT EXISTS generation_source text;

CREATE INDEX IF NOT EXISTS idx_meta_ads_media_type ON public.meta_ads (media_type);
CREATE INDEX IF NOT EXISTS idx_meta_ads_cost_per_lead ON public.meta_ads (cost_per_lead);

CREATE TABLE IF NOT EXISTS public.creative_recreations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_meta_ad_id uuid REFERENCES public.meta_ads(id) ON DELETE SET NULL,
  source_client_id uuid,
  target_client_id uuid NOT NULL,
  source_ad_name text,
  angle_notes text,
  script text,
  image_prompt text,
  image_url text,
  model text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_recreations_target ON public.creative_recreations (target_client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_recreations TO authenticated;
GRANT ALL ON public.creative_recreations TO service_role;

ALTER TABLE public.creative_recreations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view recreations" ON public.creative_recreations;
CREATE POLICY "Authenticated can view recreations" ON public.creative_recreations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can create recreations" ON public.creative_recreations;
CREATE POLICY "Authenticated can create recreations" ON public.creative_recreations
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update recreations" ON public.creative_recreations;
CREATE POLICY "Authenticated can update recreations" ON public.creative_recreations
  FOR UPDATE TO authenticated USING (true);