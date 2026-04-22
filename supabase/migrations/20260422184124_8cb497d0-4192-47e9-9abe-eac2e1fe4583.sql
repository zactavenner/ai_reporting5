
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS metrics_sheet_id text,
  ADD COLUMN IF NOT EXISTS metrics_sheet_gid text,
  ADD COLUMN IF NOT EXISTS metrics_sheet_range text,
  ADD COLUMN IF NOT EXISTS metrics_source_default text DEFAULT 'database',
  ADD COLUMN IF NOT EXISTS metrics_sheet_mapping jsonb;

UPDATE public.client_settings
SET metrics_sheet_id = '10ETeNuyi0dxHjCMyymrros1jDKyH6HKMwP4QVSBpZU0',
    metrics_sheet_gid = '825433383',
    metrics_source_default = 'sheet'
WHERE client_id = 'f414feaa-c68e-4e68-b35d-fcefb8ff86e1';

INSERT INTO public.client_settings (client_id, metrics_sheet_id, metrics_sheet_gid, metrics_source_default)
SELECT 'f414feaa-c68e-4e68-b35d-fcefb8ff86e1', '10ETeNuyi0dxHjCMyymrros1jDKyH6HKMwP4QVSBpZU0', '825433383', 'sheet'
WHERE NOT EXISTS (SELECT 1 FROM public.client_settings WHERE client_id = 'f414feaa-c68e-4e68-b35d-fcefb8ff86e1');
