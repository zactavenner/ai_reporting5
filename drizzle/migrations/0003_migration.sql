
-- Local Mac worker (outbound polling) + remote MCP adapter + persistent per-agent session linkage.
ALTER TABLE public.external_agents DROP CONSTRAINT IF EXISTS external_agents_transport_check;
ALTER TABLE public.external_agents ADD CONSTRAINT external_agents_transport_check
  CHECK (transport IN ('none','push_webhook','pull_mcp','local_worker','remote_mcp'));
ALTER TABLE public.external_agents
  ADD COLUMN IF NOT EXISTS runtime text CHECK (runtime IS NULL OR runtime IN ('codex_cli','claude_code','service')),
  ADD COLUMN IF NOT EXISTS mcp_tool_name text,
  ADD COLUMN IF NOT EXISTS worker_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_info jsonb,
  ADD COLUMN IF NOT EXISTS test_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_nonce text;

CREATE TABLE public.external_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.external_agents(id) ON DELETE CASCADE,
  scope_key text NOT NULL CHECK (scope_key ~ '^(task:[0-9a-f-]{36}|team)$'),
  runtime text,
  external_session_id text NOT NULL CHECK (length(external_session_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, scope_key)
);
GRANT ALL ON public.external_agent_sessions TO service_role;
ALTER TABLE public.external_agent_sessions ENABLE ROW LEVEL SECURITY;

-- Local/pull agents queue as waiting_pull; push + remote MCP queue as pending.
CREATE OR REPLACE FUNCTION public.agent_outbox_on_assign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; t record; revived int; rev int;
BEGIN
  IF NEW.member_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM external_agents WHERE member_id = NEW.member_id AND enabled AND transport <> 'none';
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT id, client_id, status INTO t FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND OR t.status IN ('done','completed') THEN RETURN NEW; END IF;
  UPDATE agent_assignment_outbox SET status = prev_status, prev_status = NULL, cancelled_txid = NULL, updated_at = now()
   WHERE task_id = NEW.task_id AND agent_id = a.id AND kind = 'assignment'
     AND status = 'cancelled' AND cancelled_txid = txid_current();
  GET DIAGNOSTICS revived = ROW_COUNT;
  IF revived > 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM agent_assignment_outbox WHERE task_id = NEW.task_id AND agent_id = a.id AND kind = 'assignment'
             AND status NOT IN ('cancelled','completed','failed','needs_review')) THEN RETURN NEW; END IF;
  SELECT coalesce(max(revision), 0) + 1 INTO rev FROM agent_assignment_outbox WHERE task_id = NEW.task_id AND agent_id = a.id AND kind = 'assignment';
  INSERT INTO agent_assignment_outbox (agent_id, task_id, client_id, kind, revision, idempotency_key, status)
  VALUES (a.id, NEW.task_id, t.client_id, 'assignment', rev, 'assign:' || NEW.task_id || ':' || a.id || ':' || rev,
          CASE WHEN a.transport IN ('pull_mcp','local_worker') THEN 'waiting_pull' ELSE 'pending' END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_outbox(p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.agent_assignment_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE agent_assignment_outbox o SET status = 'needs_review', lease_owner = NULL,
         last_error = 'Delivery outcome unknown (lease expired mid-send); agent lacks idempotency support', updated_at = now()
   FROM external_agents a
   WHERE a.id = o.agent_id AND a.transport IN ('push_webhook','remote_mcp') AND o.status = 'sending' AND o.lease_expires_at < now() AND NOT a.supports_idempotency;
  RETURN QUERY
  UPDATE agent_assignment_outbox o SET status = 'claimed', lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE o.id IN (
    SELECT x.id FROM agent_assignment_outbox x JOIN external_agents a ON a.id = x.agent_id
    WHERE a.enabled AND a.transport IN ('push_webhook','remote_mcp')
      AND ((x.status IN ('pending','failed_retryable') AND x.next_attempt_at <= now())
        OR (x.status IN ('claimed','sending') AND x.lease_expires_at < now()))
      AND x.attempts < x.max_attempts
    ORDER BY x.next_attempt_at LIMIT p_limit FOR UPDATE OF x SKIP LOCKED)
  RETURNING o.*;
END $$;

-- Local worker claim: only this agent's waiting work. A claim whose lease lapses before the
-- worker reports "accepted" may already be running on the Mac → review, never auto re-run.
CREATE OR REPLACE FUNCTION public.claim_local_agent_work(p_agent_id uuid, p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.agent_assignment_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE agent_assignment_outbox SET status = 'needs_review', lease_owner = NULL, updated_at = now(),
         last_error = 'Worker claimed but never confirmed start; may have run — review before resending'
   WHERE agent_id = p_agent_id AND status = 'claimed' AND lease_expires_at < now();
  RETURN QUERY
  UPDATE agent_assignment_outbox o SET status = 'claimed', lease_owner = p_owner, attempts = o.attempts + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE o.id IN (
    SELECT x.id FROM agent_assignment_outbox x JOIN external_agents a ON a.id = x.agent_id
     WHERE x.agent_id = p_agent_id AND a.enabled AND a.transport = 'local_worker' AND x.status = 'waiting_pull'
       AND (x.kind = 'mention' OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = x.task_id AND ta.member_id = a.member_id))
     ORDER BY x.created_at LIMIT least(greatest(p_limit,1),5) FOR UPDATE OF x SKIP LOCKED)
  RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_local_agent_work(uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_agent_work(uuid,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_agent_outbox(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_outbox(text,integer,integer) TO service_role;
