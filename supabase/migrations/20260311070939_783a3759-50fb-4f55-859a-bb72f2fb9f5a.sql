ALTER TABLE public.client_settings 
ADD COLUMN IF NOT EXISTS fathom_api_keys jsonb DEFAULT '[]'::jsonb;