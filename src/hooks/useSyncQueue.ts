import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useSyncQueue() {
  const queryClient = useQueryClient();

  const queueClientSync = useMutation({
    mutationFn: async ({ clientId, daysBack = 365 }: { clientId: string; daysBack?: number }) => {
      const { data, error } = await supabase.rpc('queue_client_sync', {
        p_client_id: clientId,
        p_days_back: daysBack
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (jobsCreated, { clientId }) => {
      toast.success(`Queued ${jobsCreated} sync jobs`);
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
    },
    onError: (error) => {
      toast.error(`Failed to queue sync: ${error.message}`);
    }
  });

  const queueAllClientsSync = useMutation({
    mutationFn: async (daysBack: number = 365) => {
      const { data, error } = await supabase.rpc('queue_full_sync_all_clients', {
        p_days_back: daysBack
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (jobsCreated) => {
      toast.success(`Queued ${jobsCreated} sync jobs for all clients`);
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
    },
    onError: (error) => {
      toast.error(`Failed to queue all clients: ${error.message}`);
    }
  });

  const triggerWorker = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-queue-worker');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.message === 'No pending jobs') {
        toast.info('No pending jobs in queue');
      } else {
        toast.success(`Processed: ${data.records_processed} records for ${data.client_name}`);
      }
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (error) => {
      toast.error(`Worker failed: ${error.message}`);
    }
  });

  return {
    queueClientSync,
    queueAllClientsSync,
    triggerWorker
  };
}
