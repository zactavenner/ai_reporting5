
-- Add spam lead attribution columns to meta tables
ALTER TABLE public.meta_campaigns ADD COLUMN IF NOT EXISTS attributed_spam_leads integer DEFAULT 0;
ALTER TABLE public.meta_ad_sets ADD COLUMN IF NOT EXISTS attributed_spam_leads integer DEFAULT 0;
ALTER TABLE public.meta_ads ADD COLUMN IF NOT EXISTS attributed_spam_leads integer DEFAULT 0;
