import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WeeklySync {
  id: string;
  client_id: string;
  sync_date: string;
  attendees: string | null;
  wins: string | null;
  numbers_notes: string | null;
  pipeline_notes: string | null;
  working_not_working: string | null;
  blockers: string | null;
  action_items: string | null;
  recap_email_sent: boolean;
  crm_updated: boolean;
  recording_url: string | null;
  recording_storage_path: string | null;
  meeting_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useWeeklySyncs(clientId?: string) {
  return useQuery({
    queryKey: ['weekly-syncs', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_syncs')
        .select('*')
        .eq('client_id', clientId)
        .order('sync_date', { ascending: false });
      if (error) throw error;
      return (data || []) as WeeklySync[];
    },
  });
}

export function useUpsertWeeklySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<WeeklySync> & { client_id: string }) => {
      const { data, error } = await (supabase as any)
        .from('weekly_syncs')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as WeeklySync;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['weekly-syncs', data.client_id] });
      toast.success('Weekly sync saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save sync'),
  });
}

export function useDeleteWeeklySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; client_id: string }) => {
      const { error } = await (supabase as any)
        .from('weekly_syncs')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['weekly-syncs', vars.client_id] });
      toast.success('Sync deleted');
    },
  });
}