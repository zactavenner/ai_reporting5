
ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS meta_reported_leads numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversion_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_purchases numeric DEFAULT 0;

ALTER TABLE public.meta_ad_sets
  ADD COLUMN IF NOT EXISTS meta_reported_leads numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversion_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_purchases numeric DEFAULT 0;

ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS meta_reported_leads numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_conversion_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_reported_purchases numeric DEFAULT 0;
