
-- Add missing columns to apify_settings
ALTER TABLE public.apify_settings ADD COLUMN IF NOT EXISTS monthly_spend_limit_cents INTEGER DEFAULT 5000;
ALTER TABLE public.apify_settings ADD COLUMN IF NOT EXISTS current_month_spend_cents INTEGER DEFAULT 0;

-- Add missing columns to instagram_creatives
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS post_type TEXT;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS is_inspiration_source BOOLEAN DEFAULT false;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE public.instagram_creatives ADD COLUMN IF NOT EXISTS owner_username TEXT;

-- Add missing columns to custom_ads  
ALTER TABLE public.custom_ads ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.custom_ads ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.custom_ads ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.custom_ads ADD COLUMN IF NOT EXISTS description TEXT;
