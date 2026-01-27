import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DataDiscrepancy {
  id: string;
  client_id: string;
  detected_at: string;
  discrepancy_type: string;
  date_range_start: string;
  date_range_end: string;
  webhook_count: number;
  api_count: number;
  db_count: number;
  difference: number;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  resolution_notes: string | null;
  resolved_at: string | null;
  sync_log_id: string | null;
  clients?: { name: string } | null;
}

export function useDataDiscrepancies(clientId?: string) {
  return useQuery({
    queryKey: ['data-discrepancies', clientId],
    queryFn: async () => {
      let query = supabase
        .from('data_discrepancies')
        .select('*, clients(name)')
        .eq('status', 'open')
        .order('detected_at', { ascending: false });
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as DataDiscrepancy[];
    },
  });
}

export function useAllDiscrepancies(includeResolved: boolean = false) {
  return useQuery({
    queryKey: ['data-discrepancies', 'all', includeResolved],
    queryFn: async () => {
      let query = supabase
        .from('data_discrepancies')
        .select('*, clients(name)')
        .order('detected_at', { ascending: false })
        .limit(100);
      
      if (!includeResolved) {
        query = query.neq('status', 'resolved');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as DataDiscrepancy[];
    },
  });
}

export function useAcknowledgeDiscrepancy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('data_discrepancies')
        .update({ status: 'acknowledged' })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-discrepancies'] });
    },
  });
}

export function useResolveDiscrepancy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from('data_discrepancies')
        .update({ 
          status: 'resolved',
          resolution_notes: notes || null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-discrepancies'] });
    },
  });
}
