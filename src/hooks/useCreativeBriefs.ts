import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CreativeBrief {
  id: string;
  client_id: string;
  client_name: string;
  status: string;
  source: string;
  winning_ad_summary: any;
  hook_patterns: string[];
  offer_angles: string[];
  recommended_variations: any;
  full_brief_json: any;
  created_at: string;
  updated_at: string;
}

export function useCreativeBriefs() {
  return useQuery({
    queryKey: ['creative-briefs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creative_briefs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CreativeBrief[];
    },
  });
}

export function usePendingBriefsCount() {
  return useQuery({
    queryKey: ['creative-briefs-pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('creative_briefs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
  });
}

export function useGenerateBrief() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { client_id: string; client_name: string; top_ads: any[] }) => {
      const { data, error } = await supabase.functions.invoke('generate-brief', {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CreativeBrief;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['creative-briefs-pending-count'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to generate brief');
    },
  });
}

export function useUpdateBriefStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('creative_briefs')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['creative-briefs-pending-count'] });
      toast.success('Status updated');
    },
  });
}
