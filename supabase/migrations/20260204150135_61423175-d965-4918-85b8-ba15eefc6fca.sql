-- Phase 1: Add indexes for booked_at for efficient filtering
CREATE INDEX IF NOT EXISTS idx_calls_booked_at ON calls(booked_at);
CREATE INDEX IF NOT EXISTS idx_calls_client_booked ON calls(client_id, booked_at);
CREATE INDEX IF NOT EXISTS idx_leads_client_created ON leads(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_funded_investors_client_funded ON funded_investors(client_id, funded_at);

-- Phase 5: Fix existing data - set created_at = booked_at where they differ
-- This ensures historical calls show on the correct date
UPDATE calls 
SET created_at = booked_at 
WHERE booked_at IS NOT NULL 
  AND DATE(created_at) != DATE(booked_at);

-- Update any calls where booked_at is null but created_at has today's date
-- (these are likely synced calls that got the wrong timestamp)
UPDATE calls 
SET booked_at = created_at 
WHERE booked_at IS NULL;