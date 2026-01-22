-- Add daily_ad_spend_target column for either/or input
ALTER TABLE public.client_settings 
ADD COLUMN IF NOT EXISTS daily_ad_spend_target numeric DEFAULT NULL;