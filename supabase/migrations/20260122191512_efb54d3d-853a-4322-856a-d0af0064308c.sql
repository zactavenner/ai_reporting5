-- Add direction field to calls table for inbound/outbound tracking
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';

-- Add questions field to leads table to store all webhook questions
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS questions jsonb DEFAULT '[]'::jsonb;