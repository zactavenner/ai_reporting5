-- Split the AI Studio reference libraries into 'reference' (new viral finds with
-- view counts + instructions) and 'template' (proven converters), for both
-- videos and images. Existing rows stay 'template'. Columns only — no new
-- tables, so existing GRANTs and RLS policies already cover them.
ALTER TABLE public.ai_studio_reference_videos
  ADD COLUMN IF NOT EXISTS library text NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS view_count bigint,
  ADD COLUMN IF NOT EXISTS instructions text;

ALTER TABLE public.ai_studio_reference_images
  ADD COLUMN IF NOT EXISTS library text NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS view_count bigint,
  ADD COLUMN IF NOT EXISTS instructions text;

ALTER TABLE public.ai_studio_reference_videos
  DROP CONSTRAINT IF EXISTS ai_studio_reference_videos_library_check;
ALTER TABLE public.ai_studio_reference_videos
  ADD CONSTRAINT ai_studio_reference_videos_library_check
  CHECK (library IN ('reference', 'template'));

ALTER TABLE public.ai_studio_reference_images
  DROP CONSTRAINT IF EXISTS ai_studio_reference_images_library_check;
ALTER TABLE public.ai_studio_reference_images
  ADD CONSTRAINT ai_studio_reference_images_library_check
  CHECK (library IN ('reference', 'template'));

CREATE INDEX IF NOT EXISTS idx_ai_studio_ref_videos_library ON public.ai_studio_reference_videos(library);
CREATE INDEX IF NOT EXISTS idx_ai_studio_ref_images_library ON public.ai_studio_reference_images(library);