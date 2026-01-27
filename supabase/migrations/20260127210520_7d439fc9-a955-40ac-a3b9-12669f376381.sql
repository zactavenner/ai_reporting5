-- Feature 2: Add last_login_at to agency_members
ALTER TABLE public.agency_members
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Feature 2: Create member activity log table
CREATE TABLE public.member_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.agency_members(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on activity log
ALTER TABLE public.member_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for member_activity_log
CREATE POLICY "Public can view member_activity_log"
ON public.member_activity_log
FOR SELECT
USING (true);

CREATE POLICY "Public can insert member_activity_log"
ON public.member_activity_log
FOR INSERT
WITH CHECK (true);

-- Feature 3: Add public_link_password to client_settings
ALTER TABLE public.client_settings
ADD COLUMN IF NOT EXISTS public_link_password TEXT;