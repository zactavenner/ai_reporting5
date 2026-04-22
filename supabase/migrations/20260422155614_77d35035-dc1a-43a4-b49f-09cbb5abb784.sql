
CREATE TABLE public.slack_channel_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text,
  channel_type text NOT NULL DEFAULT 'public',
  monitor_messages boolean NOT NULL DEFAULT true,
  auto_create_tasks boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, channel_id)
);

CREATE INDEX idx_slack_channel_mappings_client ON public.slack_channel_mappings(client_id);

ALTER TABLE public.slack_channel_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to slack_channel_mappings"
  ON public.slack_channel_mappings FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE public.slack_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  channel_id text,
  channel_name text,
  message_ts text,
  user_id text,
  user_name text,
  message_text text,
  action_type text,
  task_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slack_activity_log_client ON public.slack_activity_log(client_id, created_at DESC);

ALTER TABLE public.slack_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to slack_activity_log"
  ON public.slack_activity_log FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_slack_channel_mappings_updated
  BEFORE UPDATE ON public.slack_channel_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
