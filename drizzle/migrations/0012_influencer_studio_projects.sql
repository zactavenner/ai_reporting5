CREATE TABLE public.influencer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled influencer ad',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','rendering','ready','failed')),
  reference_video_id uuid REFERENCES public.ai_studio_reference_videos(id) ON DELETE SET NULL,
  reference_url text,
  reference_poster_url text,
  clip_start_s numeric NOT NULL DEFAULT 0,
  clip_end_s numeric NOT NULL DEFAULT 10,
  clip_url text,
  pacing jsonb NOT NULL DEFAULT '{}'::jsonb,
  character_id uuid REFERENCES public.avatars(id) ON DELETE SET NULL,
  hook text NOT NULL DEFAULT '',
  mechanism text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  script_locked boolean NOT NULL DEFAULT false,
  script_lock_hash text,
  script_locked_at timestamptz,
  script_locked_by text,
  render_mode text NOT NULL DEFAULT 'motion_swap' CHECK (render_mode IN ('motion_swap','character_only')),
  model text,
  resolution text NOT NULL DEFAULT '720p',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  duration_seconds integer,
  job_url text,
  render_request jsonb,
  render_started_at timestamptz,
  video_url text,
  creative_id uuid REFERENCES public.creatives(id) ON DELETE SET NULL,
  error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX influencer_projects_client_updated_idx ON public.influencer_projects (client_id, updated_at DESC);

GRANT ALL ON public.influencer_projects TO service_role;
REVOKE ALL ON public.influencer_projects FROM anon, authenticated;

ALTER TABLE public.influencer_projects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.influencer_projects IS 'AI Influencer Studio projects (reference clip -> character -> locked script -> render). Service-only: read/written by the influencer-studio function.';

CREATE TRIGGER influencer_projects_updated_at
  BEFORE UPDATE ON public.influencer_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();