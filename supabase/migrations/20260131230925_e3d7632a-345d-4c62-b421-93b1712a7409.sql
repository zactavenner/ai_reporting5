-- Create sync queue table for managing batch sync operations
CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('contacts', 'appointments', 'timeline', 'full')),
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  date_range_start DATE,
  date_range_end DATE,
  batch_number INTEGER DEFAULT 1,
  total_batches INTEGER DEFAULT 1,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient job claiming
CREATE INDEX idx_sync_queue_pending ON sync_queue(priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_sync_queue_client ON sync_queue(client_id, status);

-- Function to queue sync jobs for a single client
CREATE OR REPLACE FUNCTION public.queue_client_sync(p_client_id UUID, p_days_back INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  batch_size INTEGER := 90;
  num_batches INTEGER;
  i INTEGER;
  jobs_created INTEGER := 0;
BEGIN
  num_batches := CEIL(p_days_back::DECIMAL / batch_size);
  
  FOR i IN 1..num_batches LOOP
    INSERT INTO sync_queue (
      client_id, sync_type, priority, 
      date_range_start, date_range_end,
      batch_number, total_batches
    ) VALUES (
      p_client_id, 'full',
      CASE WHEN i = 1 THEN 1 ELSE 5 END,
      CURRENT_DATE - (i * batch_size),
      CURRENT_DATE - ((i - 1) * batch_size),
      i, num_batches
    );
    jobs_created := jobs_created + 1;
  END LOOP;
  
  RETURN jobs_created;
END;
$$;

-- Function to queue sync jobs for all configured clients
CREATE OR REPLACE FUNCTION public.queue_full_sync_all_clients(p_days_back INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  client_record RECORD;
  jobs_created INTEGER := 0;
  client_jobs INTEGER;
BEGIN
  FOR client_record IN 
    SELECT id FROM clients 
    WHERE status = 'active' 
      AND ghl_api_key IS NOT NULL 
      AND ghl_location_id IS NOT NULL
  LOOP
    SELECT queue_client_sync(client_record.id, p_days_back) INTO client_jobs;
    jobs_created := jobs_created + client_jobs;
  END LOOP;
  
  RETURN jobs_created;
END;
$$;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION public.get_sync_queue_stats()
RETURNS TABLE(
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  total_records_processed BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COALESCE(SUM(records_processed) FILTER (WHERE status = 'completed'), 0) as total_records_processed
  FROM sync_queue;
$$;