-- Add contact fields to calls for denormalized display
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Create index for faster orphan linking
CREATE INDEX IF NOT EXISTS idx_calls_external_id ON calls(external_id);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id);