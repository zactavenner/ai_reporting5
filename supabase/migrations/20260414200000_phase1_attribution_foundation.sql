-- Phase 1: Attribution Foundation (Hyros Core)
-- Touchpoint tracking, multi-model attribution engine, Meta Conversion API support

-- ============================================================
-- 1. lead_touchpoints: Track every interaction in the customer journey
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_touchpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN (
    'ad_click', 'page_view', 'form_submit', 'call_booked',
    'call_showed', 'commitment', 'funded', 'email_open',
    'sms_click', 'direct', 'organic', 'referral'
  )),
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  landing_page_url TEXT,
  referrer_url TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view lead_touchpoints"
  ON public.lead_touchpoints FOR SELECT USING (true);

CREATE POLICY "Service role full access to lead_touchpoints"
  ON public.lead_touchpoints FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_lead_touchpoints_lead ON public.lead_touchpoints(lead_id, timestamp);
CREATE INDEX idx_lead_touchpoints_client ON public.lead_touchpoints(client_id, timestamp DESC);
CREATE INDEX idx_lead_touchpoints_campaign ON public.lead_touchpoints(meta_campaign_id, timestamp)
  WHERE meta_campaign_id IS NOT NULL;
CREATE INDEX idx_lead_touchpoints_type ON public.lead_touchpoints(client_id, touchpoint_type, timestamp);

-- ============================================================
-- 2. attribution_results: Pre-computed attribution per model per entity
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attribution_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  attribution_model TEXT NOT NULL CHECK (attribution_model IN (
    'first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'
  )),
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  attributed_leads NUMERIC(12,4) DEFAULT 0,
  attributed_calls NUMERIC(12,4) DEFAULT 0,
  attributed_shows NUMERIC(12,4) DEFAULT 0,
  attributed_commitments NUMERIC(12,4) DEFAULT 0,
  attributed_commitment_dollars NUMERIC(14,2) DEFAULT 0,
  attributed_funded_count NUMERIC(12,4) DEFAULT 0,
  attributed_funded_dollars NUMERIC(14,2) DEFAULT 0,
  attributed_spend NUMERIC(14,2) DEFAULT 0,
  roas NUMERIC(10,4) DEFAULT 0,
  cost_of_capital_pct NUMERIC(8,4) DEFAULT 0,
  cpl NUMERIC(10,2) DEFAULT 0,
  cpa NUMERIC(10,2) DEFAULT 0,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, period_start, period_end, attribution_model, meta_campaign_id, meta_adset_id, meta_ad_id)
);

ALTER TABLE public.attribution_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view attribution_results"
  ON public.attribution_results FOR SELECT USING (true);

CREATE POLICY "Service role full access to attribution_results"
  ON public.attribution_results FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_attribution_results_client_period
  ON public.attribution_results(client_id, period_start, period_end, attribution_model);
CREATE INDEX idx_attribution_results_campaign
  ON public.attribution_results(client_id, meta_campaign_id, attribution_model)
  WHERE meta_campaign_id IS NOT NULL;

-- ============================================================
-- 3. Add Conversion API columns to client_settings
-- ============================================================
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_conversion_api_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_conversion_api_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_attribution_model TEXT DEFAULT 'last_touch'
    CHECK (default_attribution_model IN ('first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'));

-- ============================================================
-- 4. capi_events: Audit trail for Meta Conversion API
-- ============================================================
CREATE TABLE IF NOT EXISTS public.capi_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_source_url TEXT,
  user_data JSONB DEFAULT '{}'::jsonb,
  custom_data JSONB DEFAULT '{}'::jsonb,
  meta_response_code INTEGER,
  meta_response_body JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view capi_events"
  ON public.capi_events FOR SELECT USING (true);

CREATE POLICY "Service role full access to capi_events"
  ON public.capi_events FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_capi_events_client ON public.capi_events(client_id, sent_at DESC);
CREATE INDEX idx_capi_events_lead ON public.capi_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_capi_events_status ON public.capi_events(status) WHERE status != 'sent';

-- ============================================================
-- 5. View: v_attribution_by_campaign
-- ============================================================
CREATE OR REPLACE VIEW public.v_attribution_by_campaign AS
SELECT
  ar.client_id, ar.period_start, ar.period_end, ar.attribution_model,
  ar.meta_campaign_id, mc.name AS campaign_name, mc.status AS campaign_status, mc.objective AS campaign_objective,
  ar.attributed_leads, ar.attributed_calls, ar.attributed_shows,
  ar.attributed_commitments, ar.attributed_commitment_dollars,
  ar.attributed_funded_count, ar.attributed_funded_dollars,
  ar.attributed_spend, ar.roas, ar.cost_of_capital_pct, ar.cpl, ar.cpa, ar.computed_at
FROM public.attribution_results ar
LEFT JOIN public.meta_campaigns mc ON mc.client_id = ar.client_id AND mc.meta_campaign_id = ar.meta_campaign_id
WHERE ar.meta_campaign_id IS NOT NULL AND ar.meta_adset_id IS NULL AND ar.meta_ad_id IS NULL;
