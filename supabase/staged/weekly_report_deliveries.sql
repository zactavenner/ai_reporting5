-- STAGED FOR REVIEW — NOT APPLIED. Lives outside drizzle/migrations on purpose.
-- Durable ledger for Weekly Client Report PDF delivery (supabase/functions/weekly-client-report).
-- One row per (client, week, recipient, channel); the unique delivery_key makes the claim an
-- insert-if-absent so retries and concurrent workers cannot double-send.
-- Service-role only: no anon/authenticated grants, RLS on with no policies.

CREATE TABLE public.weekly_report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_key text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.client_report_recipients(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('email')),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed','sending','sent','failed_retryable','failed_permanent','unknown')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
  pdf_path text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_report_deliveries_key_uq UNIQUE (delivery_key),
  CONSTRAINT weekly_report_deliveries_tuple_uq UNIQUE (client_id, week_start, recipient_id, channel),
  CONSTRAINT weekly_report_deliveries_week_chk CHECK (week_end = week_start + 6 AND extract(isodow FROM week_start) = 1),
  CONSTRAINT weekly_report_deliveries_key_chk CHECK (
    delivery_key = 'weekly-pdf:' || client_id::text || ':' || week_start::text || ':' || recipient_id::text || ':' || channel)
);

-- Recipient must belong to the same client (cross-client guard at the database level).
CREATE OR REPLACE FUNCTION public.weekly_report_deliveries_same_client()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.client_report_recipients r WHERE r.id = NEW.recipient_id AND r.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'recipient does not belong to client';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER weekly_report_deliveries_same_client_trg
  BEFORE INSERT OR UPDATE OF client_id, recipient_id ON public.weekly_report_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.weekly_report_deliveries_same_client();

CREATE INDEX weekly_report_deliveries_client_week_idx ON public.weekly_report_deliveries (client_id, week_start);

GRANT ALL ON public.weekly_report_deliveries TO service_role;
ALTER TABLE public.weekly_report_deliveries ENABLE ROW LEVEL SECURITY;

-- Separately (not SQL — storage buckets are created with the storage tool after review):
--   private bucket `weekly-client-reports`, public = false, PDF only.
