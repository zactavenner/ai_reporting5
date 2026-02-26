
-- Integration status tracking
CREATE TABLE public.integration_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  integration_name text NOT NULL CHECK (integration_name IN ('meta_ads', 'ghl', 'hubspot', 'meetgeek', 'stripe')),
  is_connected boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'partial', 'failed')),
  records_synced integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error_message text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, integration_name)
);

ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view integration_status" ON public.integration_status FOR SELECT USING (true);
CREATE POLICY "Public can insert integration_status" ON public.integration_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update integration_status" ON public.integration_status FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete integration_status" ON public.integration_status FOR DELETE USING (true);

-- Sync errors log
CREATE TABLE public.sync_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  integration_name text NOT NULL,
  endpoint text,
  status_code integer,
  error_message text,
  attempt_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view sync_errors" ON public.sync_errors FOR SELECT USING (true);
CREATE POLICY "Public can insert sync_errors" ON public.sync_errors FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete sync_errors" ON public.sync_errors FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_integration_status_updated_at
  BEFORE UPDATE ON public.integration_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
