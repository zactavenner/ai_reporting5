
-- Wake the worker the moment a push delivery is queued (or re-queued); hourly sweep only recovers retries/leases.
CREATE OR REPLACE FUNCTION public.agent_outbox_kick() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    PERFORM net.http_post(
      url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/external-agent-worker',
      headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4'),
      body := '{}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_outbox_kick() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agent_outbox_kick ON public.agent_assignment_outbox;
CREATE TRIGGER agent_outbox_kick AFTER INSERT OR UPDATE OF status ON public.agent_assignment_outbox FOR EACH ROW EXECUTE FUNCTION public.agent_outbox_kick();

-- Team chat posts also wake routing.
CREATE OR REPLACE FUNCTION public.agent_team_message_kick() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.routed_at IS NULL AND NEW.body ~ '@[A-Za-z0-9_]{2,32}' AND EXISTS (SELECT 1 FROM agent_channels c WHERE c.id = NEW.channel_id AND c.kind = 'agents-team') THEN
    PERFORM net.http_post(
      url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/external-agent-worker',
      headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4'),
      body := '{}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_team_message_kick() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER agent_team_message_kick AFTER INSERT ON public.agent_messages FOR EACH ROW EXECUTE FUNCTION public.agent_team_message_kick();

SELECT cron.schedule('external-agent-worker-hourly', '7 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/external-agent-worker',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd3dtdHV2amxtemFwd3FpYWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDkzODIsImV4cCI6MjA4MzMyNTM4Mn0.STFrUoif30xXQCjabc3skP6_tTnVIATwHhwWxeZoUr4'),
    body := '{}'::jsonb);
$cron$);
