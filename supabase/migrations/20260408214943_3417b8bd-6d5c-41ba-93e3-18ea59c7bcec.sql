CREATE TABLE public.client_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.client_offers(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_assets_client ON public.client_assets(client_id);
CREATE INDEX idx_client_assets_offer ON public.client_assets(offer_id);
CREATE INDEX idx_client_assets_type ON public.client_assets(asset_type);

ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_assets" ON public.client_assets
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_client_assets_updated_at
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();