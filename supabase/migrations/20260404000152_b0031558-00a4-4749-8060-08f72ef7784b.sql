
-- API keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Key',
  key_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON public.api_keys FOR ALL USING (true) WITH CHECK (true);

-- apify_settings columns
ALTER TABLE public.apify_settings ADD COLUMN IF NOT EXISTS spend_reset_date DATE;
ALTER TABLE public.apify_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- instagram_scrape_jobs columns
ALTER TABLE public.instagram_scrape_jobs ADD COLUMN IF NOT EXISTS input_params JSONB DEFAULT '{}';
ALTER TABLE public.instagram_scrape_jobs ADD COLUMN IF NOT EXISTS results_count INTEGER DEFAULT 0;
ALTER TABLE public.instagram_scrape_jobs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;

-- scraped_ads columns
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS iterated BOOLEAN DEFAULT false;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS ad_format TEXT;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS monitoring_target_id UUID REFERENCES public.monitoring_targets(id) ON DELETE SET NULL;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
ALTER TABLE public.scraped_ads ADD COLUMN IF NOT EXISTS ad_count INTEGER DEFAULT 0;

-- monitoring_targets columns
ALTER TABLE public.monitoring_targets ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.monitoring_targets ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE public.monitoring_targets ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

-- ad_iterations columns
ALTER TABLE public.ad_iterations ADD COLUMN IF NOT EXISTS source_ad_id UUID REFERENCES public.scraped_ads(id) ON DELETE SET NULL;
ALTER TABLE public.ad_iterations ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE public.ad_iterations ADD COLUMN IF NOT EXISTS iteration_type TEXT DEFAULT 'ai_generated';
ALTER TABLE public.ad_iterations ADD COLUMN IF NOT EXISTS notes TEXT;

-- api_usage columns
ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS service TEXT;
ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS key_index INTEGER;
ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS request_type TEXT;
ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
