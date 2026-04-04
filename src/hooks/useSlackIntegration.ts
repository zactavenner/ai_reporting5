import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SlackChannelMapping {
  id: string;
  client_id: string;
  channel_id: string;
  channel_name: string | null;
  channel_type: string;
  monitor_messages: boolean;
  auto_create_tasks: boolean;
  created_at: string;
  updated_at: string;
}

export function useSlackChannelMappings(clientId: string | undefined) {
  return useQuery({
    queryKey: ['slack-channel-mappings', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('slack_channel_mappings' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at');
      if (error) throw error;
      return data as unknown as SlackChannelMapping[];
    },
    enabled: !!clientId,
  });
}

export function useAddSlackChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mapping: Partial<SlackChannelMapping> & { client_id: string; channel_id: string }) => {
      const { data, error } = await supabase
        .from('slack_channel_mappings' as any)
        .insert(mapping as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['slack-channel-mappings', vars.client_id] });
      toast.success('Slack channel added');
    },
    onError: (err: any) => {
      if (err?.code === '23505') {
        toast.error('This channel is already mapped to this client');
      } else {
        toast.error('Failed to add Slack channel');
      }
    },
  });
}

export function useUpdateSlackChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id, ...updates }: { id: string; client_id: string } & Partial<SlackChannelMapping>) => {
      const { error } = await supabase
        .from('slack_channel_mappings' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['slack-channel-mappings', vars.client_id] });
    },
  });
}

export function useRemoveSlackChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      const { error } = await supabase
        .from('slack_channel_mappings' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['slack-channel-mappings', vars.client_id] });
      toast.success('Slack channel removed');
    },
    onError: () => {
      toast.error('Failed to remove channel');
    },
  });
}

export function useSlackActivityLog(clientId: string | undefined) {
  return useQuery({
    queryKey: ['slack-activity-log', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('slack_activity_log' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });
}

export function useSyncSlackChannels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ client_id, channel_id }: { client_id?: string; channel_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('slack-sync-channels', {
        body: { client_id, channel_id, limit: 100, auto_create_tasks: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['slack-activity-log', vars.client_id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`Synced ${data?.total_messages || 0} messages, created ${data?.tasks_created || 0} tasks`);
    },
    onError: (err: any) => {
      toast.error(`Slack sync failed: ${err.message}`);
    },
  });
}

export function useSendSlackMessage() {
  return useMutation({
    mutationFn: async ({ channel, text, thread_ts }: { channel: string; text: string; thread_ts?: string }) => {
      const { data, error } = await supabase.functions.invoke('slack-send-message', {
        body: { channel, text, thread_ts },
      });
      if (error) throw error;
      return data;
    },
    onError: (err: any) => {
      toast.error(`Failed to send message: ${err.message}`);
    },
  });
}
