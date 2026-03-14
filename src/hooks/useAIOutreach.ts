import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================
export interface AIOutreachCampaign {
  id: string;
  client_id: string;
  name: string;
  campaign_type: 'sms' | 'voice' | 'multi_channel';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  sms_template: string | null;
  sms_follow_up_templates: any[];
  sms_delay_minutes: number;
  voice_id: string | null;
  voice_script: string | null;
  voice_greeting: string | null;
  voice_model: string;
  max_call_duration_seconds: number;
  send_window_start: string;
  send_window_end: string;
  send_days: string[];
  timezone: string;
  target_lead_statuses: string[];
  target_lead_sources: string[] | null;
  exclude_tags: string[] | null;
  max_attempts_per_lead: number;
  days_between_attempts: number;
  total_sent: number;
  total_delivered: number;
  total_responded: number;
  total_appointments: number;
  created_at: string;
  updated_at: string;
}

export interface AIOutreachMessage {
  id: string;
  campaign_id: string;
  client_id: string;
  lead_id: string | null;
  channel: 'sms' | 'imessage' | 'voice';
  direction: 'outbound' | 'inbound';
  status: string;
  message_body: string | null;
  to_phone: string;
  from_phone: string | null;
  contact_name: string | null;
  sendblue_message_id: string | null;
  elevenlabs_call_id: string | null;
  elevenlabs_conversation_id: string | null;
  call_duration_seconds: number | null;
  call_transcript: string | null;
  call_summary: string | null;
  appointment_booked: boolean;
  appointment_datetime: string | null;
  attempt_number: number;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AIOutreachSettings {
  sendblue_api_key: string | null;
  sendblue_api_secret: string | null;
  sendblue_phone_number: string | null;
  elevenlabs_api_key: string | null;
  elevenlabs_agent_id: string | null;
  elevenlabs_phone_number: string | null;
  ai_outreach_enabled: boolean;
}

export interface OutreachStats {
  total_campaigns: number;
  active_campaigns: number;
  total_messages_sent: number;
  total_appointments_booked: number;
  recent_sms_count: number;
  recent_voice_count: number;
  recent_appointments: number;
  conversion_rate: string;
}

// ============================================================
// Hooks
// ============================================================

/** Fetch AI outreach campaigns for a client */
export function useOutreachCampaigns(clientId?: string) {
  return useQuery({
    queryKey: ['outreach-campaigns', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('ai_outreach_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AIOutreachCampaign[];
    },
    enabled: !!clientId,
  });
}

/** Fetch recent outreach messages for a client */
export function useOutreachMessages(clientId?: string, campaignId?: string) {
  return useQuery({
    queryKey: ['outreach-messages', clientId, campaignId],
    queryFn: async () => {
      if (!clientId) return [];
      let query = supabase
        .from('ai_outreach_messages')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AIOutreachMessage[];
    },
    enabled: !!clientId,
  });
}

/** Fetch AI outreach settings for a client */
export function useOutreachSettings(clientId?: string) {
  return useQuery({
    queryKey: ['outreach-settings', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('client_settings')
        .select('sendblue_api_key, sendblue_api_secret, sendblue_phone_number, elevenlabs_api_key, elevenlabs_agent_id, elevenlabs_phone_number, ai_outreach_enabled')
        .eq('client_id', clientId)
        .single();
      if (error) throw error;
      return data as AIOutreachSettings;
    },
    enabled: !!clientId,
  });
}

/** Get outreach stats via the orchestrator */
export function useOutreachStats(clientId?: string) {
  return useQuery({
    queryKey: ['outreach-stats', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase.functions.invoke('ai-outreach-orchestrator', {
        body: { action: 'get_stats', client_id: clientId },
      });
      if (error) throw error;
      return data as { stats: OutreachStats; campaigns: AIOutreachCampaign[]; recent_activity: AIOutreachMessage[] };
    },
    enabled: !!clientId,
  });
}

/** Save AI outreach settings */
export function useSaveOutreachSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, settings }: { clientId: string; settings: Partial<AIOutreachSettings> }) => {
      const { error } = await supabase
        .from('client_settings')
        .update(settings)
        .eq('client_id', clientId);
      if (error) throw error;
    },
    onSuccess: (_, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-settings', clientId] });
      toast.success('AI outreach settings saved');
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });
}

/** Create an outreach campaign */
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: Partial<AIOutreachCampaign> & { client_id: string; name: string; campaign_type: string }) => {
      const { data, error } = await supabase
        .from('ai_outreach_campaigns')
        .insert(campaign)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-campaigns', data.client_id] });
      toast.success('Campaign created');
    },
    onError: (error) => {
      toast.error(`Failed to create campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });
}

/** Update campaign status */
export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: string }) => {
      const { error } = await supabase
        .from('ai_outreach_campaigns')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-campaigns'] });
      toast.success('Campaign status updated');
    },
  });
}

/** Send a single SMS message */
export function useSendSMS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, toPhone, messageBody, leadId, campaignId }: {
      clientId: string;
      toPhone: string;
      messageBody: string;
      leadId?: string;
      campaignId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('sendblue-outreach', {
        body: {
          action: 'send_message',
          client_id: clientId,
          to_phone: toPhone,
          message_body: messageBody,
          lead_id: leadId,
          campaign_id: campaignId,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to send message');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-messages'] });
      toast.success('Message sent');
    },
    onError: (error) => {
      toast.error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });
}

/** Initiate a voice call */
export function useInitiateCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, toPhone, contactName, leadId, campaignId }: {
      clientId: string;
      toPhone: string;
      contactName?: string;
      leadId?: string;
      campaignId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-outreach', {
        body: {
          action: 'initiate_call',
          client_id: clientId,
          to_phone: toPhone,
          contact_name: contactName,
          lead_id: leadId,
          campaign_id: campaignId,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to initiate call');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-messages'] });
      toast.success('Call initiated');
    },
    onError: (error) => {
      toast.error(`Failed to initiate call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });
}

/** Test SendBlue connection */
export function useTestSendBlue() {
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke('sendblue-outreach', {
        body: { action: 'test_connection', client_id: clientId },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Test ElevenLabs connection */
export function useTestElevenLabs() {
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-outreach', {
        body: { action: 'test_connection', client_id: clientId },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** List ElevenLabs voices */
export function useElevenLabsVoices(clientId?: string) {
  return useQuery({
    queryKey: ['elevenlabs-voices', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.functions.invoke('elevenlabs-outreach', {
        body: { action: 'list_voices', client_id: clientId },
      });
      if (error) throw error;
      return data.voices || [];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/** List ElevenLabs agents */
export function useElevenLabsAgents(clientId?: string) {
  return useQuery({
    queryKey: ['elevenlabs-agents', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.functions.invoke('elevenlabs-outreach', {
        body: { action: 'list_agents', client_id: clientId },
      });
      if (error) throw error;
      return data.agents || [];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}
