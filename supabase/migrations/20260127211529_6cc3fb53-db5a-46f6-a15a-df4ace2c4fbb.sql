-- Create table for funnel steps with iframe URLs per client
CREATE TABLE public.client_funnel_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_client_funnel_steps_client_id ON public.client_funnel_steps(client_id);

-- Enable RLS
ALTER TABLE public.client_funnel_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policy - Allow all operations (no auth required for this agency dashboard)
CREATE POLICY "Allow all operations on client_funnel_steps"
ON public.client_funnel_steps
FOR ALL
USING (true)
WITH CHECK (true);