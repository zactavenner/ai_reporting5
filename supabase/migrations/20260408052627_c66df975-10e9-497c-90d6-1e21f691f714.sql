
CREATE TABLE public.client_offer_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.client_offers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  uploaded_by TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_offer_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on client_offer_files"
  ON public.client_offer_files FOR SELECT USING (true);

CREATE POLICY "Allow public insert on client_offer_files"
  ON public.client_offer_files FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on client_offer_files"
  ON public.client_offer_files FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on client_offer_files"
  ON public.client_offer_files FOR DELETE USING (true);

CREATE INDEX idx_client_offer_files_offer_id ON public.client_offer_files(offer_id);
CREATE INDEX idx_client_offer_files_client_id ON public.client_offer_files(client_id);
