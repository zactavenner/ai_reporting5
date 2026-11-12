-- DRAFT (not applied). Server-side instant ping on task assignment.
--
-- Why: today the only thing that calls notify-task-assignee on assignment is
-- client-side UI code (useTaskAssignees.ts, KanbanBoard.tsx). Rows inserted
-- by the external-data-api, agent-tasks-api, hermes, ai-auto-assign-task,
-- run-agent, studio-assistant, etc. notify nobody (e.g. 41 assignments to
-- member 32328983 on 2026-10-19 14:49-14:50 UTC produced 0 task_notifications).
--
-- What: AFTER INSERT on task_assignees -> pg_net POST to the existing
-- notify-task-assignee edge function (which already sends email/SMS from the
-- agency GHL inbox, writes task_notification_deliveries, task_notifications
-- and task_history). One code path for every writer.
--
-- Prerequisites before applying (manual, never commit the key):
--   select vault.create_secret('<service role key>', 'task_notify_service_key');
-- If that secret is absent the trigger is a no-op (logs and returns).
--
-- Ship together with the PR's client change that removes the UI-side
-- notify-task-assignee invokes, otherwise UI assignments would ping twice.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_task_assignee_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_status text;
  v_stage text;
BEGIN
  -- Pod-only rows have no person to ping.
  IF NEW.member_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't ping for tasks that are already finished (e.g. backfills).
  SELECT status::text, stage::text INTO v_status, v_stage
    FROM public.tasks WHERE id = NEW.task_id;
  IF v_status = 'done' OR v_stage = 'done' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets
     WHERE name = 'task_notify_service_key'
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL THEN
    RAISE LOG 'notify_task_assignee_on_insert: vault secret task_notify_service_key missing; skipping';
    RETURN NEW;
  END IF;

  -- Async, best effort: never block or fail the insert.
  BEGIN
    PERFORM net.http_post(
      url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/notify-task-assignee',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'task_id', NEW.task_id,
        'member_id', NEW.member_id,
        'kind', 'assigned',
        'triggered_by', 'Assignment'
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_task_assignee_on_insert: http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_task_assignee_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_assignees_notify ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_notify
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_assignee_on_insert();

-- set_task_assignees used to DELETE every row and re-INSERT them, which with
-- the trigger above would re-ping existing assignees on every edit. Make it
-- diff-based so only genuinely new members produce an INSERT.
CREATE OR REPLACE FUNCTION public.set_task_assignees(
  _task_id   uuid,
  _member_ids uuid[],
  _pod_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members uuid[] := COALESCE(_member_ids, ARRAY[]::uuid[]);
  v_pods    uuid[] := COALESCE(_pod_ids, ARRAY[]::uuid[]);
BEGIN
  -- Remove members / pods no longer assigned.
  DELETE FROM public.task_assignees
   WHERE task_id = _task_id
     AND member_id IS NOT NULL
     AND NOT (member_id = ANY (v_members));
  DELETE FROM public.task_assignees
   WHERE task_id = _task_id
     AND pod_id IS NOT NULL
     AND NOT (pod_id = ANY (v_pods));

  -- Add only new members / pods.
  INSERT INTO public.task_assignees (task_id, member_id, pod_id)
  SELECT _task_id, m, NULL
    FROM (SELECT DISTINCT unnest(v_members) AS m) s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.task_assignees ta
      WHERE ta.task_id = _task_id AND ta.member_id = s.m);

  INSERT INTO public.task_assignees (task_id, member_id, pod_id)
  SELECT _task_id, NULL, p
    FROM (SELECT DISTINCT unnest(v_pods) AS p) s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.task_assignees ta
      WHERE ta.task_id = _task_id AND ta.pod_id = s.p);

  -- Keep legacy single-assignee column pointing at the first member id (uuid) or NULL
  -- (same as 20260714163630).
  UPDATE public.tasks
     SET assigned_to = v_members[1]
   WHERE id = _task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_task_assignees(uuid, uuid[], uuid[]) TO authenticated;
