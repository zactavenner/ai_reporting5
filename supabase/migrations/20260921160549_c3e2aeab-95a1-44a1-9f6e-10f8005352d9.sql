-- Capture state per client: cursor + single-flight lease so only one capture run
-- works a client at a time and each run resumes where the last one stopped.
CREATE TABLE IF NOT EXISTS public.call_recording_capture_state (
  client_id UUID NOT NULL PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  consent_confirmed_at TIMESTAMP WITH TIME ZONE,
  consent_confirmed_by TEXT,
  last_cursor_at TIMESTAMP WITH TIME ZONE,
  last_conversation_id TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_run_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.call_recording_capture_state TO service_role;
ALTER TABLE public.call_recording_capture_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER call_recording_capture_state_touch
BEFORE UPDATE ON public.call_recording_capture_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reason code + bounded retry bookkeeping on the existing call records table.
ALTER TABLE public.phone_call_records
  ADD COLUMN IF NOT EXISTS recording_status TEXT,
  ADD COLUMN IF NOT EXISTS recording_checked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS recording_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS phone_call_records_recording_status_idx
  ON public.phone_call_records (client_id, recording_status);

-- Per-client coverage: every gap carries its own reason, so missing data never reads as zero.
CREATE OR REPLACE VIEW public.v_client_call_recording_coverage
WITH (security_invoker = true) AS
SELECT
  r.client_id,
  date_trunc('day', COALESCE(r.started_at, r.created_at))::date AS day,
  count(*)::int AS calls,
  count(r.recording_url)::int AS with_recording,
  count(*) FILTER (WHERE r.recording_status = 'available')::int AS recording_available,
  count(*) FILTER (WHERE r.recording_status = 'no_recording_in_crm')::int AS no_recording_in_crm,
  count(*) FILTER (WHERE r.recording_status = 'recording_expired')::int AS recording_expired,
  count(*) FILTER (WHERE r.recording_status = 'recording_unreachable')::int AS recording_unreachable,
  count(*) FILTER (WHERE r.recording_status = 'too_short')::int AS too_short,
  count(*) FILTER (WHERE r.transcription_status = 'completed')::int AS transcribed,
  count(*) FILTER (WHERE r.transcription_status = 'failed')::int AS transcription_failed,
  count(*) FILTER (WHERE r.transcription_status IN ('pending', 'transcribing'))::int AS transcription_queued,
  count(*) FILTER (WHERE r.analyzed_at IS NOT NULL)::int AS scored
FROM public.phone_call_records r
GROUP BY 1, 2;

GRANT SELECT ON public.v_client_call_recording_coverage TO authenticated, service_role;