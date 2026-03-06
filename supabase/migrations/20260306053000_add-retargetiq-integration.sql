-- Add RetargetIQ integration fields to agency_settings
ALTER TABLE agency_settings
ADD COLUMN IF NOT EXISTS retargetiq_api_key text,
ADD COLUMN IF NOT EXISTS retargetiq_website text DEFAULT 'default';

-- Add RetargetIQ enrichment tracking to client_settings
ALTER TABLE client_settings
ADD COLUMN IF NOT EXISTS retargetiq_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS retargetiq_last_enrichment_at timestamptz;

-- Index for efficient lookup of unenriched leads
CREATE INDEX IF NOT EXISTS idx_leads_retargetiq_unenriched
ON leads (client_id, created_at DESC)
WHERE custom_fields IS NULL OR custom_fields->>'retargetiq_enriched_at' IS NULL;
