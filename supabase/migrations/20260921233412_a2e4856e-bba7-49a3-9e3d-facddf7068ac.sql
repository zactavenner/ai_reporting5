CREATE TABLE public.sendblue_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','connected','credentials_rejected','error','disabled')),
  verified_at TIMESTAMP WITH TIME ZONE,
  verify_endpoint TEXT,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sendblue_accounts_key_unique ON public.sendblue_accounts (api_key_id);
CREATE INDEX sendblue_accounts_client_idx ON public.sendblue_accounts (client_id);

GRANT ALL ON public.sendblue_accounts TO service_role;
ALTER TABLE public.sendblue_accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sendblue_accounts_updated_at
BEFORE UPDATE ON public.sendblue_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sendblue_lines
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.sendblue_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB,
  ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_delivered_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS sendblue_lines_account_idx ON public.sendblue_lines (account_id);