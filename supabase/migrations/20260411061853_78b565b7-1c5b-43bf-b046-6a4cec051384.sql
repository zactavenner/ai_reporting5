
-- Add useful tracking fields to existing agents table
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS consecutive_failures integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
ADD COLUMN IF NOT EXISTS last_run_status text,
ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 4096,
ADD COLUMN IF NOT EXISTS temperature numeric(3,2) DEFAULT 0.3;

-- Add extra fields to agent_runs
ALTER TABLE public.agent_runs
ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_usd numeric(10,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS duration_ms integer;

-- ============================================================
-- agent_tasks: Cross-agent task queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by_agent text NOT NULL,
  assigned_to_agent text NOT NULL,
  priority text DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','failed','cancelled')),
  task_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_tasks" ON public.agent_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_agent_tasks_assigned ON public.agent_tasks(assigned_to_agent, status);
CREATE INDEX idx_agent_tasks_pending ON public.agent_tasks(status, priority) WHERE status = 'pending';

-- ============================================================
-- agent_escalations: Human-in-the-loop queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  category text,
  title text NOT NULL,
  description text NOT NULL,
  context jsonb DEFAULT '{}',
  slack_message_ts text,
  slack_channel text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_escalations" ON public.agent_escalations FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_escalations_open ON public.agent_escalations(resolved_at) WHERE resolved_at IS NULL;

-- ============================================================
-- content_queue: Marketing agent content pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS public.content_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('ad_copy','email','sms','ugc_script','social_post','vsl','objection_video','landing_page')),
  status text DEFAULT 'draft' CHECK (status IN ('draft','review','approved','published','rejected')),
  angle text,
  draft text NOT NULL,
  final_version text,
  compliance_score numeric(5,2),
  compliance_flags jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  performance_data jsonb DEFAULT '{}',
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  rejected_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.content_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to content_queue" ON public.content_queue FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_content_queue_status ON public.content_queue(status, client_id);

-- ============================================================
-- call_analysis: Call scoring and analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS public.call_analysis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  call_id text NOT NULL,
  contact_name text,
  call_date timestamptz,
  duration_seconds integer,
  call_type text DEFAULT 'discovery' CHECK (call_type IN ('discovery','due_diligence','investment','reconnect','other')),
  transcript text,
  score_rapport integer CHECK (score_rapport BETWEEN 1 AND 10),
  score_qualification integer CHECK (score_qualification BETWEEN 1 AND 10),
  score_objection_handling integer CHECK (score_objection_handling BETWEEN 1 AND 10),
  close_attempted boolean DEFAULT false,
  objections_identified jsonb DEFAULT '[]',
  action_items jsonb DEFAULT '[]',
  compliance_flags jsonb DEFAULT '[]',
  summary text,
  next_step text,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.call_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to call_analysis" ON public.call_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_call_analysis_client ON public.call_analysis(client_id);
CREATE INDEX idx_call_analysis_date ON public.call_analysis(call_date DESC);
