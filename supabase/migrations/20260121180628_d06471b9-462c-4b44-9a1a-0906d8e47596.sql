-- Add AI prompt settings and MRR/fee settings to agency and client settings

-- Create agency_settings table for agency-wide settings including AI prompts
CREATE TABLE IF NOT EXISTS public.agency_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ai_prompt_agency TEXT DEFAULT 'You are an expert advertising agency performance analyst. Analyze the uploaded files and provided metrics to give actionable insights for the agency portfolio.',
  ai_prompt_client TEXT DEFAULT 'You are an expert advertising performance analyst. Analyze the uploaded files and provided metrics to give actionable insights for this specific client.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on agency_settings
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (no auth implemented)
CREATE POLICY "Public can view agency_settings" 
ON public.agency_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Public can insert agency_settings" 
ON public.agency_settings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can update agency_settings" 
ON public.agency_settings 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- Add MRR and ad spend fee settings to client_settings
ALTER TABLE public.client_settings 
ADD COLUMN IF NOT EXISTS mrr NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_spend_fee_threshold NUMERIC DEFAULT 30000,
ADD COLUMN IF NOT EXISTS ad_spend_fee_percent NUMERIC DEFAULT 10;

-- Add campaign attribution fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS ad_set_name TEXT,
ADD COLUMN IF NOT EXISTS ad_id TEXT;

-- Add LAUNCHED status support - this is handled in code, no DB change needed

-- Insert default agency settings if none exist
INSERT INTO public.agency_settings (id) 
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;