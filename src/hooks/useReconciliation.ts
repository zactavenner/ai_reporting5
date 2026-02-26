import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReconciliationRun {
  id: string;
  run_date: string;
  status: string;
  total_checks: number;
  mismatches_found: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ReconciliationItem {
  id: string;
  run_id: string;
  client_id: string;
  metric_name: string;
  source_name: string;
  dashboard_value: number | null;
  source_value: number | null;
  delta: number | null;
  delta_percent: number | null;
  is_mismatch: boolean;
  threshold_percent: number;
  notes: string | null;
  created_at: string;
}

export function useReconciliationRuns() {
  return useQuery({
    queryKey: ['reconciliation-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ReconciliationRun[];
    },
  });
}

export function useReconciliationItems(runId?: string) {
  return useQuery({
    queryKey: ['reconciliation-items', runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from('reconciliation_items')
        .select('*')
        .eq('run_id', runId)
        .order('is_mismatch', { ascending: false });
      if (error) throw error;
      return data as ReconciliationItem[];
    },
    enabled: !!runId,
  });
}

export function useRunReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/run-reconciliation`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      toast.success('Reconciliation completed');
    },
    onError: (e: any) => {
      toast.error('Reconciliation failed: ' + e.message);
    },
  });
}

export function useResolveReconciliationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from('reconciliation_items')
        .update({ is_mismatch: false, notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation-items'] });
      qc.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      toast.success('Item resolved');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });
}
