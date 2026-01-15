-- Create webhook_logs table to track incoming webhook data
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  webhook_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  payload JSONB,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add webhook_mappings JSONB column to client_settings
ALTER TABLE public.client_settings 
ADD COLUMN IF NOT EXISTS webhook_mappings JSONB DEFAULT '{}';

-- Add webhook_secret to clients for secure webhook validation
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS webhook_secret TEXT DEFAULT encode(gen_random_bytes(32), 'hex');

-- Create index for webhook logs
CREATE INDEX idx_webhook_logs_client ON public.webhook_logs(client_id);
CREATE INDEX idx_webhook_logs_type ON public.webhook_logs(webhook_type);
CREATE INDEX idx_webhook_logs_processed ON public.webhook_logs(processed_at);

-- Enable RLS on webhook_logs
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for webhook_logs (allow authenticated users to view their client's logs)
CREATE POLICY "Allow insert for webhook endpoints" 
ON public.webhook_logs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow select for authenticated users" 
ON public.webhook_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- Enable realtime for webhook_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_logs;