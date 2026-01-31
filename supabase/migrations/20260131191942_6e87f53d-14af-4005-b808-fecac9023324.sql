-- Phase 1: Database Schema Updates for GHL API-Only Sync

-- 1.1 Extend client_settings with calendar and pipeline mapping columns
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS tracked_calendar_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reconnect_calendar_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS funded_pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS funded_stage_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS committed_stage_ids TEXT[] DEFAULT '{}';

-- 1.2 Extend clients table with sync health tracking
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_ghl_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ghl_sync_status TEXT DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS ghl_sync_error TEXT;

-- 1.3 Extend calls table with GHL appointment tracking fields
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS ghl_appointment_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS appointment_status TEXT,
  ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;

-- Add unique constraint for appointment upsert (only if ghl_appointment_id is not null)
-- Using a partial unique index instead of constraint for flexibility
CREATE UNIQUE INDEX IF NOT EXISTS calls_client_ghl_appointment_unique 
  ON public.calls (client_id, ghl_appointment_id) 
  WHERE ghl_appointment_id IS NOT NULL;

-- Add index for faster appointment status queries
CREATE INDEX IF NOT EXISTS calls_appointment_status_idx ON public.calls (appointment_status);
CREATE INDEX IF NOT EXISTS calls_ghl_calendar_id_idx ON public.calls (ghl_calendar_id);
CREATE INDEX IF NOT EXISTS clients_ghl_sync_status_idx ON public.clients (ghl_sync_status);