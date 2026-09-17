-- Master AI Video: one recoverable draft per (user, client, conversation).
-- Only the verified server route may access drafts and the render ledger.
CREATE TABLE public.ai_studio_video_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID,
  conversation_id UUID,
  title TEXT,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  approvals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_studio_video_projects_scope_uidx
  ON public.ai_studio_video_projects (
    user_id,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

REVOKE ALL ON public.ai_studio_video_projects FROM anon, authenticated;
GRANT ALL ON public.ai_studio_video_projects TO service_role;
ALTER TABLE public.ai_studio_video_projects ENABLE ROW LEVEL SECURITY;
-- No browser policies: master-video-generate verifies identity and ownership.

CREATE TRIGGER ai_studio_video_projects_touch
  BEFORE UPDATE ON public.ai_studio_video_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Unique render identity prevents duplicate paid submissions.
CREATE TABLE public.ai_studio_video_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.ai_studio_video_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  client_id UUID,
  conversation_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  model TEXT,
  resolution TEXT,
  aspect_ratio TEXT,
  duration_seconds INTEGER,
  first_frame_url TEXT,
  spoken_script TEXT,
  video_prompt TEXT,
  provider_job_id TEXT,
  polling_url TEXT,
  canvas_item_id UUID,
  video_url TEXT,
  error TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ai_studio_video_generations_project_idx
  ON public.ai_studio_video_generations (project_id, created_at DESC);

REVOKE ALL ON public.ai_studio_video_generations FROM anon, authenticated;
GRANT ALL ON public.ai_studio_video_generations TO service_role;
ALTER TABLE public.ai_studio_video_generations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ai_studio_video_generations_touch
  BEFORE UPDATE ON public.ai_studio_video_generations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
