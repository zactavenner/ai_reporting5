-- Enable realtime for contact_timeline_events table
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_timeline_events;

-- Add last_timeline_sync_at to clients table for tracking timeline sync freshness
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS last_timeline_sync_at TIMESTAMPTZ;

-- Add index for efficient timeline queries by contact
CREATE INDEX IF NOT EXISTS idx_timeline_events_contact 
ON public.contact_timeline_events(client_id, ghl_contact_id, event_at DESC);

-- Add index for efficient timeline queries by lead
CREATE INDEX IF NOT EXISTS idx_timeline_events_lead 
ON public.contact_timeline_events(lead_id, event_at DESC) 
WHERE lead_id IS NOT NULL;