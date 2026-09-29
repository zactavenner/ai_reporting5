
CREATE TABLE public.ai_setter_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  business_name text,
  candidate_script text,
  investor_script text,
  approved_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice text NOT NULL DEFAULT 'marin',
  timezone text NOT NULL DEFAULT 'America/New_York',
  call_window_start smallint NOT NULL DEFAULT 9,
  call_window_end smallint NOT NULL DEFAULT 19,
  max_attempts smallint NOT NULL DEFAULT 3,
  daily_call_limit integer NOT NULL DEFAULT 50,
  caller_number text,
  caller_number_verified boolean NOT NULL DEFAULT false,
  allowed_countries text[] NOT NULL DEFAULT ARRAY['US'],
  calendar_provider text NOT NULL DEFAULT 'demo',
  calendar_mapping_verified boolean NOT NULL DEFAULT false,
  outbound_enabled boolean NOT NULL DEFAULT false,
  recording_enabled boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_setter_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('candidate','investor')),
  service_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  activated_by text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_setter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ai_setter_campaigns(id) ON DELETE CASCADE,
  lead_id uuid,
  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,
  timezone text,
  consent_evidence jsonb,
  consent_at timestamptz,
  dnc boolean NOT NULL DEFAULT false,
  dnc_reason text,
  attempts smallint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  last_result text,
  last_attempt_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_setter_queue_client_idx ON public.ai_setter_queue(client_id, status);

CREATE TABLE public.ai_setter_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.ai_setter_queue(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.ai_setter_campaigns(id) ON DELETE SET NULL,
  transport text NOT NULL CHECK (transport IN ('browser','phone')),
  model text,
  openai_session_id text UNIQUE,
  status text NOT NULL DEFAULT 'initializing',
  task_revision integer NOT NULL DEFAULT 1,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmation jsonb,
  finalization text NOT NULL DEFAULT 'pending',
  reconciliation_required boolean NOT NULL DEFAULT false,
  failure_code text,
  failure_detail text,
  usage jsonb,
  started_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_setter_sessions_client_idx ON public.ai_setter_sessions(client_id, started_at DESC);
CREATE UNIQUE INDEX ai_setter_one_active_call_per_lead ON public.ai_setter_sessions(queue_id)
  WHERE status IN ('initializing','ringing','active') AND queue_id IS NOT NULL;

CREATE TABLE public.ai_setter_events (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_setter_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  task_revision integer,
  payload jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_setter_events_session_idx ON public.ai_setter_events(session_id, id);

CREATE TABLE public.ai_setter_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_setter_sessions(id) ON DELETE CASCADE,
  call_ref text NOT NULL,
  tool_call_id text NOT NULL,
  tool_name text NOT NULL,
  task_revision integer NOT NULL,
  arguments jsonb,
  status text NOT NULL DEFAULT 'running',
  result jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, call_ref, tool_call_id)
);

CREATE TABLE public.ai_setter_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 30,
  timezone text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, service_type, starts_at)
);

CREATE TABLE public.ai_setter_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_setter_sessions(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.ai_setter_slots(id) ON DELETE CASCADE,
  task_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed','expired','stale')),
  expires_at timestamptz NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_setter_one_active_hold_per_slot ON public.ai_setter_holds(slot_id) WHERE status = 'active';

CREATE TABLE public.ai_setter_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.ai_setter_sessions(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES public.ai_setter_queue(id) ON DELETE SET NULL,
  slot_id uuid REFERENCES public.ai_setter_slots(id) ON DELETE SET NULL,
  hold_id uuid UNIQUE REFERENCES public.ai_setter_holds(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  service_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  timezone text NOT NULL,
  provider text NOT NULL DEFAULT 'demo',
  provider_booking_id text,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','confirmed','failed','reconciliation_required','cancelled')),
  failure_detail text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_setter_one_booking_per_slot ON public.ai_setter_bookings(slot_id)
  WHERE status IN ('claimed','confirmed','reconciliation_required') AND slot_id IS NOT NULL;

CREATE TABLE public.ai_setter_attempt_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.ai_setter_queue(id) ON DELETE CASCADE,
  attempt_number smallint NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  session_id uuid REFERENCES public.ai_setter_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'claimed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, attempt_number)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_setter_settings','ai_setter_campaigns','ai_setter_queue','ai_setter_sessions','ai_setter_events','ai_setter_tool_runs','ai_setter_slots','ai_setter_holds','ai_setter_bookings','ai_setter_attempt_claims'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.ai_setter_events_id_seq TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_setter_settings','ai_setter_campaigns','ai_setter_queue','ai_setter_sessions','ai_setter_tool_runs','ai_setter_holds','ai_setter_bookings'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_touch', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ai_setter_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'ai_setter_events is append-only'; END IF;
  IF TG_OP = 'DELETE' AND NOT OLD.is_demo AND current_setting('app.ai_setter_cascade', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'ai_setter_events is append-only';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER ai_setter_events_immutable BEFORE UPDATE OR DELETE ON public.ai_setter_events
  FOR EACH ROW EXECUTE FUNCTION public.ai_setter_events_append_only();

ALTER TABLE public.phone_call_records
  ADD COLUMN IF NOT EXISTS openai_session_id text,
  ADD COLUMN IF NOT EXISTS transport text,
  ADD COLUMN IF NOT EXISTS setter_session_id uuid,
  ADD COLUMN IF NOT EXISTS error_detail text;
