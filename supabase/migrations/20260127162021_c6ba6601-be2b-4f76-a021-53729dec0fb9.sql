-- Create data_discrepancies table
CREATE TABLE public.data_discrepancies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  discrepancy_type TEXT NOT NULL,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  webhook_count INTEGER NOT NULL DEFAULT 0,
  api_count INTEGER NOT NULL DEFAULT 0,
  db_count INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'info',
  status TEXT NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  sync_log_id UUID REFERENCES public.sync_logs(id) ON DELETE SET NULL
);

-- Enable Row Level Security
ALTER TABLE public.data_discrepancies ENABLE ROW LEVEL SECURITY;

-- Create policies for dashboard access
CREATE POLICY "Public can view data_discrepancies"
ON public.data_discrepancies
FOR SELECT
USING (true);

CREATE POLICY "Public can insert data_discrepancies"
ON public.data_discrepancies
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update data_discrepancies"
ON public.data_discrepancies
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can delete data_discrepancies"
ON public.data_discrepancies
FOR DELETE
USING (true);

-- Service role full access for Edge Functions
CREATE POLICY "Service role full access to data_discrepancies"
ON public.data_discrepancies
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_data_discrepancies_client_id ON public.data_discrepancies(client_id);
CREATE INDEX idx_data_discrepancies_status ON public.data_discrepancies(status);
CREATE INDEX idx_data_discrepancies_detected_at ON public.data_discrepancies(detected_at DESC);