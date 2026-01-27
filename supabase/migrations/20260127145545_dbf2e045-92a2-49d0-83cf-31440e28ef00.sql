-- Add API validation fields to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS call_connected BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add sync schedule settings to client_settings
ALTER TABLE public.client_settings
ADD COLUMN IF NOT EXISTS ghl_sync_contacts_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ghl_sync_calls_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ghl_sync_conversations_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ghl_last_contacts_sync TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_last_calls_sync TIMESTAMP WITH TIME ZONE DEFAULT NULL;