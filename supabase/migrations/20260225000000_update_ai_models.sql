
-- Update existing agency settings to use the new futuristic models as defaults
UPDATE public.agency_settings
SET
  selected_openai_model = 'gpt-5-nano',
  selected_gemini_model = 'gemini-3-flash',
  selected_grok_model = 'grok-4-fast-reasoning'
WHERE id IS NOT NULL;

-- Also update the column defaults if any exist (usually handled in the schema but good practice)
ALTER TABLE public.agency_settings ALTER COLUMN selected_openai_model SET DEFAULT 'gpt-5-nano';
ALTER TABLE public.agency_settings ALTER COLUMN selected_gemini_model SET DEFAULT 'gemini-3-flash';
ALTER TABLE public.agency_settings ALTER COLUMN selected_grok_model SET DEFAULT 'grok-4-fast-reasoning';
