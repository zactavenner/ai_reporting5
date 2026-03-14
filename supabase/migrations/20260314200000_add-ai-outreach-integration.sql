-- AI Outreach Integration: SendBlue (SMS/iMessage) + ElevenLabs (Voice)
-- Adds tables and configuration for AI-powered outbound lead nurturing

-- ============================================================
-- 1. AI Outreach Campaigns table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('sms', 'voice', 'multi_channel')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  -- SMS/iMessage settings (SendBlue)
  sms_template TEXT,
  sms_follow_up_templates JSONB DEFAULT '[]'::jsonb,
  sms_delay_minutes INTEGER DEFAULT 60,
  -- Voice call settings (ElevenLabs)
  voice_id TEXT, -- ElevenLabs voice ID
  voice_script TEXT, -- AI agent script/prompt
  voice_greeting TEXT, -- Opening greeting
  voice_model TEXT DEFAULT 'eleven_turbo_v2_5',
  max_call_duration_seconds INTEGER DEFAULT 300,
  -- Scheduling
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '18:00',
  send_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  timezone TEXT DEFAULT 'America/New_York',
  -- Targeting
  target_lead_statuses TEXT[] DEFAULT ARRAY['new'],
  target_lead_sources TEXT[],
  exclude_tags TEXT[],
  max_attempts_per_lead INTEGER DEFAULT 3,
  days_between_attempts INTEGER DEFAULT 1,
  -- Metrics
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_responded INTEGER DEFAULT 0,
  total_appointments INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. AI Outreach Messages table (tracks individual messages/calls)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ai_outreach_campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  -- Message details
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'imessage', 'voice')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'sending', 'sent', 'delivered', 'failed',
    'calling', 'answered', 'no_answer', 'busy', 'voicemail',
    'responded', 'appointment_booked'
  )),
  -- Content
  message_body TEXT,
  media_url TEXT,
  -- Contact info
  to_phone TEXT NOT NULL,
  from_phone TEXT,
  contact_name TEXT,
  -- SendBlue fields
  sendblue_message_id TEXT,
  sendblue_status TEXT,
  -- ElevenLabs fields
  elevenlabs_call_id TEXT,
  elevenlabs_conversation_id TEXT,
  call_duration_seconds INTEGER,
  call_recording_url TEXT,
  call_transcript TEXT,
  call_summary TEXT,
  -- Appointment booking
  appointment_booked BOOLEAN DEFAULT false,
  appointment_datetime TIMESTAMPTZ,
  appointment_notes TEXT,
  -- Tracking
  attempt_number INTEGER DEFAULT 1,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. AI Outreach Settings (per-client API config)
-- ============================================================
-- Add SendBlue and ElevenLabs fields to client_settings
DO $$
BEGIN
  -- SendBlue API
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'sendblue_api_key') THEN
    ALTER TABLE public.client_settings ADD COLUMN sendblue_api_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'sendblue_api_secret') THEN
    ALTER TABLE public.client_settings ADD COLUMN sendblue_api_secret TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'sendblue_phone_number') THEN
    ALTER TABLE public.client_settings ADD COLUMN sendblue_phone_number TEXT;
  END IF;
  -- ElevenLabs API
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'elevenlabs_api_key') THEN
    ALTER TABLE public.client_settings ADD COLUMN elevenlabs_api_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'elevenlabs_agent_id') THEN
    ALTER TABLE public.client_settings ADD COLUMN elevenlabs_agent_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'elevenlabs_phone_number') THEN
    ALTER TABLE public.client_settings ADD COLUMN elevenlabs_phone_number TEXT;
  END IF;
  -- AI outreach enabled flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_settings' AND column_name = 'ai_outreach_enabled') THEN
    ALTER TABLE public.client_settings ADD COLUMN ai_outreach_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 4. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_outreach_campaigns_client ON public.ai_outreach_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_campaigns_status ON public.ai_outreach_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_campaign ON public.ai_outreach_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_client ON public.ai_outreach_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_lead ON public.ai_outreach_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_status ON public.ai_outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_sent_at ON public.ai_outreach_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_sendblue_id ON public.ai_outreach_messages(sendblue_message_id);
CREATE INDEX IF NOT EXISTS idx_ai_outreach_messages_elevenlabs_call ON public.ai_outreach_messages(elevenlabs_call_id);

-- ============================================================
-- 5. RLS Policies
-- ============================================================
ALTER TABLE public.ai_outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_outreach_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage campaigns and messages
CREATE POLICY "ai_outreach_campaigns_select" ON public.ai_outreach_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_outreach_campaigns_insert" ON public.ai_outreach_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_outreach_campaigns_update" ON public.ai_outreach_campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ai_outreach_campaigns_delete" ON public.ai_outreach_campaigns FOR DELETE TO authenticated USING (true);

CREATE POLICY "ai_outreach_messages_select" ON public.ai_outreach_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_outreach_messages_insert" ON public.ai_outreach_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_outreach_messages_update" ON public.ai_outreach_messages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ai_outreach_messages_delete" ON public.ai_outreach_messages FOR DELETE TO authenticated USING (true);

-- Service role access for edge functions
CREATE POLICY "ai_outreach_campaigns_service" ON public.ai_outreach_campaigns FOR ALL TO service_role USING (true);
CREATE POLICY "ai_outreach_messages_service" ON public.ai_outreach_messages FOR ALL TO service_role USING (true);
