-- Add unique constraint on ad_library_id for proper upsert deduplication with Apify
-- First, clean up any existing duplicates by keeping only the most recent
DELETE FROM public.client_live_ads a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (client_id, COALESCE(ad_library_id, id::text)) id
  FROM public.client_live_ads
  ORDER BY client_id, COALESCE(ad_library_id, id::text), scraped_at DESC NULLS LAST
);

-- Create unique index on ad_library_id (allowing nulls to be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_live_ads_library_id 
ON public.client_live_ads (ad_library_id) 
WHERE ad_library_id IS NOT NULL;

-- Also add a composite unique constraint for client + ad_library_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_live_ads_client_library_id 
ON public.client_live_ads (client_id, ad_library_id) 
WHERE ad_library_id IS NOT NULL;