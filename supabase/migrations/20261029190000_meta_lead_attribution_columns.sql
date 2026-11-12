-- Columns written only by backfill-meta-lead-attribution (sync-ghl-contacts never
-- touches them, so they survive re-syncs). ad_id / campaign_name / ad_set_name stay
-- the reporting columns; these keep the Meta ids and the audit trail.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_leadgen_id text,
  ADD COLUMN IF NOT EXISTS meta_form_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_name text,
  ADD COLUMN IF NOT EXISTS meta_attribution_source text,
  ADD COLUMN IF NOT EXISTS meta_attribution_status text,
  ADD COLUMN IF NOT EXISTS meta_attribution_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS leads_missing_ad_idx ON public.leads (client_id, created_at) WHERE ad_id IS NULL;
