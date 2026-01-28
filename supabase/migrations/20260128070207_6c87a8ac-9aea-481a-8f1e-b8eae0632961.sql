-- Add ghl_notes column to leads table to store notes synced from GHL
ALTER TABLE public.leads 
ADD COLUMN ghl_notes JSONB DEFAULT '[]'::jsonb;