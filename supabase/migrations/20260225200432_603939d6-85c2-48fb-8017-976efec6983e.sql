ALTER TABLE public.client_funnel_steps 
ADD COLUMN step_type text NOT NULL DEFAULT 'url';