ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS trigger_campaign_id text;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS ai_performance_score numeric;

COMMENT ON COLUMN public.creatives.source IS 'manual, ai-auto, ai-variation';
COMMENT ON COLUMN public.creatives.trigger_campaign_id IS 'Meta campaign ID that triggered auto-generation';
COMMENT ON COLUMN public.creatives.ai_performance_score IS 'Performance score for AI-generated creatives tracking';