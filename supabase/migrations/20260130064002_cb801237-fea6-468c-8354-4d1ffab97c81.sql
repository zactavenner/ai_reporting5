-- Add opportunity fields to leads table for tracking GHL pipeline status
ALTER TABLE public.leads
ADD COLUMN opportunity_status TEXT,
ADD COLUMN opportunity_stage TEXT,
ADD COLUMN opportunity_stage_id TEXT,
ADD COLUMN opportunity_value NUMERIC DEFAULT 0;