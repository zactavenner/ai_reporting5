
-- External agent delivery: registry, write-only credentials, durable assignment outbox,
-- callback replay guard, and the shared Agents Team channel.

CREATE TABLE public.external_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{2,32}$'),
  display_name text NOT NULL,
  provider_label text NOT NULL,
  member_id uuid UNIQUE REFERENCES public.agency_members(id) ON DELETE SET NULL,
  transport text NOT NULL DEFAULT 'none' CHECK (transport IN ('none','push_webhook','pull_mcp')),
  endpoint_url text,
  supports_idempotency boolean NOT NULL DEFAULT false,
  oauth_user_id uuid UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_detail text,
  mention_hourly_limit integer NOT NULL DEFAULT 20 CHECK (mention_hourly_limit BETWEEN 0 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.external_agents TO service_role;
ALTER TABLE public.external_agents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.external_agent_credentials (
  agent_id uuid PRIMARY KEY REFERENCES public.external_agents(id) ON DELETE CASCADE,
  signing_secret text,
  outbound_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.external_agent_credentials TO service_role;
ALTER TABLE public.external_agent_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agent_assignment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.external_agents(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  client_id uuid,
  kind text NOT NULL CHECK (kind IN ('assignment','mention')),
  revision integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','waiting_pull','claimed','sending','accepted','in_progress','completed','failed_retryable','failed','needs_review','cancelled')),
  prev_status text,
  cancelled_txid bigint,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  external_run_id text,
  last_error text,
  source_message_id uuid,
  hop integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX agent_outbox_one_active_assignment ON public.agent_assignment_outbox (task_id, agent_id)
  WHERE kind = 'assignment' AND status NOT IN ('cancelled','completed','failed','needs_review');
CREATE INDEX agent_outbox_due ON public.agent_assignment_outbox (status, next_attempt_at);
GRANT ALL ON public.agent_assignment_outbox TO service_role;
ALTER TABLE public.agent_assignment_outbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.external_agent_callback_nonces (
  agent_id uuid NOT NULL REFERENCES public.external_agents(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, nonce)
);
GRANT ALL ON public.external_agent_callback_nonces TO service_role;
ALTER TABLE public.external_agent_callback_nonces ENABLE ROW LEVEL SECURITY;

-- Shared chat reuses agent_channels/agent_messages.
ALTER TABLE public.agent_channels DROP CONSTRAINT IF EXISTS agent_channels_kind_check;
ALTER TABLE public.agent_channels ADD CONSTRAINT agent_channels_kind_check CHECK (kind IN ('agent','jarvis-hermes','jarvis-team','agents-team'));
ALTER TABLE public.agent_messages DROP CONSTRAINT IF EXISTS agent_messages_kind_check;
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_kind_check CHECK (kind IN ('message','command','handoff','escalation','task-comment','tool-call','model-call','status','result'));
ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS from_external_agent_id uuid REFERENCES public.external_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS hop integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_to uuid,
  ADD COLUMN IF NOT EXISTS routed_at timestamptz;

INSERT INTO public.agent_channels (scope, client_id, agent_id, kind, name)
SELECT 'agency', NULL, NULL, 'agents-team', '#agents-team'
WHERE NOT EXISTS (SELECT 1 FROM public.agent_channels WHERE kind = 'agents-team');

INSERT INTO public.external_agents (slug, display_name, provider_label) VALUES
  ('grok_ppm','Grok PPM','Grok'), ('alfred','Alfred','ChatGPT'), ('muse','Muse','Muse'), ('claude','Claude','Claude')
ON CONFLICT (slug) DO NOTHING;

-- Enqueue on assignment. Only linked AND enabled agents, open tasks, new inserts only (no backfill).
CREATE OR REPLACE FUNCTION public.agent_outbox_on_assign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; t record; revived int; rev int;
BEGIN
  IF NEW.member_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM external_agents WHERE member_id = NEW.member_id AND enabled AND transport IN ('push_webhook','pull_mcp');
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT id, client_id, status INTO t FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND OR t.status IN ('done','completed') THEN RETURN NEW; END IF;
  -- set_task_assignees deletes then re-inserts in one transaction: revive instead of re-sending.
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
          CASE WHEN a.transport = 'pull_mcp' THEN 'waiting_pull' ELSE 'pending' END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.agent_outbox_on_unassign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.member_id IS NULL THEN RETURN OLD; END IF;
  UPDATE agent_assignment_outbox o SET prev_status = o.status, status = 'cancelled', cancelled_txid = txid_current(),
         lease_owner = NULL, updated_at = now()
   WHERE o.task_id = OLD.task_id AND o.kind = 'assignment'
     AND o.agent_id IN (SELECT id FROM external_agents WHERE member_id = OLD.member_id)
     AND o.status IN ('pending','waiting_pull','claimed','failed_retryable','accepted','in_progress');
  RETURN OLD;
END $$;

CREATE TRIGGER task_assignees_agent_outbox_ins AFTER INSERT ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.agent_outbox_on_assign();
CREATE TRIGGER task_assignees_agent_outbox_del AFTER DELETE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.agent_outbox_on_unassign();

-- Atomic claim with leases. An expired 'sending' lease is ambiguous: retry only if the
-- agent honours Idempotency-Key, otherwise park for human review (never blind resend).
CREATE OR REPLACE FUNCTION public.claim_agent_outbox(p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.agent_assignment_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE agent_assignment_outbox o SET status = 'needs_review', lease_owner = NULL,
         last_error = 'Delivery outcome unknown (lease expired mid-send); agent lacks idempotency support', updated_at = now()
   FROM external_agents a
   WHERE a.id = o.agent_id AND o.status = 'sending' AND o.lease_expires_at < now() AND NOT a.supports_idempotency;
  RETURN QUERY
  UPDATE agent_assignment_outbox o SET status = 'claimed', lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE o.id IN (
    SELECT x.id FROM agent_assignment_outbox x JOIN external_agents a ON a.id = x.agent_id
    WHERE a.enabled AND a.transport = 'push_webhook'
      AND ((x.status IN ('pending','failed_retryable') AND x.next_attempt_at <= now())
        OR (x.status IN ('claimed','sending') AND x.lease_expires_at < now()))
      AND x.attempts < x.max_attempts
    ORDER BY x.next_attempt_at LIMIT p_limit FOR UPDATE OF x SKIP LOCKED)
  RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_outbox(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_outbox(text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.agent_outbox_on_assign() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_outbox_on_unassign() FROM PUBLIC, anon, authenticated;

-- Pull adapter (OAuth MCP). The caller is resolved from auth.uid(); never from input.
CREATE OR REPLACE FUNCTION public.mcp_agent_self() RETURNS public.external_agents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM external_agents WHERE oauth_user_id = auth.uid() AND auth.uid() IS NOT NULL
    AND enabled AND transport = 'pull_mcp' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mcp_agent_list_assignments(p_limit integer DEFAULT 25)
RETURNS TABLE (delivery_id uuid, kind text, status text, task_id uuid, task_title text, task_description text,
               task_status text, due_date date, client_id uuid, created_at timestamptz, source_message_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  RETURN QUERY
  SELECT o.id, o.kind, o.status, o.task_id, t.title, t.description, t.status, t.due_date, o.client_id, o.created_at, o.source_message_id
    FROM agent_assignment_outbox o LEFT JOIN tasks t ON t.id = o.task_id
   WHERE o.agent_id = a.id AND o.status IN ('waiting_pull','accepted','in_progress')
     AND (o.kind = 'mention' OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = o.task_id AND ta.member_id = a.member_id))
   ORDER BY o.created_at LIMIT least(greatest(coalesce(p_limit,25),1),100);
END $$;

CREATE OR REPLACE FUNCTION public.mcp_agent_claim_assignment(p_delivery_id uuid)
RETURNS TABLE (delivery_id uuid, status text, claimed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents; n int;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  UPDATE agent_assignment_outbox o SET status = 'accepted', accepted_at = now(), updated_at = now()
   WHERE o.id = p_delivery_id AND o.agent_id = a.id AND o.status = 'waiting_pull'
     AND (o.kind = 'mention' OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = o.task_id AND ta.member_id = a.member_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT o.id, o.status, n > 0 FROM agent_assignment_outbox o WHERE o.id = p_delivery_id AND o.agent_id = a.id;
END $$;

CREATE OR REPLACE FUNCTION public.mcp_agent_post_task_update(p_delivery_id uuid, p_event text, p_summary text, p_result_url text DEFAULT NULL)
RETURNS TABLE (delivery_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents; o agent_assignment_outbox; ch uuid; new_status text;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  IF p_event NOT IN ('progress','completed','failed') THEN RAISE EXCEPTION 'invalid_event'; END IF;
  IF p_result_url IS NOT NULL AND p_result_url !~ '^https://' THEN RAISE EXCEPTION 'result_url_must_be_https'; END IF;
  SELECT * INTO o FROM agent_assignment_outbox x WHERE x.id = p_delivery_id AND x.agent_id = a.id FOR UPDATE;
  IF o.id IS NULL OR o.status NOT IN ('accepted','in_progress') THEN RAISE EXCEPTION 'delivery_not_active'; END IF;
  IF o.kind = 'assignment' AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = o.task_id AND ta.member_id = a.member_id) THEN
    RAISE EXCEPTION 'task_not_assigned_to_agent'; END IF;
  new_status := CASE p_event WHEN 'progress' THEN 'in_progress' ELSE p_event END;
  UPDATE agent_assignment_outbox SET status = new_status, updated_at = now(),
         completed_at = CASE WHEN p_event IN ('completed','failed') THEN now() END
   WHERE id = o.id;
  SELECT id INTO ch FROM agent_channels WHERE kind = 'agents-team' LIMIT 1;
  INSERT INTO agent_messages (channel_id, role, kind, body, task_id, from_external_agent_id, sender_name, payload, routed_at)
  VALUES (ch, 'agent', CASE WHEN p_event = 'completed' THEN 'result' ELSE 'status' END, left(coalesce(p_summary,''), 4000),
          o.task_id, a.id, a.display_name, jsonb_build_object('event', p_event, 'delivery_id', o.id, 'result_url', p_result_url), now());
  IF o.task_id IS NOT NULL THEN
    INSERT INTO task_comments (task_id, author_name, content, comment_type)
    VALUES (o.task_id, a.display_name, left(coalesce(p_summary,'') || coalesce(E'\n' || p_result_url, ''), 4000), 'agent_update');
  END IF;
  RETURN QUERY SELECT o.id, new_status;
END $$;

CREATE OR REPLACE FUNCTION public.mcp_agent_list_team_messages(p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, sender_name text, kind text, body text, task_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  RETURN QUERY SELECT m.id, coalesce(m.sender_name, m.role), m.kind, m.body, m.task_id, m.created_at
    FROM agent_messages m JOIN agent_channels c ON c.id = m.channel_id AND c.kind = 'agents-team'
   ORDER BY m.created_at DESC LIMIT least(greatest(coalesce(p_limit,50),1),200);
END $$;

CREATE OR REPLACE FUNCTION public.mcp_agent_post_team_message(p_body text, p_task_id uuid DEFAULT NULL, p_reply_to uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents; ch uuid; mid uuid; parent_hop int;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  IF length(coalesce(trim(p_body),'')) = 0 OR length(p_body) > 4000 THEN RAISE EXCEPTION 'invalid_body'; END IF;
  SELECT id INTO ch FROM agent_channels WHERE kind = 'agents-team' LIMIT 1;
  SELECT hop INTO parent_hop FROM agent_messages WHERE id = p_reply_to AND channel_id = ch;
  INSERT INTO agent_messages (channel_id, role, kind, body, task_id, from_external_agent_id, sender_name, hop, reply_to)
  VALUES (ch, 'agent', 'message', p_body, p_task_id, a.id, a.display_name, coalesce(parent_hop, 0) + 1, p_reply_to)
  RETURNING id INTO mid;
  RETURN mid;
END $$;

REVOKE ALL ON FUNCTION public.mcp_agent_self() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_agent_list_assignments(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_agent_claim_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_agent_post_task_update(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_agent_list_team_messages(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_agent_post_team_message(text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_agent_self() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_agent_list_assignments(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_agent_claim_assignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_agent_post_task_update(uuid,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_agent_list_team_messages(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_agent_post_team_message(text,uuid,uuid) TO authenticated, service_role;
