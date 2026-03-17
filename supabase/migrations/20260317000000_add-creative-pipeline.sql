-- Creative Pipeline: creative_briefs + ad_scripts tables
-- Enables the end-to-end flow: Meta performance data → AI-generated brief → ad scripts → approval → production
-- Status lifecycles:
--   briefs: pending → in_production → completed
--   scripts: draft → approved → in_production → completed

-- ═══════════════════════════════════════════
-- CREATIVE BRIEFS — AI-analyzed performance insights + creative direction
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.creative_briefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Brief metadata
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_production', 'completed', 'archived')),
  brief_type text NOT NULL DEFAULT 'performance' CHECK (brief_type IN ('performance', 'new_angle', 'fatigue_refresh', 'competitor', 'seasonal', 'manual')),

  -- Source: which ads/campaigns were analyzed to generate this brief
  source_campaign_ids text[] DEFAULT '{}',   -- Meta campaign IDs analyzed
  source_ad_ids text[] DEFAULT '{}',         -- Specific ad IDs (top performers)
  source_ad_set_ids text[] DEFAULT '{}',     -- Ad set IDs analyzed

  -- Performance snapshot at time of brief creation
  performance_snapshot jsonb DEFAULT '{}'::jsonb,
  -- { top_ads: [{ad_id, name, spend, ctr, cpc, cpm, attributed_leads, attributed_funded, roas}],
  --   totals: {spend, leads, calls, funded, funded_dollars, avg_cpl, avg_cpc},
  --   date_range: {start, end},
  --   winning_patterns: ["pattern1", "pattern2"] }

  -- AI-generated brief content
  target_audience text,                      -- Who we're targeting
  key_message text,                          -- Core value proposition
  tone_and_style text,                       -- Voice, energy, emotional register
  winning_hooks text[],                      -- Top-performing hooks to replicate/iterate
  angles_to_test text[],                     -- New creative angles to explore
  visual_direction text,                     -- Art direction notes
  cta_recommendations text[],               -- Recommended CTAs based on performance
  platform_specs jsonb DEFAULT '{}'::jsonb,  -- Platform-specific requirements (aspect ratios, lengths, etc.)
  additional_notes text,                     -- Free-form AI insights

  -- Generation metadata
  generated_by text DEFAULT 'claude',        -- 'claude', 'manual', 'orchestrator'
  model_used text,                           -- e.g., 'claude-sonnet-4-20250514'
  generation_prompt text,                    -- The prompt used (for iteration)

  -- Tracking
  scripts_generated integer DEFAULT 0,       -- Count of scripts produced from this brief
  assigned_to uuid REFERENCES public.agency_members(id) ON DELETE SET NULL,
  due_date date,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════
-- AD SCRIPTS — Production-ready scripts generated from briefs
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ad_scripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Script metadata
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_production', 'completed', 'rejected')),
  script_type text NOT NULL DEFAULT 'video' CHECK (script_type IN ('video', 'image', 'carousel', 'story', 'reel', 'ugc', 'static')),
  platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'tiktok', 'youtube', 'google', 'linkedin', 'x')),
  variant_number integer DEFAULT 1,          -- Script variant (1, 2, 3 — typically 3 per brief)

  -- Script content
  hook text,                                 -- Opening hook (first 3 seconds)
  body_copy text,                            -- Main script/copy body
  cta text,                                  -- Call to action
  visual_notes text,                         -- B-roll / visual direction for production
  audio_notes text,                          -- Music, SFX, voiceover direction
  duration_seconds integer,                  -- Target length

  -- Platform specs
  aspect_ratio text DEFAULT '9:16',          -- 9:16, 1:1, 16:9, 4:5
  format_notes text,                         -- Platform-specific formatting

  -- AI metadata
  generated_by text DEFAULT 'claude',
  model_used text,
  generation_prompt text,

  -- Review tracking
  reviewed_by uuid REFERENCES public.agency_members(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  review_notes text,
  revision_count integer DEFAULT 0,

  -- Production tracking
  creative_id uuid REFERENCES public.creatives(id) ON DELETE SET NULL,  -- Link to finished creative asset
  launched_at timestamp with time zone,
  meta_ad_id text,                           -- Link back to Meta ad once launched

  -- Performance feedback loop
  performance_data jsonb DEFAULT '{}'::jsonb, -- Post-launch performance metrics for feedback
  -- { spend, impressions, clicks, ctr, cpc, leads, funded, roas, days_active }

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_creative_briefs_client ON public.creative_briefs (client_id);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_status ON public.creative_briefs (status);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_created ON public.creative_briefs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_scripts_brief ON public.ad_scripts (brief_id);
CREATE INDEX IF NOT EXISTS idx_ad_scripts_client ON public.ad_scripts (client_id);
CREATE INDEX IF NOT EXISTS idx_ad_scripts_status ON public.ad_scripts (status);
CREATE INDEX IF NOT EXISTS idx_ad_scripts_created ON public.ad_scripts (created_at DESC);

-- RLS
ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view creative_briefs" ON public.creative_briefs FOR SELECT USING (true);
CREATE POLICY "Public can insert creative_briefs" ON public.creative_briefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update creative_briefs" ON public.creative_briefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete creative_briefs" ON public.creative_briefs FOR DELETE USING (true);

CREATE POLICY "Public can view ad_scripts" ON public.ad_scripts FOR SELECT USING (true);
CREATE POLICY "Public can insert ad_scripts" ON public.ad_scripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update ad_scripts" ON public.ad_scripts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete ad_scripts" ON public.ad_scripts FOR DELETE USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'creative_briefs_updated_at') THEN
    CREATE TRIGGER creative_briefs_updated_at
      BEFORE UPDATE ON public.creative_briefs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ad_scripts_updated_at') THEN
    CREATE TRIGGER ad_scripts_updated_at
      BEFORE UPDATE ON public.ad_scripts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
