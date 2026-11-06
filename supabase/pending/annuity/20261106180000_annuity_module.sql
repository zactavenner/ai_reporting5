-- Annuity module schema for Reporting 5.0.
-- NOT applied to Supabase project jgwwmtuvjlmzapwqiabu.
-- This file is outside supabase/migrations so hosted deploys do not run it.
-- Live delivery and outbound sends are check-constrained off.
-- No contracted buyers, prices, or brand decisions are seeded.
-- Tenant isolation is enforced by revoked table privileges, forced row-level
-- security, and security-definer RPCs that filter on a hashed session token.
-- Application routing rules are covered by the in-memory service tests.
-- Do not treat a passing disposable-Postgres run as proof about production RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS annuity;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'annuity_app') THEN
    CREATE ROLE annuity_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT annuity_app TO CURRENT_USER;

CREATE TABLE annuity.runtime_lock (
  id integer PRIMARY KEY CHECK (id = 1),
  sends_enabled boolean NOT NULL DEFAULT false CHECK (sends_enabled = false),
  live_delivery_enabled boolean NOT NULL DEFAULT false CHECK (live_delivery_enabled = false),
  cogs_per_lead_cents integer NOT NULL DEFAULT 3700 CHECK (cogs_per_lead_cents >= 0)
);

INSERT INTO annuity.runtime_lock (id) VALUES (1);

CREATE TABLE annuity.capital_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  min_cents bigint NOT NULL CHECK (min_cents >= 0),
  max_cents bigint,
  routable boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CHECK (max_cents IS NULL OR max_cents > min_cents)
);

CREATE TABLE annuity.price_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL CHECK (product IN ('per_lead', 'booked', 'verified_show')),
  capital_band_id uuid NOT NULL REFERENCES annuity.capital_bands (id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (product, capital_band_id),
  CHECK (product <> 'per_lead' OR amount_cents BETWEEN 8000 AND 20000)
);

CREATE TABLE annuity.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('unverified_candidate', 'verified_configuration_only')),
  distribution text NOT NULL CHECK (distribution IN ('exclusive', 'shared')),
  daily_capacity integer NOT NULL CHECK (daily_capacity >= 0),
  budget_remaining_cents integer NOT NULL CHECK (budget_remaining_cents >= 0),
  delivery_enabled boolean NOT NULL DEFAULT false,
  live_delivery_enabled boolean NOT NULL DEFAULT false CHECK (live_delivery_enabled = false),
  active boolean NOT NULL DEFAULT false,
  CHECK (verification_status = 'verified_configuration_only' OR delivery_enabled = false)
);

CREATE TABLE annuity.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  phone_e164 text NOT NULL UNIQUE,
  state_code char(2) NOT NULL,
  capital_amount_cents bigint NOT NULL CHECK (capital_amount_cents >= 0),
  capital_band_id uuid REFERENCES annuity.capital_bands (id),
  fit text NOT NULL CHECK (fit IN ('in_band', 'not_fit')),
  disposition text NOT NULL,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent jsonb NOT NULL,
  opted_out boolean NOT NULL DEFAULT false,
  booking_generation integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE annuity.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES annuity.leads (id),
  buyer_id uuid NOT NULL REFERENCES annuity.buyers (id),
  product text NOT NULL CHECK (product IN ('per_lead', 'booked', 'verified_show')),
  state text NOT NULL CHECK (state IN ('offered', 'accepted', 'rejected', 'retry_pending', 'exhausted')),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  attempt integer NOT NULL CHECK (attempt >= 1),
  distribution text NOT NULL CHECK (distribution IN ('exclusive', 'shared')),
  channel text NOT NULL DEFAULT 'sandbox_noop' CHECK (channel = 'sandbox_noop'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, buyer_id, product, attempt)
);

CREATE TABLE annuity.ledger_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES annuity.leads (id),
  buyer_id uuid REFERENCES annuity.buyers (id),
  product text,
  delivery_id uuid REFERENCES annuity.deliveries (id),
  kind text NOT NULL CHECK (kind IN ('revenue', 'cogs', 'refund')),
  recognition text NOT NULL CHECK (recognition IN ('unrecognized', 'realized')),
  status text NOT NULL CHECK (status IN ('open', 'superseded')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE annuity.followup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES annuity.leads (id),
  sequence_key text NOT NULL,
  template_key text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'queued_suppressed',
    'held_quiet_hours',
    'held_configuration_incomplete',
    'cancelled_stale',
    'cancelled_opt_out'
  )),
  scheduled_at timestamptz NOT NULL,
  booking_generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE annuity.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  actor_role text NOT NULL CHECK (actor_role IN ('platform_admin', 'buyer')),
  buyer_id uuid REFERENCES annuity.buyers (id),
  expires_at timestamptz NOT NULL,
  CHECK (
    (actor_role = 'platform_admin' AND buyer_id IS NULL)
    OR (actor_role = 'buyer' AND buyer_id IS NOT NULL)
  )
);

CREATE TABLE annuity.command_keys (
  idempotency_key text PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES annuity.deliveries (id),
  decision text NOT NULL CHECK (decision IN ('accept', 'reject'))
);

CREATE TABLE annuity.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION annuity.require_session(p_token text)
RETURNS annuity.sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = annuity, public
AS $$
DECLARE
  v_row annuity.sessions;
BEGIN
  SELECT * INTO v_row
  FROM annuity.sessions
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'denied' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION annuity.list_deliveries(p_token text)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  buyer_id uuid,
  state text,
  price_cents integer,
  product text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = annuity, public
AS $$
DECLARE
  v_session annuity.sessions;
BEGIN
  v_session := annuity.require_session(p_token);
  IF v_session.actor_role = 'platform_admin' THEN
    RETURN QUERY
      SELECT d.id, d.lead_id, d.buyer_id, d.state, d.price_cents, d.product
      FROM annuity.deliveries d;
  ELSIF v_session.actor_role = 'buyer' THEN
    RETURN QUERY
      SELECT d.id, d.lead_id, d.buyer_id, d.state, d.price_cents, d.product
      FROM annuity.deliveries d
      WHERE d.buyer_id = v_session.buyer_id;
  ELSE
    RAISE EXCEPTION 'denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION annuity.list_ledger(p_token text)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  buyer_id uuid,
  kind text,
  recognition text,
  status text,
  amount_cents integer,
  product text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = annuity, public
AS $$
DECLARE
  v_session annuity.sessions;
BEGIN
  v_session := annuity.require_session(p_token);
  IF v_session.actor_role = 'platform_admin' THEN
    RETURN QUERY
      SELECT l.id, l.lead_id, l.buyer_id, l.kind, l.recognition, l.status, l.amount_cents, l.product
      FROM annuity.ledger_lines l;
  ELSIF v_session.actor_role = 'buyer' THEN
    RETURN QUERY
      SELECT l.id, l.lead_id, l.buyer_id, l.kind, l.recognition, l.status, l.amount_cents, l.product
      FROM annuity.ledger_lines l
      WHERE l.buyer_id = v_session.buyer_id;
  ELSE
    RAISE EXCEPTION 'denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION annuity.decide_delivery(
  p_token text,
  p_delivery uuid,
  p_decision text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = annuity, public
AS $$
DECLARE
  v_session annuity.sessions;
  v_delivery annuity.deliveries;
  v_prior annuity.command_keys;
BEGIN
  IF p_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'validation' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'validation' USING ERRCODE = '22023';
  END IF;
  v_session := annuity.require_session(p_token);
  SELECT * INTO v_delivery FROM annuity.deliveries WHERE id = p_delivery;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.actor_role = 'buyer' AND v_delivery.buyer_id IS DISTINCT FROM v_session.buyer_id THEN
    RAISE EXCEPTION 'tenant_isolation' USING ERRCODE = '42501';
  END IF;
  IF v_session.actor_role NOT IN ('buyer', 'platform_admin') THEN
    RAISE EXCEPTION 'denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior FROM annuity.command_keys WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prior.delivery_id <> p_delivery OR v_prior.decision <> p_decision THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN p_delivery;
  END IF;

  IF v_delivery.state <> 'offered' THEN
    RAISE EXCEPTION 'illegal_transition' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE annuity.deliveries
      SET state = 'rejected', updated_at = now()
      WHERE id = p_delivery;
  ELSE
    UPDATE annuity.deliveries
      SET state = 'accepted', updated_at = now()
      WHERE id = p_delivery;
    INSERT INTO annuity.ledger_lines (
      lead_id, buyer_id, product, delivery_id, kind, recognition, status, amount_cents, idempotency_key
    ) VALUES (
      v_delivery.lead_id, v_delivery.buyer_id, v_delivery.product, v_delivery.id,
      'revenue', 'realized', 'open', v_delivery.price_cents, 'revenue-realized:' || v_delivery.id::text
    );
  END IF;

  INSERT INTO annuity.command_keys (idempotency_key, delivery_id, decision)
  VALUES (p_idempotency_key, p_delivery, p_decision);
  INSERT INTO annuity.audit_log (entity_type, entity_id, actor_role, action, detail)
  VALUES ('delivery', p_delivery, v_session.actor_role, p_decision, jsonb_build_object('idempotency_key', p_idempotency_key));
  RETURN p_delivery;
END;
$$;

REVOKE ALL ON SCHEMA annuity FROM PUBLIC;
GRANT USAGE ON SCHEMA annuity TO annuity_app;
REVOKE ALL ON ALL TABLES IN SCHEMA annuity FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA annuity FROM annuity_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA annuity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION annuity.list_deliveries(text) TO annuity_app;
GRANT EXECUTE ON FUNCTION annuity.list_ledger(text) TO annuity_app;
GRANT EXECUTE ON FUNCTION annuity.decide_delivery(text, uuid, text, text) TO annuity_app;

DO $$
DECLARE
  table_name text;
  owner_name text := current_user;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'annuity'
  LOOP
    EXECUTE format('ALTER TABLE annuity.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE annuity.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS owner_only ON annuity.%I', table_name);
    EXECUTE format(
      'CREATE POLICY owner_only ON annuity.%I FOR ALL USING (current_user = %L) WITH CHECK (current_user = %L)',
      table_name, owner_name, owner_name
    );
  END LOOP;
END $$;
