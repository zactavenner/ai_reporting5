-- Create spam_blacklist table to track blacklisted email domains/IPs
CREATE TABLE public.spam_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'email_domain', -- 'email_domain', 'ip_address'
  value TEXT NOT NULL,
  reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on type+value
ALTER TABLE public.spam_blacklist ADD CONSTRAINT spam_blacklist_unique UNIQUE (type, value);

-- Enable RLS
ALTER TABLE public.spam_blacklist ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view spam_blacklist" 
ON public.spam_blacklist 
FOR SELECT 
USING (true);

CREATE POLICY "Public can insert spam_blacklist" 
ON public.spam_blacklist 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can delete spam_blacklist" 
ON public.spam_blacklist 
FOR DELETE 
USING (true);

-- Insert default spam domains
INSERT INTO public.spam_blacklist (type, value, reason) VALUES
  ('email_domain', 'dayrep.com', 'Known spam domain'),
  ('email_domain', 'jourrapide.com', 'Known spam domain'),
  ('email_domain', 'armyspy.com', 'Known spam domain'),
  ('email_domain', 'rhyta.com', 'Known spam domain'),
  ('email_domain', 'teleworm.us', 'Known spam domain')
ON CONFLICT DO NOTHING;