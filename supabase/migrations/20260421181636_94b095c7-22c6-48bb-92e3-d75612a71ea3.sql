
CREATE TABLE public.weekly_syncs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sync_date date NOT NULL DEFAULT CURRENT_DATE,
  attendees text,
  wins text,
  numbers_notes text,
  pipeline_notes text,
  working_not_working text,
  blockers text,
  action_items text,
  recap_email_sent boolean DEFAULT false,
  crm_updated boolean DEFAULT false,
  recording_url text,
  recording_storage_path text,
  meeting_id uuid REFERENCES public.agency_meetings(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_weekly_syncs_client ON public.weekly_syncs(client_id, sync_date DESC);

ALTER TABLE public.weekly_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to weekly_syncs"
  ON public.weekly_syncs
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_weekly_syncs_updated_at
  BEFORE UPDATE ON public.weekly_syncs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
