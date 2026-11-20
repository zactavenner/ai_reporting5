-- Count GHL form re-submissions (existing contacts who submit a new form).
-- Depends on PR #10 (20261028150000_exclude_legacy_import_leads.sql): this
-- re-creates v_daily_funnel_day with the same columns and keeps its
-- legacy_import exclusion for the import row itself.
CREATE TABLE IF NOT EXISTS public.lead_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  external_submission_id text NOT NULL,
  external_contact_id text,
  form_id text,
  form_name text,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_form_submissions_client_submission_key UNIQUE (client_id, external_submission_id)
);
CREATE INDEX IF NOT EXISTS lead_form_submissions_lead_idx ON public.lead_form_submissions (lead_id);
CREATE INDEX IF NOT EXISTS lead_form_submissions_client_date_idx ON public.lead_form_submissions (client_id, submitted_at);
ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.v_daily_funnel_day AS
WITH d AS (
  SELECT client_id, date FROM public.ad_spend_daily
  UNION SELECT client_id, (created_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.leads
  UNION SELECT client_id, (submitted_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.lead_form_submissions
  UNION SELECT client_id, (booked_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.calls WHERE booked_at IS NOT NULL
  UNION SELECT client_id, (scheduled_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.calls WHERE scheduled_at IS NOT NULL
  UNION SELECT client_id, (funded_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.funded_investors WHERE funded_at IS NOT NULL
  UNION SELECT client_id, (committed_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.funded_investors WHERE committed_at IS NOT NULL
),
spend AS (
  SELECT client_id, date,
         sum(coalesce(spend,0))::numeric AS spend,
         sum(coalesce(impressions,0))::bigint AS impressions,
         sum(coalesce(clicks,0))::bigint AS clicks,
         sum(coalesce(leads,0))::bigint AS meta_leads,
         max(synced_at) AS spend_synced_at,
         count(*)::bigint AS spend_rows
  FROM public.ad_spend_daily GROUP BY 1,2
),
lead_events AS (
  -- (a) the lead's creation day, unless it is a legacy import (PR #10 / #12)
  SELECT l.client_id, l.id AS lead_id, (l.created_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         l.status, l.current_disposition, l.is_spam, l.quality_score
  FROM public.leads l
  WHERE coalesce((l.custom_fields->>'legacy_import')::boolean, false) = false
  UNION
  -- (b) every day the lead submitted a fresh form. A submission within 1h of the
  -- contact's creation is the original opt-in and is already counted by (a).
  -- Legacy imports are NOT excluded here: a CSV-imported contact who submits a
  -- new form is a real lead on that day. UNION dedupes the same lead/day.
  SELECT l.client_id, l.id, (s.submitted_at AT TIME ZONE 'America/Los_Angeles')::date,
         l.status, l.current_disposition, l.is_spam, l.quality_score
  FROM public.lead_form_submissions s
  JOIN public.leads l ON l.id = s.lead_id
  WHERE s.submitted_at > l.created_at + interval '1 hour'
),
lead_rollup AS (
  SELECT client_id, date,
         count(*)::bigint AS leads_total,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'qualified')::bigint AS leads_qualified,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'bad')::bigint AS leads_bad,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'pending')::bigint AS leads_pending
  FROM lead_events GROUP BY 1,2
),
booked AS (
  SELECT client_id, (booked_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = false)::bigint AS discovery_booked,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = true)::bigint AS reconnect_booked,
         count(*) FILTER (WHERE booked_at_missing)::bigint AS booked_at_missing_count
  FROM public.calls WHERE booked_at IS NOT NULL GROUP BY 1,2
),
attend AS (
  SELECT client_id, (scheduled_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = false AND public.call_is_eligible(appointment_status, scheduled_at))::bigint AS discovery_eligible,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = false AND public.call_is_showed(appointment_status))::bigint AS discovery_showed,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = false AND public.normalize_appointment_status(appointment_status) = 'noshow')::bigint AS discovery_noshow,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = false AND public.normalize_appointment_status(appointment_status) = 'pending' AND scheduled_at < now())::bigint AS discovery_unclassified,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = true AND public.call_is_eligible(appointment_status, scheduled_at))::bigint AS reconnect_eligible,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = true AND public.call_is_showed(appointment_status))::bigint AS reconnect_showed,
         count(*) FILTER (WHERE coalesce(is_reconnect,false) = true AND public.normalize_appointment_status(appointment_status) = 'noshow')::bigint AS reconnect_noshow
  FROM public.calls WHERE scheduled_at IS NOT NULL GROUP BY 1,2
),
commits AS (
  SELECT client_id, (committed_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*)::bigint AS commitments,
         sum(coalesce(commitment_amount,0))::numeric AS commitment_dollars
  FROM public.funded_investors
  WHERE committed_at IS NOT NULL AND coalesce(commitment_amount,0) > 0
  GROUP BY 1,2
),
funded AS (
  SELECT client_id, (funded_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*)::bigint AS funded_count,
         sum(coalesce(funded_amount,0))::numeric AS funded_dollars
  FROM public.funded_investors
  WHERE funded_at IS NOT NULL AND is_verified_funded = true AND coalesce(funded_amount,0) > 0
  GROUP BY 1,2
)
SELECT
  d.client_id,
  d.date,
  coalesce(s.spend, 0)::numeric AS spend,
  coalesce(s.impressions, 0)::bigint AS impressions,
  coalesce(s.clicks, 0)::bigint AS clicks,
  CASE WHEN coalesce(s.impressions,0) > 0 THEN round((s.clicks::numeric / s.impressions::numeric) * 100, 4) ELSE 0 END AS ctr,
  coalesce(s.meta_leads, 0)::bigint AS meta_leads,
  coalesce(s.spend_rows, 0)::bigint AS spend_rows,
  s.spend_synced_at,
  coalesce(l.leads_total, 0)::bigint AS leads_total,
  coalesce(l.leads_qualified, 0)::bigint AS leads_qualified,
  coalesce(l.leads_bad, 0)::bigint AS leads_bad,
  coalesce(l.leads_pending, 0)::bigint AS leads_pending,
  CASE WHEN coalesce(l.leads_total,0) > 0 THEN round(coalesce(s.spend,0) / l.leads_total, 2) ELSE 0 END AS cost_per_lead,
  coalesce(b.discovery_booked, 0)::bigint AS discovery_booked,
  coalesce(b.reconnect_booked, 0)::bigint AS reconnect_booked,
  coalesce(b.booked_at_missing_count, 0)::bigint AS booked_at_missing_count,
  coalesce(a.discovery_eligible, 0)::bigint AS discovery_eligible,
  coalesce(a.discovery_showed, 0)::bigint AS discovery_showed,
  coalesce(a.discovery_noshow, 0)::bigint AS discovery_noshow,
  coalesce(a.discovery_unclassified, 0)::bigint AS discovery_unclassified,
  CASE WHEN coalesce(a.discovery_eligible,0) > 0 THEN round((a.discovery_showed::numeric / a.discovery_eligible::numeric) * 100, 2) ELSE NULL END AS discovery_show_rate,
  coalesce(a.reconnect_eligible, 0)::bigint AS reconnect_eligible,
  coalesce(a.reconnect_showed, 0)::bigint AS reconnect_showed,
  coalesce(a.reconnect_noshow, 0)::bigint AS reconnect_noshow,
  CASE WHEN coalesce(a.reconnect_eligible,0) > 0 THEN round((a.reconnect_showed::numeric / a.reconnect_eligible::numeric) * 100, 2) ELSE NULL END AS reconnect_show_rate,
  coalesce(c.commitments, 0)::bigint AS commitments,
  coalesce(c.commitment_dollars, 0)::numeric AS commitment_dollars,
  coalesce(f.funded_count, 0)::bigint AS funded_count,
  coalesce(f.funded_dollars, 0)::numeric AS funded_dollars,
  CASE WHEN coalesce(a.discovery_showed,0) > 0 THEN round(coalesce(s.spend,0) / a.discovery_showed, 2) ELSE 0 END AS cost_per_showed,
  CASE WHEN coalesce(f.funded_count,0) > 0 THEN round(coalesce(s.spend,0) / f.funded_count, 2) ELSE 0 END AS cost_per_funded
FROM d
LEFT JOIN spend s ON s.client_id = d.client_id AND s.date = d.date
LEFT JOIN lead_rollup l ON l.client_id = d.client_id AND l.date = d.date
LEFT JOIN booked b ON b.client_id = d.client_id AND b.date = d.date
LEFT JOIN attend a ON a.client_id = d.client_id AND a.date = d.date
LEFT JOIN commits c ON c.client_id = d.client_id AND c.date = d.date
LEFT JOIN funded f ON f.client_id = d.client_id AND f.date = d.date
WHERE d.date IS NOT NULL;
