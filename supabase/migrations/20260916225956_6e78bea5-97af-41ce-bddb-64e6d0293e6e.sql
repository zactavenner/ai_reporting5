-- Master AI Video: one recoverable draft per (user, client, conversation) plus an
-- idempotency ledger so an approved render can never be charged twice.
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_studio_video_projects TO authenticated;
GRANT ALL ON public.ai_studio_video_projects TO service_role;
ALTER TABLE public.ai_studio_video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read master video projects"
  ON public.ai_studio_video_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "team can write master video projects"
  ON public.ai_studio_video_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER ai_studio_video_projects_touch
  BEFORE UPDATE ON public.ai_studio_video_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Render ledger. The unique idempotency key is what stops a double-click, a
-- retried network call or two browser tabs from paying for the same render.
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

GRANT SELECT ON public.ai_studio_video_generations TO authenticated;
GRANT ALL ON public.ai_studio_video_generations TO service_role;
ALTER TABLE public.ai_studio_video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read master video generations"
  ON public.ai_studio_video_generations FOR SELECT TO authenticated USING (true);

CREATE TRIGGER ai_studio_video_generations_touch
  BEFORE UPDATE ON public.ai_studio_video_generations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();