
CREATE TABLE public.top_performer_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  file_type TEXT NOT NULL DEFAULT 'image',
  mime_type TEXT,
  size_bytes BIGINT,
  thumbnail_url TEXT,
  transcript TEXT,
  transcription_status TEXT DEFAULT 'pending',
  notes TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.top_performer_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view top performer uploads"
  ON public.top_performer_uploads FOR SELECT USING (true);
CREATE POLICY "Anyone can insert top performer uploads"
  ON public.top_performer_uploads FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update top performer uploads"
  ON public.top_performer_uploads FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete top performer uploads"
  ON public.top_performer_uploads FOR DELETE USING (true);

CREATE INDEX idx_top_performer_uploads_created_at ON public.top_performer_uploads(created_at DESC);
