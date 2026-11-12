-- Exclude legacy CRM imports (e.g. Paradyme's 2019-21 HubSpot import rows)
-- from lead counts without deleting them. The flag lives in the existing
-- leads.custom_fields jsonb column, so no schema change is needed.
-- Rows that are flagged are left out of v_daily_funnel_day lead_rollup.
UPDATE public.leads
SET custom_fields = coalesce(custom_fields, '{}'::jsonb) || '{"legacy_import": true, "legacy_import_source": "hubspot"}'::jsonb
WHERE client_id = 'a5b63280-fe3f-4d67-a6c6-b387262fc5dd'::uuid
  AND external_id LIKE 'hubspot\_%'
  AND created_at < '2022-01-01';

CREATE OR REPLACE VIEW public.v_daily_funnel_day AS
WITH d AS (
  SELECT client_id, date FROM public.ad_spend_daily
  UNION SELECT client_id, (created_at AT TIME ZONE 'America/Los_Angeles')::date FROM public.leads
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
lead_rollup AS (
  SELECT client_id, (created_at AT TIME ZONE 'America/Los_Angeles')::date AS date,
         count(*)::bigint AS leads_total,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'qualified')::bigint AS leads_qualified,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'bad')::bigint AS leads_bad,
         count(*) FILTER (WHERE public.lead_quality_normalize(status, current_disposition, is_spam, quality_score) = 'pending')::bigint AS leads_pending
  FROM public.leads WHERE coalesce((custom_fields->>'legacy_import')::boolean, false) = false GROUP BY 1,2
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
