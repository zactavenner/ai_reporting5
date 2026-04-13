
-- Create storage bucket for client uploads (10GB+ files)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-uploads', 'client-uploads', true, 10737418240)
ON CONFLICT (id) DO NOTHING;

-- Create a table to track client uploads with metadata
CREATE TABLE IF NOT EXISTS public.client_file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  storage_path TEXT,
  uploaded_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_file_uploads ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public upload portal)
CREATE POLICY "Anyone can upload files" ON public.client_file_uploads
  FOR INSERT WITH CHECK (true);

-- Anyone can view files for a client
CREATE POLICY "Anyone can view client files" ON public.client_file_uploads
  FOR SELECT USING (true);

-- Anyone can delete (for cleanup)
CREATE POLICY "Authenticated users can delete files" ON public.client_file_uploads
  FOR DELETE USING (true);

-- Storage policies: allow public uploads and reads
CREATE POLICY "Public upload to client-uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-uploads');

CREATE POLICY "Public read from client-uploads" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-uploads');

CREATE POLICY "Public delete from client-uploads" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-uploads');
