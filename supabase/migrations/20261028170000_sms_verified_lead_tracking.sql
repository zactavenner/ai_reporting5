-- SMS-verified lead tracking (Reporting 5.0, spec 2026-10-28). DO NOT RUN without Zac's approval.
-- Verification is FORM-LEVEL: every lead from a form with sms_verified=true counts as verified.
-- Unknown form_id => is_sms_verified NULL => never verified.

-- 1. meta_lead_forms
ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS is_optimized_for_quality boolean,
  ADD COLUMN IF NOT EXISTS sms_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_source text NOT NULL DEFAULT 'name_rule';
ALTER TABLE public.meta_lead_forms DROP CONSTRAINT IF EXISTS meta_lead_forms_verification_source_chk;
ALTER TABLE public.meta_lead_forms ADD CONSTRAINT meta_lead_forms_verification_source_chk
  CHECK (verification_source IN ('name_rule','manual','api'));

CREATE OR REPLACE FUNCTION public.sms_form_name_rule(p_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(p_name ~* '\msms\M', false) $$;

-- Applies the name rule unless the row is a manual override. Sync code never sets
-- sms_verified directly; manual edits set verification_source='manual'.
CREATE OR REPLACE FUNCTION public.meta_lead_forms_apply_sms_rule()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.verification_source = 'manual' AND NEW.verification_source = 'manual' THEN
    -- manual override: keep whatever sms_verified the manual edit set (or the old value)
    RETURN NEW;
  END IF;
  IF NEW.verification_source = 'name_rule' THEN
    NEW.sms_verified := public.sms_form_name_rule(NEW.name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_meta_lead_forms_sms_rule ON public.meta_lead_forms;
CREATE TRIGGER trg_meta_lead_forms_sms_rule BEFORE INSERT OR UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.meta_lead_forms_apply_sms_rule();

-- Manual override helpers. set_form_sms_override(form, null) clears the override.
CREATE OR REPLACE FUNCTION public.set_form_sms_override(p_meta_form_id text, p_sms_verified boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_sms_verified IS NULL THEN
    UPDATE meta_lead_forms SET verification_source = 'name_rule' WHERE meta_form_id = p_meta_form_id;
  ELSE
    UPDATE meta_lead_forms SET verification_source = 'manual', sms_verified = p_sms_verified
     WHERE meta_form_id = p_meta_form_id;
  END IF;
  -- refresh lead flags for this form
  UPDATE leads SET meta_form_id = meta_form_id WHERE meta_form_id = p_meta_form_id; -- re-fires lead trigger
END $$;

UPDATE public.meta_lead_forms SET sms_verified = public.sms_form_name_rule(name)
 WHERE verification_source = 'name_rule';

-- 3. meta_ad_form_map (ad -> lead form, from creative lead_gen_form_id)
CREATE TABLE IF NOT EXISTS public.meta_ad_form_map (
  ad_id text PRIMARY KEY,
  form_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_ad_form_map ADD COLUMN IF NOT EXISTS first_seen timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_meta_ad_form_map_form ON public.meta_ad_form_map(form_id);

-- History: one row per (ad, form) period. Current attribution = meta_ad_form_map (current form).
CREATE TABLE IF NOT EXISTS public.meta_ad_form_map_history (
  id bigserial PRIMARY KEY,
  ad_id text NOT NULL,
  form_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_form_map_history_ad ON public.meta_ad_form_map_history(ad_id, last_seen DESC);
GRANT SELECT ON public.meta_ad_form_map_history TO authenticated;
GRANT ALL ON public.meta_ad_form_map_history TO service_role;
ALTER TABLE public.meta_ad_form_map_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read meta_ad_form_map_history" ON public.meta_ad_form_map_history FOR SELECT TO authenticated USING (true);

-- Sync upserts (ad_id, form_id, client_id, last_seen). On a form change: restart first_seen and open a new
-- history row; otherwise extend the open history row's last_seen.
CREATE OR REPLACE FUNCTION public.meta_ad_form_map_track()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_seen := coalesce(NEW.first_seen, now());
    INSERT INTO public.meta_ad_form_map_history(ad_id, form_id, client_id, first_seen, last_seen)
      VALUES (NEW.ad_id, NEW.form_id, NEW.client_id, NEW.first_seen, NEW.last_seen);
  ELSIF NEW.form_id IS DISTINCT FROM OLD.form_id THEN
    NEW.first_seen := now();
    INSERT INTO public.meta_ad_form_map_history(ad_id, form_id, client_id, first_seen, last_seen)
      VALUES (NEW.ad_id, NEW.form_id, NEW.client_id, now(), NEW.last_seen);
  ELSE
    NEW.first_seen := OLD.first_seen;
    UPDATE public.meta_ad_form_map_history h SET last_seen = NEW.last_seen
     WHERE h.id = (SELECT id FROM public.meta_ad_form_map_history WHERE ad_id = NEW.ad_id ORDER BY first_seen DESC LIMIT 1);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_meta_ad_form_map_track ON public.meta_ad_form_map;
CREATE TRIGGER trg_meta_ad_form_map_track BEFORE INSERT OR UPDATE ON public.meta_ad_form_map
  FOR EACH ROW EXECUTE FUNCTION public.meta_ad_form_map_track();
CREATE INDEX IF NOT EXISTS idx_meta_ad_form_map_client ON public.meta_ad_form_map(client_id);
GRANT SELECT ON public.meta_ad_form_map TO authenticated;
GRANT ALL ON public.meta_ad_form_map TO service_role;
ALTER TABLE public.meta_ad_form_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read meta_ad_form_map" ON public.meta_ad_form_map FOR SELECT TO authenticated USING (true);

-- 2. leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_lead_id text,
  ADD COLUMN IF NOT EXISTS meta_form_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS is_sms_verified boolean,
  ADD COLUMN IF NOT EXISTS ghl_phone_validated boolean,  -- informational only, never counts as SMS-verified
  ADD COLUMN IF NOT EXISTS sms_replied boolean,          -- informational only
  ADD COLUMN IF NOT EXISTS verification_status text,      -- verified | unverified | unknown | form_uncertain
  ADD COLUMN IF NOT EXISTS match_method text;             -- meta_lead_id | email | phone (how meta ids were attached)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_verification_status_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_verification_status_chk
  CHECK (verification_status IS NULL OR verification_status IN ('verified','unverified','unknown','form_uncertain'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_match_method_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_match_method_chk
  CHECK (match_method IS NULL OR match_method IN ('meta_lead_id','email','phone'));
CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_lead_id_key ON public.leads(meta_lead_id) WHERE meta_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_meta_form_id ON public.leads(meta_form_id);

-- Status for one lead. Ad's form changed within 7 days of the lead => 'form_uncertain' (never verified).
CREATE OR REPLACE FUNCTION public.lead_sms_status(p_form_id text, p_ad_id text, p_created_at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE v boolean;
BEGIN
  IF p_form_id IS NULL THEN RETURN 'unknown'; END IF;
  IF p_ad_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.meta_ad_form_map_history h
        WHERE h.ad_id = p_ad_id AND h.form_id IS DISTINCT FROM p_form_id
          AND h.last_seen >= p_created_at - interval '7 days') THEN
    RETURN 'form_uncertain';
  END IF;
  SELECT sms_verified INTO v FROM public.meta_lead_forms WHERE meta_form_id = p_form_id;
  RETURN CASE WHEN v IS TRUE THEN 'verified' WHEN v IS FALSE THEN 'unverified' ELSE 'unknown' END;
END $$;

-- At ingest: meta_ad_id falls back to leads.ad_id (GHL attribution); meta_form_id falls back to the
-- ad->form map; is_sms_verified is the form flag, NULL when form unknown.
CREATE OR REPLACE FUNCTION public.leads_apply_sms_verified()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.meta_ad_id IS NULL AND NEW.ad_id ~ '^[0-9]{6,}$' THEN NEW.meta_ad_id := NEW.ad_id; END IF;
  IF NEW.meta_form_id IS NULL AND NEW.meta_ad_id IS NOT NULL THEN
    SELECT form_id INTO NEW.meta_form_id FROM public.meta_ad_form_map WHERE ad_id = NEW.meta_ad_id;
  END IF;
  NEW.verification_status := public.lead_sms_status(NEW.meta_form_id, NEW.meta_ad_id, coalesce(NEW.created_at, now()));
  NEW.is_sms_verified := CASE NEW.verification_status WHEN 'verified' THEN true WHEN 'unverified' THEN false ELSE NULL END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_leads_sms_verified ON public.leads;
CREATE TRIGGER trg_leads_sms_verified BEFORE INSERT OR UPDATE OF meta_form_id, meta_ad_id, ad_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_apply_sms_verified();

-- Keep lead flags in sync when the name rule changes a form.
CREATE OR REPLACE FUNCTION public.meta_lead_forms_propagate_sms()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sms_verified IS DISTINCT FROM OLD.sms_verified THEN
    UPDATE public.leads SET meta_form_id = meta_form_id WHERE meta_form_id = NEW.meta_form_id; -- re-fires lead trigger
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_meta_lead_forms_propagate_sms ON public.meta_lead_forms;
CREATE TRIGGER trg_meta_lead_forms_propagate_sms AFTER UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.meta_lead_forms_propagate_sms();

-- 4. daily_metrics
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS meta_leads_verified integer,
  ADD COLUMN IF NOT EXISTS spend_verified_forms numeric,
  ADD COLUMN IF NOT EXISTS spend_unverified_forms numeric;

-- Per client/day verified rollup (LA-day buckets, same as v_daily_funnel_day leads).
CREATE OR REPLACE VIEW public.v_daily_sms_verified AS
WITH lv AS (
  SELECT client_id, (created_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*) FILTER (WHERE verification_status = 'verified'
                            AND public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) <> 'bad'
                            AND coalesce(is_spam, false) = false) AS meta_leads_verified
    FROM public.leads
   WHERE coalesce((custom_fields->>'legacy_import')::boolean, false) = false  -- PR #10 legacy-import rows
   GROUP BY 1, 2
), sp AS (
  SELECT i.client_id, i.date,
         sum(i.spend) FILTER (WHERE f.sms_verified IS TRUE) AS spend_verified_forms,
         sum(i.spend) FILTER (WHERE m.form_id IS NOT NULL AND f.sms_verified IS NOT TRUE) AS spend_unverified_forms
    FROM public.meta_ad_daily_insights i
    JOIN public.meta_ad_form_map m ON m.ad_id = i.meta_ad_id
    LEFT JOIN public.meta_lead_forms f ON f.meta_form_id = m.form_id
   GROUP BY 1, 2
)
SELECT coalesce(lv.client_id, sp.client_id) AS client_id, coalesce(lv.date, sp.date) AS date,
       coalesce(lv.meta_leads_verified, 0)::int AS meta_leads_verified,
       coalesce(sp.spend_verified_forms, 0) AS spend_verified_forms,
       coalesce(sp.spend_unverified_forms, 0) AS spend_unverified_forms
  FROM lv FULL JOIN sp ON sp.client_id = lv.client_id AND sp.date = lv.date;
GRANT SELECT ON public.v_daily_sms_verified TO authenticated, service_role;

-- 6. Daily non-SMS form check: forms with sms_verified=false on ACTIVE ads, with last-7-day spend.
CREATE OR REPLACE VIEW public.v_active_non_sms_forms AS
SELECT c.id AS client_id, c.name AS client_name, f.meta_form_id, f.name AS form_name,
       f.verification_source, count(DISTINCT a.meta_ad_id) AS active_ads,
       coalesce(sum(i.spend), 0) AS spend_last_7d
  FROM public.meta_ad_form_map m
  JOIN public.meta_ads a ON a.meta_ad_id = m.ad_id AND a.effective_status = 'ACTIVE'
  JOIN public.clients c ON c.id = m.client_id
  LEFT JOIN public.meta_lead_forms f ON f.meta_form_id = m.form_id
  LEFT JOIN public.meta_ad_daily_insights i ON i.meta_ad_id = m.ad_id
        AND i.date >= (now() AT TIME ZONE 'America/Los_Angeles')::date - 7
 WHERE m.form_id IS NOT NULL AND coalesce(f.sms_verified, false) = false
 GROUP BY 1, 2, 3, 4, 5;
GRANT SELECT ON public.v_active_non_sms_forms TO authenticated, service_role;

-- Latest non-SMS form check result (for dashboard + box export script scripts/export-non-sms-forms.py).
CREATE TABLE IF NOT EXISTS public.meta_non_sms_form_checks (
  id bigserial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL
);
GRANT SELECT ON public.meta_non_sms_form_checks TO authenticated;
GRANT ALL ON public.meta_non_sms_form_checks TO service_role;
ALTER TABLE public.meta_non_sms_form_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read meta_non_sms_form_checks" ON public.meta_non_sms_form_checks FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.run_non_sms_form_check()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO meta_non_sms_form_checks(result)
  SELECT jsonb_build_object('generated_at', now(), 'clients', coalesce(jsonb_agg(c ORDER BY (c->>'spend_last_7d')::numeric DESC), '[]'::jsonb))
    FROM (
      SELECT jsonb_build_object('client_id', client_id, 'client_name', client_name,
               'spend_last_7d', sum(spend_last_7d),
               'forms', jsonb_agg(jsonb_build_object('form_id', meta_form_id, 'form_name', form_name,
                          'active_ads', active_ads, 'spend_last_7d', spend_last_7d,
                          'verification_source', verification_source) ORDER BY spend_last_7d DESC)) AS c
        FROM v_active_non_sms_forms GROUP BY client_id, client_name
    ) x
  RETURNING id;
$$;

CREATE OR REPLACE VIEW public.v_non_sms_forms_latest AS
SELECT ran_at, result FROM public.meta_non_sms_form_checks ORDER BY ran_at DESC LIMIT 1;
GRANT SELECT ON public.v_non_sms_forms_latest TO authenticated, service_role;

-- Re-evaluate SMS status for leads created in the last 7 days (DB-only, zero Meta calls). Catches ad->form
-- changes and form flag changes after ingest, incl. form_uncertain. Only rows whose status changes are updated.
CREATE OR REPLACE FUNCTION public.reevaluate_recent_lead_sms()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH calc AS (
    SELECT l.id, public.lead_sms_status(l.meta_form_id, l.meta_ad_id, l.created_at) AS st
    FROM public.leads l
    WHERE l.created_at >= now() - interval '7 days'
  )
  UPDATE public.leads l
     SET verification_status = c.st,
         is_sms_verified = CASE c.st WHEN 'verified' THEN true WHEN 'unverified' THEN false ELSE NULL END
    FROM calc c
   WHERE l.id = c.id
     AND (l.verification_status IS DISTINCT FROM c.st
          OR l.is_sms_verified IS DISTINCT FROM (CASE c.st WHEN 'verified' THEN true WHEN 'unverified' THEN false ELSE NULL END));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Daily at 13:45 UTC = 6:45 AM PDT. pg_cron runs in UTC with no DST: after DST ends (Nov 1, 2026) this
-- fires at 5:45 AM PST; change to '45 14 * * *' for winter if 6:45 local must hold. Pure SQL, zero Meta
-- calls, no HTTP/secret needed. Steps run sequentially in one job: (1) re-evaluate last-7-day leads,
-- (2) snapshot non-SMS forms.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-non-sms-form-check-daily') THEN
    PERFORM cron.unschedule('meta-non-sms-form-check-daily');
  END IF;
END $$;
SELECT cron.schedule('meta-non-sms-form-check-daily', '45 13 * * *', $$ SELECT public.reevaluate_recent_lead_sms(); SELECT public.run_non_sms_form_check(); $$);
