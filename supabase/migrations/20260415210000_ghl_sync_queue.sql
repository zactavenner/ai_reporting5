-- GHL Sync Queue: durable retry queue for bi-directional GHL sync
-- Ensures every lead webhook is processed (enriched + written back to GHL) at least once,
-- with exponential backoff on failures and full audit trail.

-- ============================================================
-- 1. ghl_sync_queue: Durable job queue for GHL operations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ghl_sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  -- What operation to perform
  operation TEXT NOT NULL CHECK (operation IN (
    'enrich_and_sync_back', -- Fetch enrichment data, update GHL contact
    'push_field',            -- Update a specific GHL custom field
    'add_tag',               -- Add tag to GHL contact
    'remove_tag',            -- Remove tag from GHL contact
    'create_opportunity',    -- Create opportunity in GHL
    'update_stage'           -- Move opportunity to new stage
  )),
  -- Input payload (e.g., field names, tag names, enrichment source)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Current status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed', 'dead_letter'
  )),
  -- Retry tracking
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  -- Result
  response_payload JSONB DEFAULT '{}'::jsonb,
  -- Idempotency: dedup key prevents duplicate enqueueing from retries
  dedup_key TEXT UNIQUE,
  -- Priority: higher = processed first (default 0)
  priority INTEGER NOT NULL DEFAULT 0,
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ghl_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view ghl_sync_queue"
  ON public.ghl_sync_queue FOR SELECT USING (true);

CREATE POLICY "Service role full access to ghl_sync_queue"
  ON public.ghl_sync_queue FOR ALL USING (true) WITH CHECK (true);

-- Primary query index: find pending jobs ready to process
CREATE INDEX idx_ghl_sync_queue_ready
  ON public.ghl_sync_queue(next_attempt_at, priority DESC)
  WHERE status IN ('pending', 'failed');

-- Lookup indexes
CREATE INDEX idx_ghl_sync_queue_client ON public.ghl_sync_queue(client_id, created_at DESC);
CREATE INDEX idx_ghl_sync_queue_lead ON public.ghl_sync_queue(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_ghl_sync_queue_status ON public.ghl_sync_queue(status, created_at DESC)
  WHERE status != 'succeeded'; -- Monitoring: pending/processing/failed/dead_letter

-- ============================================================
-- 2. Helper function: compute exponential backoff
-- ============================================================
-- Returns the next_attempt_at timestamp based on attempt count.
-- Attempts: 1 → +30s, 2 → +2min, 3 → +10min, 4 → +1hr, 5 → +6hr
CREATE OR REPLACE FUNCTION public.ghl_queue_next_attempt(p_attempts INTEGER)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
  RETURN now() + (
    CASE p_attempts
      WHEN 0 THEN INTERVAL '0 seconds'
      WHEN 1 THEN INTERVAL '30 seconds'
      WHEN 2 THEN INTERVAL '2 minutes'
      WHEN 3 THEN INTERVAL '10 minutes'
      WHEN 4 THEN INTERVAL '1 hour'
      ELSE INTERVAL '6 hours'
    END
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ============================================================
-- 3. Helper function: claim next N jobs atomically (for worker)
-- ============================================================
-- Worker calls this to get a batch of jobs to process.
-- Uses SKIP LOCKED so multiple workers can run in parallel without double-processing.
CREATE OR REPLACE FUNCTION public.ghl_queue_claim_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.ghl_sync_queue AS $$
  WITH claimed AS (
    SELECT id FROM public.ghl_sync_queue
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
      AND attempts < max_attempts
    ORDER BY priority DESC, next_attempt_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ghl_sync_queue q
    SET status = 'processing',
        started_at = now(),
        attempts = q.attempts + 1
  FROM claimed
  WHERE q.id = claimed.id
  RETURNING q.*;
$$ LANGUAGE sql SET search_path = public;

-- ============================================================
-- 4. Helper: mark job succeeded/failed
-- ============================================================
CREATE OR REPLACE FUNCTION public.ghl_queue_mark_succeeded(
  p_job_id UUID,
  p_response JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  UPDATE public.ghl_sync_queue
    SET status = 'succeeded',
        completed_at = now(),
        response_payload = p_response,
        last_error = NULL
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.ghl_queue_mark_failed(
  p_job_id UUID,
  p_error TEXT
) RETURNS VOID AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM public.ghl_sync_queue WHERE id = p_job_id;

  UPDATE public.ghl_sync_queue
    SET status = CASE
          WHEN v_attempts >= v_max_attempts THEN 'dead_letter'
          ELSE 'failed'
        END,
        last_error = p_error,
        next_attempt_at = public.ghl_queue_next_attempt(v_attempts),
        completed_at = CASE WHEN v_attempts >= v_max_attempts THEN now() ELSE NULL END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;
