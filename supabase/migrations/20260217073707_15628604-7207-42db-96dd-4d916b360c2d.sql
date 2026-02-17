
-- Add attribution columns to meta_campaigns
ALTER TABLE meta_campaigns 
  ADD COLUMN IF NOT EXISTS attributed_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_calls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_showed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded_dollars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_lead numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_call numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_funded numeric DEFAULT 0;

-- Add attribution columns to meta_ad_sets
ALTER TABLE meta_ad_sets 
  ADD COLUMN IF NOT EXISTS attributed_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_calls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_showed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded_dollars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_lead numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_call numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_funded numeric DEFAULT 0;

-- Add attribution columns to meta_ads
ALTER TABLE meta_ads 
  ADD COLUMN IF NOT EXISTS attributed_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_calls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_showed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_funded_dollars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_lead numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_call numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_funded numeric DEFAULT 0;
