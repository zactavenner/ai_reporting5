
-- Meta Campaigns table
CREATE TABLE public.meta_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_campaign_id text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE',
  objective text,
  buying_type text,
  daily_budget numeric,
  lifetime_budget numeric,
  budget_remaining numeric,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  start_time timestamp with time zone,
  stop_time timestamp with time zone,
  created_time timestamp with time zone,
  updated_time timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(client_id, meta_campaign_id)
);

ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meta_campaigns" ON public.meta_campaigns FOR SELECT USING (true);
CREATE POLICY "Public can insert meta_campaigns" ON public.meta_campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update meta_campaigns" ON public.meta_campaigns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete meta_campaigns" ON public.meta_campaigns FOR DELETE USING (true);

-- Meta Ad Sets table
CREATE TABLE public.meta_ad_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  meta_adset_id text NOT NULL,
  meta_campaign_id text,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE',
  effective_status text,
  daily_budget numeric,
  lifetime_budget numeric,
  budget_remaining numeric,
  bid_strategy text,
  optimization_goal text,
  billing_event text,
  targeting jsonb DEFAULT '{}'::jsonb,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  reach bigint DEFAULT 0,
  frequency numeric DEFAULT 0,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(client_id, meta_adset_id)
);

ALTER TABLE public.meta_ad_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meta_ad_sets" ON public.meta_ad_sets FOR SELECT USING (true);
CREATE POLICY "Public can insert meta_ad_sets" ON public.meta_ad_sets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update meta_ad_sets" ON public.meta_ad_sets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete meta_ad_sets" ON public.meta_ad_sets FOR DELETE USING (true);

-- Meta Ads table
CREATE TABLE public.meta_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_set_id uuid REFERENCES public.meta_ad_sets(id) ON DELETE CASCADE,
  meta_ad_id text NOT NULL,
  meta_adset_id text,
  meta_campaign_id text,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE',
  effective_status text,
  creative_id text,
  preview_url text,
  thumbnail_url text,
  headline text,
  body text,
  call_to_action_type text,
  link_url text,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  reach bigint DEFAULT 0,
  conversions bigint DEFAULT 0,
  cost_per_conversion numeric DEFAULT 0,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(client_id, meta_ad_id)
);

ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meta_ads" ON public.meta_ads FOR SELECT USING (true);
CREATE POLICY "Public can insert meta_ads" ON public.meta_ads FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update meta_ads" ON public.meta_ads FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete meta_ads" ON public.meta_ads FOR DELETE USING (true);

-- Add last_meta_ads_sync to client_settings
ALTER TABLE public.client_settings 
  ADD COLUMN IF NOT EXISTS meta_ads_sync_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_ads_last_sync timestamp with time zone;
