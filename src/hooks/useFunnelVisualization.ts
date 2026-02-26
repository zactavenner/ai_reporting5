import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FunnelStage {
  id: string;
  client_id: string;
  stage_name: string;
  stage_order: number;
  stage_url: string | null;
  conversion_count: number;
  created_at: string;
  updated_at: string;
}

export interface FunnelSnapshot {
  id: string;
  client_id: string;
  stage_id: string;
  snapshot_date: string;
  count: number;
  conversion_rate: number | null;
  created_at: string;
}

const DEFAULT_STAGES = [
  { stage_name: 'Landing Page Visits', stage_order: 0 },
  { stage_name: 'Lead Form Submissions', stage_order: 1 },
  { stage_name: 'Applications', stage_order: 2 },
  { stage_name: 'Calls Booked', stage_order: 3 },
  { stage_name: 'Showed', stage_order: 4 },
  { stage_name: 'Funded', stage_order: 5 },
];

export function useFunnelStages(clientId?: string) {
  return useQuery({
    queryKey: ['funnel-stages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('funnel_stages')
        .select('*')
        .eq('client_id', clientId)
        .order('stage_order', { ascending: true });
      if (error) throw error;
      return data as FunnelStage[];
    },
    enabled: !!clientId,
  });
}

export function useFunnelSnapshots(clientId?: string) {
  return useQuery({
    queryKey: ['funnel-snapshots', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('funnel_snapshots')
        .select('*')
        .eq('client_id', clientId)
        .order('snapshot_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as FunnelSnapshot[];
    },
    enabled: !!clientId,
  });
}

export function useInitDefaultStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const rows = DEFAULT_STAGES.map(s => ({
        client_id: clientId,
        stage_name: s.stage_name,
        stage_order: s.stage_order,
        conversion_count: 0,
      }));
      const { data, error } = await supabase
        .from('funnel_stages')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-stages', clientId] });
      toast.success('Default funnel stages created');
    },
    onError: (err: any) => {
      toast.error('Failed to create default stages: ' + err.message);
    },
  });
}

export function useUpdateFunnelStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, clientId, updates }: { id: string; clientId: string; updates: Partial<FunnelStage> }) => {
      const { error } = await supabase
        .from('funnel_stages')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      return { clientId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-stages', result.clientId] });
    },
    onError: (err: any) => {
      toast.error('Failed to update stage: ' + err.message);
    },
  });
}

export function useCreateFunnelStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: { client_id: string; stage_name: string; stage_order: number; stage_url?: string }) => {
      const { data, error } = await supabase
        .from('funnel_stages')
        .insert(stage)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-stages', data.client_id] });
      toast.success('Stage added');
    },
    onError: (err: any) => {
      toast.error('Failed to add stage: ' + err.message);
    },
  });
}

export function useDeleteFunnelStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from('funnel_stages')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { clientId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-stages', result.clientId] });
      toast.success('Stage deleted');
    },
    onError: (err: any) => {
      toast.error('Failed to delete stage: ' + err.message);
    },
  });
}

export function useSaveFunnelSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, stages }: { clientId: string; stages: FunnelStage[] }) => {
      const today = new Date().toISOString().split('T')[0];
      const rows = stages.map((s, i) => ({
        client_id: clientId,
        stage_id: s.id,
        snapshot_date: today,
        count: s.conversion_count,
        conversion_rate: i === 0 ? 100 : (stages[0].conversion_count > 0
          ? Number(((s.conversion_count / stages[0].conversion_count) * 100).toFixed(2))
          : 0),
      }));

      // Upsert by deleting today's snapshots first
      await supabase
        .from('funnel_snapshots')
        .delete()
        .eq('client_id', clientId)
        .eq('snapshot_date', today);

      const { error } = await supabase
        .from('funnel_snapshots')
        .insert(rows);
      if (error) throw error;
      return { clientId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-snapshots', result.clientId] });
      toast.success('Snapshot saved');
    },
    onError: (err: any) => {
      toast.error('Failed to save snapshot: ' + err.message);
    },
  });
}
