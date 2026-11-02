ALTER TABLE public.ghl_outbound_log DROP CONSTRAINT ghl_outbound_log_client_id_fkey,
  ADD CONSTRAINT ghl_outbound_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.ghl_outbound_log DROP CONSTRAINT ghl_outbound_log_lead_id_fkey,
  ADD CONSTRAINT ghl_outbound_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.ghl_reconciliation_results DROP CONSTRAINT ghl_reconciliation_results_client_id_fkey,
  ADD CONSTRAINT ghl_reconciliation_results_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.ai_setter_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'ai_setter_events is append-only'; END IF;
  IF TG_OP = 'DELETE' AND NOT OLD.is_demo
     AND current_setting('app.ai_setter_cascade', true) IS DISTINCT FROM 'on'
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = OLD.client_id) THEN
    RAISE EXCEPTION 'ai_setter_events is append-only';
  END IF;
  RETURN OLD;
END $$;