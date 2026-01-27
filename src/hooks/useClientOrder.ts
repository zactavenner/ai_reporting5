import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useUpdateClientOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedClientIds: string[]) => {
      // Update each client's sort_order based on their position in the array
      const updates = orderedClientIds.map((id, index) => ({
        id,
        sort_order: index + 1,
      }));

      // Batch update all clients
      for (const update of updates) {
        const { error } = await supabase
          .from('clients')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);

        if (error) throw error;
      }

      return orderedClientIds;
    },
    onMutate: () => {
      // Show saving indicator
      toast.loading('Saving order...', { id: 'client-order-save' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Order saved', { id: 'client-order-save' });
    },
    onError: (error) => {
      console.error('Failed to update client order:', error);
      toast.error('Failed to save client order', { id: 'client-order-save' });
    },
  });
}
