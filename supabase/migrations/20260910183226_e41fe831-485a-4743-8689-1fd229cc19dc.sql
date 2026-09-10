-- 1. Offers: extend the canonical existing table
ALTER TABLE public.client_offers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_by text;

CREATE INDEX IF NOT EXISTS client_offers_client_status_idx
  ON public.client_offers (client_id, status);

-- At most one primary offer per client
CREATE UNIQUE INDEX IF NOT EXISTS client_offers_one_primary_idx
  ON public.client_offers (client_id) WHERE is_primary;

-- 2. Canonical ad-account roster (no secrets stored here)
CREATE TABLE IF NOT EXISTS public.client_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta',
  provider_account_id text NOT NULL,
  account_name text,
  business_id text,
  status text NOT NULL DEFAULT 'unknown',
  is_primary boolean NOT NULL DEFAULT false,
  rollup_enabled boolean NOT NULL DEFAULT true,
  currency text,
  timezone_name text,
  token_source text NOT NULL DEFAULT 'client',
  connection_state text NOT NULL DEFAULT 'saved',
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  campaigns_count integer,
  adsets_count integer,
  ads_total integer,
  ads_active integer,
  ads_paused integer,
  counts_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text
);

GRANT SELECT ON public.client_ad_accounts TO anon, authenticated;
GRANT ALL ON public.client_ad_accounts TO service_role;
ALTER TABLE public.client_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read ad account roster"
  ON public.client_ad_accounts FOR SELECT
  USING (true);

CREATE POLICY "Service role manages ad account roster"
  ON public.client_ad_accounts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Uniqueness inside a client, and no silent cross-client moves
CREATE UNIQUE INDEX IF NOT EXISTS client_ad_accounts_client_provider_acct_idx
  ON public.client_ad_accounts (client_id, provider, provider_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS client_ad_accounts_global_acct_idx
  ON public.client_ad_accounts (provider, provider_account_id)
  WHERE status <> 'disconnected';

CREATE UNIQUE INDEX IF NOT EXISTS client_ad_accounts_one_primary_idx
  ON public.client_ad_accounts (client_id, provider) WHERE is_primary;

CREATE TRIGGER client_ad_accounts_touch
  BEFORE UPDATE ON public.client_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Secret-safe audit trail
CREATE TABLE IF NOT EXISTS public.client_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  source text NOT NULL DEFAULT 'client_settings',
  actor_label text,
  actor_user_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_settings_audit TO anon, authenticated;
GRANT ALL ON public.client_settings_audit TO service_role;
ALTER TABLE public.client_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read settings audit"
  ON public.client_settings_audit FOR SELECT
  USING (true);

CREATE POLICY "Service role writes settings audit"
  ON public.client_settings_audit FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS client_settings_audit_client_time_idx
  ON public.client_settings_audit (client_id, created_at DESC);