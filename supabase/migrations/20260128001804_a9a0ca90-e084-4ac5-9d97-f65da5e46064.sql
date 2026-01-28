-- Create ad_spend_reports table for granular time tracking
CREATE TABLE public.ad_spend_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL,
  platform TEXT DEFAULT 'meta',
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  campaign_name TEXT,
  ad_set_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_ad_spend_reports_client_date ON public.ad_spend_reports(client_id, reported_at);

-- Enable RLS
ALTER TABLE public.ad_spend_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Public can view ad_spend_reports" ON public.ad_spend_reports FOR SELECT USING (true);
CREATE POLICY "Public can insert ad_spend_reports" ON public.ad_spend_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update ad_spend_reports" ON public.ad_spend_reports FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete ad_spend_reports" ON public.ad_spend_reports FOR DELETE USING (true);