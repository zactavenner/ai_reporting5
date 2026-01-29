import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FunnelStepVariant {
  id: string;
  step_id: string;
  name: string;
  url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useFunnelStepVariants(stepId?: string) {
  return useQuery({
    queryKey: ['funnel-step-variants', stepId],
    queryFn: async () => {
      if (!stepId) return [];
      const { data, error } = await supabase
        .from('funnel_step_variants')
        .select('*')
        .eq('step_id', stepId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as FunnelStepVariant[];
    },
    enabled: !!stepId,
  });
}

export function useAllStepVariants(stepIds: string[]) {
  return useQuery({
    queryKey: ['funnel-step-variants-all', stepIds],
    queryFn: async () => {
      if (stepIds.length === 0) return [];
      const { data, error } = await supabase
        .from('funnel_step_variants')
        .select('*')
        .in('step_id', stepIds)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as FunnelStepVariant[];
    },
    enabled: stepIds.length > 0,
  });
}

export function useCreateFunnelStepVariant() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variant: { step_id: string; name: string; url: string; sort_order?: number }) => {
      const { data, error } = await supabase
        .from('funnel_step_variants')
        .insert(variant)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants', variables.step_id] });
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants-all'] });
      toast.success('Split test variant added');
    },
    onError: (error: any) => {
      toast.error('Failed to add variant: ' + error.message);
    },
  });
}

export function useUpdateFunnelStepVariant() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, stepId, updates }: { id: string; stepId: string; updates: Partial<FunnelStepVariant> }) => {
      const { data, error } = await supabase
        .from('funnel_step_variants')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return { data, stepId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants', result.stepId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants-all'] });
      toast.success('Variant updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update variant: ' + error.message);
    },
  });
}

export function useDeleteFunnelStepVariant() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, stepId }: { id: string; stepId: string }) => {
      const { error } = await supabase
        .from('funnel_step_variants')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { id, stepId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants', result.stepId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-step-variants-all'] });
      toast.success('Variant deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete variant: ' + error.message);
    },
  });
}
