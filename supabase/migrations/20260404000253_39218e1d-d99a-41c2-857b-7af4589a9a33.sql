
-- Add missing columns to avatars
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS is_stock BOOLEAN DEFAULT false;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS ethnicity TEXT;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS looks_count INTEGER DEFAULT 0;

-- Add missing columns to avatar_looks
ALTER TABLE public.avatar_looks ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE public.avatar_looks ADD COLUMN IF NOT EXISTS background TEXT;
ALTER TABLE public.avatar_looks ADD COLUMN IF NOT EXISTS outfit TEXT;
ALTER TABLE public.avatar_looks ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE public.avatar_looks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add calendar_id to calendar_mappings
ALTER TABLE public.calendar_mappings ADD COLUMN IF NOT EXISTS calendar_id TEXT;

-- Create get_api_usage_counts function
CREATE OR REPLACE FUNCTION public.get_api_usage_counts(p_service TEXT, p_key_index INTEGER)
RETURNS TABLE(minute_count BIGINT, daily_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 minute') AS minute_count,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 day') AS daily_count
  FROM public.api_usage
  WHERE service = p_service AND key_index = p_key_index;
$$;
