import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncRun {
  id: string;
  client_id: string | null;
  source: 'meta' | 'ghl' | 'hubspot' | 'fathom' | 'manual' | 'reconciliation';
  function_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  rows_written: number;
  error_message: string | null;
  metadata: Record<string, any>;
}

/**
 * Fetches the most recent sync run per source for a given client.
 * Used to display freshness pills on the dashboard.
 */
export function useLatestSyncRuns(clientId: string | undefined) {
  return useQuery({
    queryKey: ['sync-runs-latest', clientId],
    queryFn: async (): Promise<Record<string, SyncRun>> => {
      if (!clientId) return {};

      // Get last run per source
      const { data, error } = await supabase
        .from('sync_runs')
        .select('*')
        .eq('client_id', clientId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Group by source, keep only the most recent per source
      const bySource: Record<string, SyncRun> = {};
      for (const run of (data || []) as SyncRun[]) {
        if (!bySource[run.source]) {
          bySource[run.source] = run;
        }
      }
      return bySource;
    },
    enabled: !!clientId,
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

/**
 * Triggers a manual sync for a specific client via daily-master-sync.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke('daily-master-sync', {
        body: { clientId, manual: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-runs-latest'] });
      queryClient.invalidateQueries({ queryKey: ['client-performance'] });
      queryClient.invalidateQueries({ queryKey: ['yearly-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    },
  });
}
