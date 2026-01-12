-- Create client_settings table for per-client KPI thresholds and custom terminology
CREATE TABLE public.client_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE,
  
  -- CPL thresholds
  cpl_threshold_yellow NUMERIC DEFAULT 50,
  cpl_threshold_red NUMERIC DEFAULT 100,
  
  -- Cost Per Call thresholds
  cost_per_call_threshold_yellow NUMERIC DEFAULT 100,
  cost_per_call_threshold_red NUMERIC DEFAULT 200,
  
  -- Cost Per Show thresholds
  cost_per_show_threshold_yellow NUMERIC DEFAULT 150,
  cost_per_show_threshold_red NUMERIC DEFAULT 300,
  
  -- Cost Per Investor thresholds
  cost_per_investor_threshold_yellow NUMERIC DEFAULT 500,
  cost_per_investor_threshold_red NUMERIC DEFAULT 1000,
  
  -- Cost of Capital thresholds (percentage)
  cost_of_capital_threshold_yellow NUMERIC DEFAULT 5,
  cost_of_capital_threshold_red NUMERIC DEFAULT 10,
  
  -- Custom terminology
  funded_investor_label TEXT DEFAULT 'Funded Investors',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service role full access to client_settings"
ON public.client_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can view client_settings"
ON public.client_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_client_settings_updated_at
BEFORE UPDATE ON public.client_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();