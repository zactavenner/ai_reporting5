import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdScript {
  id: string;
  client_id: string;
  brief_id: string | null;
  script_type: 'video' | 'static';
  title: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  duration_seconds: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useAdScripts(clientId?: string) {
  return useQuery({
    queryKey: ['ad-scripts', clientId],
    queryFn: async () => {
      let query = supabase
        .from('ad_scripts')
        .select('*')
        .order('created_at', { ascending: false });
      if (clientId) query = query.eq('client_id', clientId);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return (data || []) as AdScript[];
    },
  });
}

export function useAllAdScripts() {
  return useQuery({
    queryKey: ['all-ad-scripts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_scripts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as AdScript[];
    },
  });
}

export function useUpdateAdScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AdScript> & { id: string }) => {
      const { error } = await supabase
        .from('ad_scripts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-scripts'] });
      qc.invalidateQueries({ queryKey: ['all-ad-scripts'] });
      toast.success('Script updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAdScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_scripts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-scripts'] });
      qc.invalidateQueries({ queryKey: ['all-ad-scripts'] });
      toast.success('Script deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
