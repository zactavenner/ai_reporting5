-- Sendblue texting lines (client sub-accounts)
CREATE TABLE public.sendblue_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'inbound_only',
  api_key_id TEXT,
  api_secret TEXT,
  provisioned_via TEXT NOT NULL DEFAULT 'manual',
  provider_line_id TEXT,
  status TEXT NOT NULL DEFAULT 'unverified',
  last_tested_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sendblue_lines_plan_type_check CHECK (plan_type IN ('inbound_only','outbound')),
  CONSTRAINT sendblue_lines_status_check CHECK (status IN ('unverified','connected','credentials_rejected','error','disabled')),
  CONSTRAINT sendblue_lines_phone_unique UNIQUE (phone_e164)
);
CREATE INDEX idx_sendblue_lines_client ON public.sendblue_lines(client_id);
GRANT ALL ON public.sendblue_lines TO service_role;
ALTER TABLE public.sendblue_lines ENABLE ROW LEVEL SECURITY;

-- Conversations (one per contact per line)
CREATE TABLE public.sendblue_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id UUID NOT NULL REFERENCES public.sendblue_lines(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  ghl_contact_id TEXT,
  match_state TEXT NOT NULL DEFAULT 'unmatched',
  match_checked_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sendblue_conversations_match_check CHECK (match_state IN ('matched','unmatched','ambiguous','no_crm')),
  CONSTRAINT sendblue_conversations_unique UNIQUE (line_id, contact_phone)
);
CREATE INDEX idx_sendblue_conv_client ON public.sendblue_conversations(client_id, last_message_at DESC);
GRANT ALL ON public.sendblue_conversations TO service_role;
ALTER TABLE public.sendblue_conversations ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.sendblue_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.sendblue_conversations(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES public.sendblue_lines(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  body TEXT,
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  provider_message_handle TEXT,
  idempotency_key TEXT,
  error_message TEXT,
  sent_by TEXT,
  campaign_id UUID,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sendblue_messages_direction_check CHECK (direction IN ('inbound','outbound')),
  CONSTRAINT sendblue_messages_provider_unique UNIQUE (provider_message_id),
  CONSTRAINT sendblue_messages_idem_unique UNIQUE (idempotency_key)
);
CREATE INDEX idx_sendblue_messages_conv ON public.sendblue_messages(conversation_id, created_at DESC);
CREATE INDEX idx_sendblue_messages_client ON public.sendblue_messages(client_id, created_at DESC);
GRANT ALL ON public.sendblue_messages TO service_role;
ALTER TABLE public.sendblue_messages ENABLE ROW LEVEL SECURITY;

-- CRM mirror ledger: at most one internal note per message
CREATE TABLE public.sendblue_ghl_mirrors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.sendblue_messages(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  ghl_note_id TEXT,
  marker TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  skipped_reason TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sendblue_mirrors_status_check CHECK (status IN ('pending','processing','mirrored','skipped','failed')),
  CONSTRAINT sendblue_mirrors_message_unique UNIQUE (message_id)
);
CREATE INDEX idx_sendblue_mirrors_pending ON public.sendblue_ghl_mirrors(status, created_at);
GRANT ALL ON public.sendblue_ghl_mirrors TO service_role;
ALTER TABLE public.sendblue_ghl_mirrors ENABLE ROW LEVEL SECURITY;

-- Opt-outs
CREATE TABLE public.sendblue_optouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id UUID REFERENCES public.sendblue_lines(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'keyword',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sendblue_optouts_unique UNIQUE (line_id, phone_e164)
);
GRANT ALL ON public.sendblue_optouts TO service_role;
ALTER TABLE public.sendblue_optouts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sendblue_lines_updated_at BEFORE UPDATE ON public.sendblue_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sendblue_conversations_updated_at BEFORE UPDATE ON public.sendblue_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sendblue_messages_updated_at BEFORE UPDATE ON public.sendblue_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sendblue_ghl_mirrors_updated_at BEFORE UPDATE ON public.sendblue_ghl_mirrors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();