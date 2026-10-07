-- Qualified-lead feedback infrastructure. Service-role only; all access through operator-gated functions.
CREATE TABLE public.quality_feedback_global (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  live_enabled boolean NOT NULL DEFAULT false,
  emergency_stop boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.quality_feedback_global (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.quality_feedback_clients (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off','preview','live')),
  milestone text NOT NULL DEFAULT 'attended_qualified_call'
    CHECK (milestone IN ('verified_qualified_lead','verified_qualified_booking','attended_qualified_call')),
  meta_event_name text,
  event_source text NOT NULL DEFAULT 'crm' CHECK (event_source IN ('crm','website')),
  destination_dataset_id text,
  destination_ad_account_id text,
  destination_verified boolean NOT NULL DEFAULT false,
  destination_verified_at timestamptz,
  sharing_consent_status text NOT NULL DEFAULT 'unknown' CHECK (sharing_consent_status IN ('unknown','documented','refused')),
  sharing_consent_evidence text,
  volume_advisory_monthly integer NOT NULL DEFAULT 30,
  live_activated_at timestamptz,
  live_activated_by text,
  campaign_rollout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quality_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  version integer NOT NULL,
  rules jsonb NOT NULL,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, version)
);

CREATE TABLE public.quality_eval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX quality_eval_queue_one_open ON public.quality_eval_queue (lead_id) WHERE status IN ('pending','processing');
CREATE INDEX quality_eval_queue_status ON public.quality_eval_queue (status, enqueued_at);

CREATE TABLE public.quality_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  rule_version_id uuid,
  milestone text NOT NULL,
  status text NOT NULL CHECK (status IN ('eligible','withheld','needs_review','excluded')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_hash text,
  occurrence_ref text,
  occurred_at timestamptz,
  lead_captured_at timestamptz,
  run_kind text NOT NULL DEFAULT 'preview' CHECK (run_kind IN ('preview','simulation','live','demo')),
  is_current boolean NOT NULL DEFAULT true,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quality_evaluations_current ON public.quality_evaluations (lead_id, milestone) WHERE is_current;
CREATE INDEX quality_evaluations_client ON public.quality_evaluations (client_id, evaluated_at DESC);

CREATE TABLE public.quality_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  evaluation_id uuid,
  milestone text NOT NULL,
  occurrence_ref text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  meta_event_name text NOT NULL,
  event_time timestamptz NOT NULL,
  destination_dataset_id text NOT NULL,
  evidence_hash text,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','claimed','accepted','failed_retryable','failed_permanent','held','cancelled')),
  hold_reason text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);
CREATE INDEX quality_event_outbox_due ON public.quality_event_outbox (status, next_attempt_at);
CREATE INDEX quality_event_outbox_client ON public.quality_event_outbox (client_id, created_at DESC);

CREATE TABLE public.quality_event_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.quality_event_outbox(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  outcome text NOT NULL,
  response_redacted jsonb
);

CREATE TABLE public.quality_feedback_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  action text NOT NULL,
  actor text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.quality_feedback_global, public.quality_feedback_clients, public.quality_rule_versions,
  public.quality_eval_queue, public.quality_evaluations, public.quality_event_outbox,
  public.quality_event_attempts, public.quality_feedback_audit TO service_role;

ALTER TABLE public.quality_feedback_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_feedback_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_eval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_event_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_feedback_audit ENABLE ROW LEVEL SECURITY;
-- No policies: browser roles have no access; service-role functions enforce operator + client scope.

-- Audit is append-only.
CREATE OR REPLACE FUNCTION public.quality_feedback_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'quality_feedback_audit is append-only'; END $$;
CREATE TRIGGER quality_feedback_audit_no_change BEFORE UPDATE OR DELETE ON public.quality_feedback_audit
  FOR EACH ROW EXECUTE FUNCTION public.quality_feedback_audit_immutable();

-- Enqueue evaluation work. Never raises: intake must not depend on this feature.
CREATE OR REPLACE FUNCTION public.qf_enqueue(p_client uuid, p_lead uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_client IS NULL OR p_lead IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM quality_feedback_clients WHERE client_id = p_client AND mode <> 'off') THEN RETURN; END IF;
  INSERT INTO quality_eval_queue (client_id, lead_id, reason) VALUES (p_client, p_lead, p_reason)
  ON CONFLICT (lead_id) WHERE status IN ('pending','processing') DO NOTHING;
EXCEPTION WHEN others THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.qf_enqueue_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'leads' THEN PERFORM qf_enqueue(NEW.client_id, NEW.id, 'lead_change');
    ELSE PERFORM qf_enqueue(NEW.client_id, NEW.lead_id, TG_TABLE_NAME); END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER qf_leads_enqueue AFTER INSERT OR UPDATE OF current_disposition, is_spam, email, phone, opportunity_stage_id, custom_fields
  ON public.leads FOR EACH ROW EXECUTE FUNCTION public.qf_enqueue_trigger();
CREATE TRIGGER qf_dispositions_enqueue AFTER INSERT ON public.lead_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.qf_enqueue_trigger();
CREATE TRIGGER qf_calls_enqueue AFTER INSERT OR UPDATE OF showed, showed_at, appointment_status, booked_at
  ON public.calls FOR EACH ROW EXECUTE FUNCTION public.qf_enqueue_trigger();
CREATE TRIGGER qf_funded_enqueue AFTER INSERT OR UPDATE OF is_verified_funded ON public.funded_investors
  FOR EACH ROW EXECUTE FUNCTION public.qf_enqueue_trigger();

-- Atomic lease claims (recoverable after lease expiry).
CREATE OR REPLACE FUNCTION public.qf_claim_eval_jobs(p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.quality_eval_queue LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE quality_eval_queue q SET status = 'processing', lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds), attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM quality_eval_queue
    WHERE status = 'pending' OR (status = 'processing' AND lease_expires_at < now())
    ORDER BY enqueued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
$$;

CREATE OR REPLACE FUNCTION public.qf_claim_outbox(p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.quality_event_outbox LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE quality_event_outbox o SET status = 'claimed', lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  WHERE o.id IN (
    SELECT id FROM quality_event_outbox
    WHERE (status IN ('pending','failed_retryable') AND next_attempt_at <= now())
       OR (status = 'claimed' AND lease_expires_at < now())
    ORDER BY next_attempt_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.qf_enqueue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qf_claim_eval_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qf_claim_outbox(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qf_claim_eval_jobs(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.qf_claim_outbox(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.qf_enqueue(uuid, uuid, text) TO service_role;