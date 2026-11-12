-- Per-client Meta SYSTEM USER token. Only AES-256-GCM ciphertext is stored
-- (key lives in the edge runtime, never in the database). Service-role only.
CREATE TABLE public.client_meta_system_tokens (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  token_ciphertext text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  system_user_id text,
  system_user_name text,
  token_last4 text,
  scopes text[],
  expires_at timestamptz,
  data_access_expires_at timestamptz,
  ad_account_access jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invalid','needs_attention')),
  last_error text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  saved_by text,
  last_validated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.client_meta_system_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_meta_system_tokens TO service_role;
ALTER TABLE public.client_meta_system_tokens ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER client_meta_system_tokens_updated_at
  BEFORE UPDATE ON public.client_meta_system_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Which token each Meta pull used (never the token itself).
CREATE TABLE public.meta_token_usage_log (
  id bigserial PRIMARY KEY,
  client_id uuid,
  function_name text NOT NULL,
  source text NOT NULL CHECK (source IN ('system_user_vault','system_user_legacy_column','client','master','none')),
  fallback_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.meta_token_usage_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.meta_token_usage_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.meta_token_usage_log_id_seq TO service_role;
ALTER TABLE public.meta_token_usage_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_token_usage_log_client_created_idx ON public.meta_token_usage_log (client_id, created_at DESC);
