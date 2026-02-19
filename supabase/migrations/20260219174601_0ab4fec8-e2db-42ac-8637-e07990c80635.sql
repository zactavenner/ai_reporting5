
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_colors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_fonts jsonb DEFAULT '[]'::jsonb;
