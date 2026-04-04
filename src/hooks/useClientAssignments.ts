import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClientAssignment {
  client_id: string;
  media_buyer: string | null;
  account_manager: string | null;
}

export function useClientAssignments() {
  return useQuery({
    queryKey: ['client-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_assignments')
        .select('client_id, media_buyer, account_manager');

      if (error) throw error;

      const map: Record<string, ClientAssignment> = {};
      for (const row of (data || []) as any[]) {
        map[row.client_id] = row as ClientAssignment;
      }
      return map;
    },
    staleTime: 30000,
  });
}

export function useUpdateClientAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, media_buyer, account_manager }: { id: string; media_buyer?: string | null; account_manager?: string | null }) => {
      const updates: Record<string, any> = { client_id: id };
      if (media_buyer !== undefined) updates.media_buyer = media_buyer;
      if (account_manager !== undefined) updates.account_manager = account_manager;

      const { error } = await supabase
        .from('client_assignments')
        .upsert(updates, { onConflict: 'client_id' });

      if (error) {
        console.error('client_assignments write failed:', error.message);
        throw error;
      }

      const clientUpdates: Record<string, any> = {};
      if (media_buyer !== undefined) clientUpdates.media_buyer = media_buyer;
      if (account_manager !== undefined) clientUpdates.account_manager = account_manager;

      if (Object.keys(clientUpdates).length > 0) {
        const { error: clientErr } = await supabase
          .from('clients')
          .update(clientUpdates)
          .eq('id', id);

        if (clientErr) {
          console.error('clients table MB/AM sync failed:', clientErr.message);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
