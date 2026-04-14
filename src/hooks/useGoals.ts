import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Goal {
  id: string;
  client_id: string;
  metric_key: string;
  metric_label: string | null;
  target_value: number;
  direction: 'above' | 'below';
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  period_start: string | null;
  period_end: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GoalSnapshot {
  id: string;
  goal_id: string;
  snapshot_date: string;
  current_value: number;
  target_value: number;
  progress_pct: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
}

export interface GoalWithProgress extends Goal {
  current_value?: number;
  progress_pct?: number;
  status?: 'on_track' | 'at_risk' | 'behind' | 'achieved';
  trend?: GoalSnapshot[];
}

export const METRIC_LABELS: Record<string, string> = {
  ad_spend: 'Ad Spend',
  leads: 'Leads',
  calls: 'Calls Booked',
  showed_calls: 'Calls Showed',
  commitments: 'Commitments',
  commitment_dollars: 'Commitment $',
  funded_investors: 'Funded Investors',
  funded_dollars: 'Funded $',
  cpl: 'Cost Per Lead',
  dollar_per_call: '$ Per Call',
  dollar_per_show: '$ Per Show',
  cpa: 'Cost Per Investor',
  cost_of_capital_pct: 'Cost of Capital %',
  show_pct: 'Show Rate %',
};

export function useGoals(clientId: string | undefined) {
  return useQuery({
    queryKey: ['goals', clientId],
    queryFn: async (): Promise<Goal[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Goal[];
    },
    enabled: !!clientId,
  });
}

export function useGoalSnapshots(goalId: string | undefined, limit = 30) {
  return useQuery({
    queryKey: ['goal-snapshots', goalId, limit],
    queryFn: async (): Promise<GoalSnapshot[]> => {
      if (!goalId) return [];
      const { data, error } = await supabase
        .from('goal_snapshots')
        .select('*')
        .eq('goal_id', goalId)
        .order('snapshot_date', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as GoalSnapshot[];
    },
    enabled: !!goalId,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goal: Omit<Goal, 'id' | 'created_at' | 'is_active'>) => {
      const { data, error } = await supabase
        .from('goals')
        .insert({ ...goal, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, updates }: { goalId: string; updates: Partial<Goal> }) => {
      const { error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useDeactivateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}
