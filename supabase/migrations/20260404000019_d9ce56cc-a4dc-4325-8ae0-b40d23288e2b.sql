
-- ============================================================
-- COMPREHENSIVE MIGRATION: All missing tables from Reporting 6.0
-- ============================================================

-- Projects (creative projects per client)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'static_batch',
  description TEXT,
  offer_description TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scripts
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Script',
  framework TEXT,
  duration_seconds INTEGER,
  content TEXT NOT NULL DEFAULT '',
  hook TEXT,
  selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad styles
CREATE TABLE IF NOT EXISTS public.ad_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  style_config JSONB DEFAULT '{}',
  prompt_template TEXT,
  example_image_url TEXT,
  reference_images TEXT[],
  thumbnail_url TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ad templates
CREATE TABLE IF NOT EXISTS public.ad_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'static',
  platform TEXT NOT NULL DEFAULT 'all',
  template_data JSONB DEFAULT '{}',
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ad iterations
CREATE TABLE IF NOT EXISTS public.ad_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID REFERENCES public.creatives(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  iteration_number INTEGER DEFAULT 1,
  prompt TEXT,
  image_url TEXT,
  video_url TEXT,
  copy_headline TEXT,
  copy_body TEXT,
  copy_cta TEXT,
  performance_score NUMERIC,
  status TEXT DEFAULT 'draft',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scraped ads
CREATE TABLE IF NOT EXISTS public.scraped_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  advertiser_name TEXT,
  ad_id TEXT,
  headline TEXT,
  body TEXT,
  image_url TEXT,
  video_url TEXT,
  platform TEXT,
  start_date DATE,
  end_date DATE,
  impressions_range TEXT,
  spend_range TEXT,
  tags TEXT[],
  is_swipe_file BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Swipe file
CREATE TABLE IF NOT EXISTS public.swipe_file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_ad_id UUID REFERENCES public.scraped_ads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  image_url TEXT,
  video_url TEXT,
  tags TEXT[],
  category TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Viral videos
CREATE TABLE IF NOT EXISTS public.viral_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'instagram',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  engagement_rate NUMERIC,
  creator_handle TEXT,
  creator_followers BIGINT,
  is_tracked BOOLEAN DEFAULT false,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Viral tracking targets
CREATE TABLE IF NOT EXISTS public.viral_tracking_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT,
  followers BIGINT,
  is_active BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scraping schedule
CREATE TABLE IF NOT EXISTS public.scraping_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL DEFAULT 'daily',
  platforms TEXT[] DEFAULT ARRAY['meta', 'instagram'],
  keywords TEXT[],
  competitor_handles TEXT[],
  enabled BOOLEAN DEFAULT true,
  scrape_time TEXT DEFAULT '06:00',
  client_ids TEXT[],
  viral_hashtags TEXT[],
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Monitoring targets
CREATE TABLE IF NOT EXISTS public.monitoring_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  advertiser_name TEXT NOT NULL,
  page_id TEXT,
  platform TEXT DEFAULT 'meta',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Monitoring status
CREATE TABLE IF NOT EXISTS public.monitoring_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES public.monitoring_targets(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  last_checked_at TIMESTAMPTZ,
  ads_found INTEGER DEFAULT 0,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video projects
CREATE TABLE IF NOT EXISTS public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  script_id UUID REFERENCES public.ad_scripts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  aspect_ratio TEXT DEFAULT '9:16',
  platform TEXT DEFAULT 'meta',
  scenes JSONB DEFAULT '[]',
  output_url TEXT,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Batch jobs
CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'static_batch',
  status TEXT DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  completed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  results JSONB DEFAULT '[]',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Avatars
CREATE TABLE IF NOT EXISTS public.avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gender TEXT,
  age_range TEXT,
  style TEXT,
  base_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Avatar looks
CREATE TABLE IF NOT EXISTS public.avatar_looks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id UUID REFERENCES public.avatars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Instagram creatives
CREATE TABLE IF NOT EXISTS public.instagram_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source_url TEXT,
  image_url TEXT,
  video_url TEXT,
  caption TEXT,
  hashtags TEXT[],
  platform_post_id TEXT,
  engagement_rate NUMERIC,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Instagram scrape jobs
CREATE TABLE IF NOT EXISTS public.instagram_scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  target_handle TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  posts_found INTEGER DEFAULT 0,
  posts_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Copy library
CREATE TABLE IF NOT EXISTS public.copy_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'headline',
  content TEXT NOT NULL,
  platform TEXT,
  performance_score NUMERIC,
  tags TEXT[],
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Custom ads
CREATE TABLE IF NOT EXISTS public.custom_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image',
  image_url TEXT,
  video_url TEXT,
  headline TEXT,
  body TEXT,
  cta TEXT,
  platform TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client ad assignments
CREATE TABLE IF NOT EXISTS public.client_ad_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES public.creatives(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by TEXT,
  notes TEXT,
  UNIQUE(client_id, creative_id)
);

-- Voices
CREATE TABLE IF NOT EXISTS public.voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  gender TEXT,
  accent TEXT,
  style TEXT,
  preview_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Flowboards
CREATE TABLE IF NOT EXISTS public.flowboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB DEFAULT '[]',
  edges JSONB DEFAULT '[]',
  viewport JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Assets (creative media assets)
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  client_id TEXT,
  name TEXT,
  type TEXT NOT NULL DEFAULT 'image',
  url TEXT,
  public_url TEXT,
  storage_path TEXT,
  thumbnail_url TEXT,
  size_bytes BIGINT,
  duration_seconds NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Apify settings
CREATE TABLE IF NOT EXISTS public.apify_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  api_token TEXT,
  actor_id TEXT,
  schedule TEXT,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  api_name TEXT NOT NULL,
  endpoint TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Funnels
CREATE TABLE IF NOT EXISTS public.funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT DEFAULT 'draft',
  custom_domain TEXT,
  meta_pixel_id TEXT,
  ghl_webhook_url TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funnel pages
CREATE TABLE IF NOT EXISTS public.funnel_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL DEFAULT 'landing',
  status TEXT DEFAULT 'draft',
  sort_order INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz questions
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options JSONB DEFAULT '[]',
  required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  disqualify_if JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz responses
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  session_id TEXT,
  responses JSONB DEFAULT '{}',
  qualified BOOLEAN DEFAULT true,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funnel bookings
CREATE TABLE IF NOT EXISTS public.funnel_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  booked_at TIMESTAMPTZ,
  timezone TEXT,
  status TEXT DEFAULT 'pending',
  ghl_contact_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funnel analytics
CREATE TABLE IF NOT EXISTS public.funnel_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_type TEXT,
  visitors INTEGER DEFAULT 0,
  completions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(funnel_id, date, page_type)
);

-- Funnel onboarding submissions
CREATE TABLE IF NOT EXISTS public.funnel_onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  client_name TEXT,
  company_name TEXT,
  fund_type TEXT,
  raise_goal TEXT,
  timeline TEXT,
  min_investment TEXT,
  website TEXT,
  notes TEXT,
  assets_url TEXT,
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '🤖',
  prompt_template TEXT NOT NULL DEFAULT '',
  schedule_cron TEXT DEFAULT '0 6 * * *',
  schedule_timezone TEXT DEFAULT 'America/Los_Angeles',
  model TEXT DEFAULT 'google/gemini-2.5-pro',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  connectors JSONB DEFAULT '["database"]'::jsonb,
  enabled BOOLEAN DEFAULT false,
  template_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent runs
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  input_summary TEXT,
  output_summary TEXT,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  error TEXT,
  tokens_used INTEGER DEFAULT 0
);

-- PageSpeed cache
CREATE TABLE IF NOT EXISTS public.pagespeed_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'mobile',
  url TEXT NOT NULL,
  performance_score NUMERIC,
  metrics JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(step_id, strategy)
);

-- Client assignments
CREATE TABLE IF NOT EXISTS public.client_assignments (
  client_id UUID NOT NULL PRIMARY KEY,
  media_buyer TEXT DEFAULT NULL,
  account_manager TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily reports (SOD/EOD)
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL,
  report_date DATE NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'sod',
  top_priorities JSONB DEFAULT '[]'::jsonb,
  tasks_snapshot JSONB DEFAULT '[]'::jsonb,
  touchpoint_count INTEGER,
  touchpoint_notes TEXT,
  client_experience_done BOOLEAN,
  wins_shared TEXT,
  self_assessment INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calendar mappings (for funnel builder)
CREATE TABLE IF NOT EXISTS public.calendar_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  ghl_calendar_id TEXT,
  calendar_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================

-- Add columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS media_buyer TEXT DEFAULT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS account_manager TEXT DEFAULT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS offer_description TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS product_url TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]';

-- Add columns to agency_settings
ALTER TABLE public.agency_settings ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
ALTER TABLE public.agency_settings ADD COLUMN IF NOT EXISTS slack_dm_user_id TEXT DEFAULT NULL;
ALTER TABLE public.agency_settings ADD COLUMN IF NOT EXISTS agent_notification_slack_dm BOOLEAN DEFAULT true;

-- Add columns to ad_scripts for creative pipeline
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS headlines JSONB DEFAULT '[]';
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS body_copy TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS body_variants JSONB DEFAULT '[]';
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS script_body TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'meta';
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS ad_format TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS linked_meta_ad_id UUID REFERENCES public.meta_ads(id) ON DELETE SET NULL;
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS performance_metrics JSONB DEFAULT '{}';
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS generated_by TEXT DEFAULT 'ai';
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.agency_members(id);
ALTER TABLE public.ad_scripts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add columns to creative_briefs for full pipeline
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS target_audience JSONB DEFAULT '{}';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS messaging_angles JSONB DEFAULT '[]';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS creative_direction TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'meta';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS ad_format TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS source_campaigns JSONB DEFAULT '[]';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS performance_snapshot JSONB DEFAULT '{}';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS generation_reason TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS generated_by TEXT DEFAULT 'ai';
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.agency_members(id);
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.creative_briefs ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add columns to tasks for full task system
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'todo';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_client_name TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS meeting_id UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS show_subtasks_to_client BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS visible_to_client BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_type TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_next_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID;

-- Update clients status constraint to include 'onboarding'
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'inactive'::text, 'onboarding'::text]));

-- ============================================================
-- ENABLE RLS ON ALL NEW TABLES
-- ============================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viral_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viral_tracking_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ad_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flowboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apify_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagespeed_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_mappings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES (open access - internal agency tool)
-- ============================================================
CREATE POLICY "Allow all" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.scripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.ad_styles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.ad_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.ad_iterations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.scraped_ads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.swipe_file FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.viral_videos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.viral_tracking_targets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.scraping_schedule FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.monitoring_targets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.monitoring_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.video_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.batch_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.avatars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.avatar_looks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.instagram_creatives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.instagram_scrape_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.copy_library FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.custom_ads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.client_ad_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.voices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.flowboards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.assets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.apify_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.api_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.funnels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.funnel_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.quiz_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.quiz_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.funnel_bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.funnel_analytics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.funnel_onboarding_submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.agent_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.pagespeed_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.client_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.daily_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.calendar_mappings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON public.scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_ad_iterations_creative_id ON public.ad_iterations(creative_id);
CREATE INDEX IF NOT EXISTS idx_scraped_ads_client_id ON public.scraped_ads(client_id);
CREATE INDEX IF NOT EXISTS idx_swipe_file_client_id ON public.swipe_file(client_id);
CREATE INDEX IF NOT EXISTS idx_viral_videos_client_id ON public.viral_videos(client_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_client_id ON public.video_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_client_id ON public.batch_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_avatars_client_id ON public.avatars(client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_client_id ON public.api_usage(client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_client_id ON public.agents(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON public.agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_member_date ON public.daily_reports(member_id, report_date);
CREATE INDEX IF NOT EXISTS idx_assets_client_id ON public.assets(client_id);
CREATE INDEX IF NOT EXISTS idx_flowboards_client_id ON public.flowboards(client_id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('assets', 'assets', true, 10737418240) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('avatars', 'avatars', true, 10737418240) ON CONFLICT (id) DO NOTHING;

-- Storage policies for assets bucket
CREATE POLICY "Public read access for assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'assets');
CREATE POLICY "Public upload for assets" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'assets');
CREATE POLICY "Public update for assets" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'assets');
CREATE POLICY "Public delete for assets" ON storage.objects FOR DELETE TO public USING (bucket_id = 'assets');

-- Storage policies for avatars bucket
CREATE POLICY "Public read access for avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Public upload for avatars" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Public update for avatars" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'avatars');
CREATE POLICY "Public delete for avatars" ON storage.objects FOR DELETE TO public USING (bucket_id = 'avatars');
