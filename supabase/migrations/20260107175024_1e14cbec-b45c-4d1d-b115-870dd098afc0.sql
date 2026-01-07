-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  ghl_location_id TEXT,
  ghl_api_key TEXT,
  meta_ad_account_id TEXT,
  meta_access_token TEXT,
  public_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily_metrics table for aggregated stats
CREATE TABLE public.daily_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  ad_spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(5,4) DEFAULT 0,
  leads INTEGER DEFAULT 0,
  spam_leads INTEGER DEFAULT 0,
  calls INTEGER DEFAULT 0,
  showed_calls INTEGER DEFAULT 0,
  commitments INTEGER DEFAULT 0,
  commitment_dollars NUMERIC(12,2) DEFAULT 0,
  funded_investors INTEGER DEFAULT 0,
  funded_dollars NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, date)
);

-- Create leads table with deduplication
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'meta',
  name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'new',
  is_spam BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, external_id, source)
);

-- Create calls table with deduplication
CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  showed BOOLEAN DEFAULT false,
  outcome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, external_id)
);

-- Create funded_investors table for tracking conversion metrics
CREATE TABLE public.funded_investors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  funded_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  funded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_contact_at TIMESTAMP WITH TIME ZONE,
  time_to_fund_days INTEGER,
  calls_to_fund INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, external_id)
);

-- Create sync_logs table to track API syncs
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create alerts configuration table
CREATE TABLE public.alert_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  threshold NUMERIC(12,2) NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('above', 'below')),
  slack_webhook_url TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_daily_metrics_client_date ON public.daily_metrics(client_id, date);
CREATE INDEX idx_leads_client ON public.leads(client_id);
CREATE INDEX idx_calls_client ON public.calls(client_id);
CREATE INDEX idx_funded_investors_client ON public.funded_investors(client_id);
CREATE INDEX idx_sync_logs_client ON public.sync_logs(client_id);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funded_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_configs ENABLE ROW LEVEL SECURITY;

-- Public read access for clients via public_token (for public reports)
CREATE POLICY "Public can view clients by token" ON public.clients
  FOR SELECT USING (public_token IS NOT NULL);

CREATE POLICY "Public can view daily_metrics" ON public.daily_metrics
  FOR SELECT USING (true);

CREATE POLICY "Public can view funded_investors" ON public.funded_investors
  FOR SELECT USING (true);

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access to clients" ON public.clients
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to daily_metrics" ON public.daily_metrics
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to leads" ON public.leads
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to calls" ON public.calls
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to funded_investors" ON public.funded_investors
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to sync_logs" ON public.sync_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to alert_configs" ON public.alert_configs
  FOR ALL USING (true) WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_metrics_updated_at BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_alert_configs_updated_at BEFORE UPDATE ON public.alert_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate funded investor metrics
CREATE OR REPLACE FUNCTION public.calculate_funded_metrics()
RETURNS TRIGGER AS $$
DECLARE
  lead_created_at TIMESTAMP WITH TIME ZONE;
  call_count INTEGER;
BEGIN
  -- Get first contact date from lead
  IF NEW.lead_id IS NOT NULL THEN
    SELECT created_at INTO lead_created_at FROM public.leads WHERE id = NEW.lead_id;
    NEW.first_contact_at = lead_created_at;
    
    -- Calculate time to fund in days
    IF lead_created_at IS NOT NULL THEN
      NEW.time_to_fund_days = EXTRACT(DAY FROM (NEW.funded_at - lead_created_at));
    END IF;
    
    -- Count calls for this lead
    SELECT COUNT(*) INTO call_count FROM public.calls WHERE lead_id = NEW.lead_id;
    NEW.calls_to_fund = call_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER calculate_funded_metrics_trigger
  BEFORE INSERT OR UPDATE ON public.funded_investors
  FOR EACH ROW EXECUTE FUNCTION public.calculate_funded_metrics();