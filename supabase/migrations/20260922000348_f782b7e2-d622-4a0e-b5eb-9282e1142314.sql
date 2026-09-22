-- 1. Marketing/coaching intelligence on phone calls
ALTER TABLE public.phone_call_records
  ADD COLUMN IF NOT EXISTS qualification_score integer,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missed_follow_ups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rep_coaching jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS creative_briefs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Recorded meetings get the same analysis surface as phone calls
ALTER TABLE public.meeting_records
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS intent_score integer,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS important_quotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS investment_amount numeric,
  ADD COLUMN IF NOT EXISTS investment_range text,
  ADD COLUMN IF NOT EXISTS investment_timeline text,
  ADD COLUMN IF NOT EXISTS accredited text,
  ADD COLUMN IF NOT EXISTS commitment_level text,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualification_score integer,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missed_follow_ups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rep_coaching jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS creative_briefs jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS phone_call_records_score_idx
  ON public.phone_call_records (client_id, started_at DESC);

-- 3. Unified call intelligence view (adds scoring + capture state; keeps existing columns)
DROP VIEW IF EXISTS public.v_unified_call_transcripts;
CREATE VIEW public.v_unified_call_transcripts AS
SELECT p.id,
    'phone'::text AS source,
    'audio'::text AS media_kind,
    p.client_id, p.call_id, p.provider, p.appointment_id, p.contact_id,
    p.contact_name, p.contact_phone, p.contact_email,
    p.assigned_user, p.assigned_user_phone, p.campaign, p.direction, p.call_status,
    p.started_at, p.answered_at, p.ended_at, p.duration_seconds, p.connected,
    p.recording_url,
    NULL::text AS source_url,
    p.transcript, p.speaker_segments, p.transcription_status, p.transcription_error,
    p.summary,
    '[]'::jsonb AS action_items,
    NULL::jsonb AS participants,
    NULL::text AS title,
    p.outcome, p.sentiment, p.intent_score, p.next_step, p.follow_up_date,
    p.objections, p.important_quotes,
    p.investment_amount, p.investment_range, p.investment_timeline,
    p.accredited, p.commitment_level, p.tags, p.analyzed_at, p.ghl_synced_at,
    p.qualification_score, p.score_breakdown, p.qualification_evidence,
    p.missed_follow_ups, p.rep_coaching, p.creative_briefs,
    (p.recording_url IS NOT NULL) AS has_recording,
    (p.transcript IS NOT NULL AND length(btrim(p.transcript)) > 0) AS has_transcript,
    (p.analyzed_at IS NOT NULL) AS is_scored,
    p.created_at
   FROM public.phone_call_records p
UNION ALL
SELECT m.id,
    COALESCE(m.provider, 'meeting'::text) AS source,
    'video'::text AS media_kind,
    m.client_id,
    m.meeting_external_id AS call_id,
    m.provider,
    m.ghl_appointment_id AS appointment_id,
    COALESCE(m.ghl_contact_id, lmc.ghl_contact_id) AS contact_id,
    m.contact_name,
    NULL::text AS contact_phone,
    COALESCE(m.contact_email, lmc.matched_email) AS contact_email,
    m.sales_agent_name AS assigned_user,
    NULL::text AS assigned_user_phone,
    NULL::text AS campaign,
    'video'::text AS direction,
    m.status AS call_status,
    m.started_at,
    NULL::timestamptz AS answered_at,
    m.ended_at,
    COALESCE(m.duration_minutes, 0) * 60 AS duration_seconds,
    COALESCE(m.duration_minutes, 0) > 0 AS connected,
    COALESCE(m.recording_url, m.source_url) AS recording_url,
    m.source_url,
    m.transcript_text AS transcript,
    '[]'::jsonb AS speaker_segments,
    CASE
      WHEN m.transcript_text IS NOT NULL AND length(btrim(m.transcript_text)) > 0 THEN 'completed'::text
      ELSE 'awaiting_recording'::text
    END AS transcription_status,
    NULL::text AS transcription_error,
    m.summary,
    COALESCE(m.action_items, '[]'::jsonb) AS action_items,
    m.participants,
    m.title,
    m.outcome, m.sentiment, m.intent_score, m.next_step, m.follow_up_date,
    m.objections, m.important_quotes,
    m.investment_amount, m.investment_range, m.investment_timeline,
    m.accredited, m.commitment_level, m.tags,
    COALESCE(m.analyzed_at, m.attributed_at) AS analyzed_at,
    lmc.ghl_note_at AS ghl_synced_at,
    m.qualification_score, m.score_breakdown, m.qualification_evidence,
    m.missed_follow_ups, m.rep_coaching, m.creative_briefs,
    (COALESCE(m.recording_url, m.source_url) IS NOT NULL) AS has_recording,
    (m.transcript_text IS NOT NULL AND length(btrim(m.transcript_text)) > 0) AS has_transcript,
    (m.analyzed_at IS NOT NULL) AS is_scored,
    m.created_at
   FROM public.meeting_records m
     LEFT JOIN LATERAL (
       SELECT c.ghl_contact_id, c.matched_email, c.ghl_note_at
         FROM public.lead_meeting_context c
        WHERE c.meeting_record_id = m.id
        ORDER BY c.match_confidence DESC NULLS LAST, c.created_at
        LIMIT 1) lmc ON true;

GRANT SELECT ON public.v_unified_call_transcripts TO anon, authenticated, service_role;

-- 4. End-of-day sweep log
CREATE TABLE IF NOT EXISTS public.call_intel_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  per_client jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,
  sms_status text NOT NULL DEFAULT 'pending',
  sms_error text,
  recipient text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.call_intel_sweeps TO anon, authenticated;
GRANT ALL ON public.call_intel_sweeps TO service_role;
ALTER TABLE public.call_intel_sweeps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sweep log is readable in the app" ON public.call_intel_sweeps;
CREATE POLICY "Sweep log is readable in the app"
  ON public.call_intel_sweeps FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS call_intel_sweeps_date_idx ON public.call_intel_sweeps (sweep_date DESC);

DROP TRIGGER IF EXISTS call_intel_sweeps_updated_at ON public.call_intel_sweeps;
CREATE TRIGGER call_intel_sweeps_updated_at
  BEFORE UPDATE ON public.call_intel_sweeps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();