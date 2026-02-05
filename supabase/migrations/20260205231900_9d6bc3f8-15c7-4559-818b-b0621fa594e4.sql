-- Table to track outbound events that need to be pushed TO GHL
CREATE TABLE public.sync_outbound_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'call')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  contact_identifier TEXT NOT NULL,
  ghl_contact_id TEXT,
  event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}',
  synced_to_ghl BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, external_id)
);

-- Enable RLS
ALTER TABLE public.sync_outbound_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access on sync_outbound_events"
ON public.sync_outbound_events
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for efficient querying of unsynced events
CREATE INDEX idx_sync_outbound_events_unsynced 
ON public.sync_outbound_events (client_id, synced_to_ghl, created_at)
WHERE synced_to_ghl = false;

-- Index for idempotency checks
CREATE INDEX idx_sync_outbound_events_external_id 
ON public.sync_outbound_events (client_id, external_id);

-- Comment for documentation
COMMENT ON TABLE public.sync_outbound_events IS 'Stores events (SMS, Email, Calls) to be pushed TO GHL via hourly sync';