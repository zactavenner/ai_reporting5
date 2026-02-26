
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;
