import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TimelineEvent {
  id: string;
  client_id: string;
  lead_id: string | null;
  ghl_contact_id: string;
  event_type: string;
  event_subtype: string | null;
  title: string | null;
  body: string | null;
  event_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useContactTimeline(clientId: string | undefined, ghlContactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-timeline', clientId, ghlContactId],
    queryFn: async () => {
      if (!clientId || !ghlContactId) return [];
      
      const { data, error } = await supabase
        .from('contact_timeline_events')
        .select('*')
        .eq('client_id', clientId)
        .eq('ghl_contact_id', ghlContactId)
        .order('event_at', { ascending: false });

      if (error) throw error;
      return data as TimelineEvent[];
    },
    enabled: !!clientId && !!ghlContactId,
  });
}

export function useSyncContactTimeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, ghlContactId }: { clientId: string; ghlContactId: string }) => {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId, 
          mode: 'deep_sync',
          contactId: ghlContactId,
          contact_id: ghlContactId // Support both parameter names
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Deep sync failed');
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success(`Contact timeline synced: ${data?.events_count || 0} events`);
      queryClient.invalidateQueries({ 
        queryKey: ['contact-timeline', variables.clientId, variables.ghlContactId] 
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to sync timeline: ${error.message}`);
    },
  });
}
