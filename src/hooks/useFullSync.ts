import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FullSyncResult {
  success: boolean;
  summary?: {
    clients_synced: number;
    total_contacts_created: number;
    total_contacts_updated: number;
    total_funded_from_tags: number;
    total_calls_enriched: number;
    total_timelines_synced: number;
  };
  error?: string;
}

export function useFullSync() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (clientId: string): Promise<FullSyncResult> => {
      setProgress('Starting full sync (365 days + timeline)...');
      
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId,
          mode: 'full_sync',
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Full sync failed');
      
      return data as FullSyncResult;
    },
    onSuccess: (data, clientId) => {
      const summary = data.summary;
      toast.success(
        `Full sync complete: ${summary?.total_contacts_created || 0} created, ${summary?.total_contacts_updated || 0} updated, ${summary?.total_timelines_synced || 0} timelines synced`
      );
      
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
      queryClient.invalidateQueries({ queryKey: ['contact-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['sync-health', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      setProgress(null);
    },
    onError: (error: Error) => {
      toast.error(`Full sync failed: ${error.message}`);
      setProgress(null);
    },
  });

  return {
    runFullSync: mutation.mutate,
    isRunning: mutation.isPending,
    progress,
    result: mutation.data,
  };
}

/**
 * Hook for syncing just the timeline (conversation history) for a specific contact
 */
export function useSyncContactTimeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, ghlContactId }: { clientId: string; ghlContactId: string }) => {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId, 
          mode: 'deep_sync',
          contactId: ghlContactId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Timeline sync failed');
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success(`Timeline synced: ${data?.events_count || 0} events`);
      queryClient.invalidateQueries({ 
        queryKey: ['contact-timeline', variables.clientId, variables.ghlContactId] 
      });
    },
    onError: (error: Error) => {
      toast.error(`Timeline sync failed: ${error.message}`);
    },
  });
}
