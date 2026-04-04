import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OnboardingTask {
  id: string;
  client_id: string;
  category: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export function useOnboardingTasks(clientId: string | undefined) {
  return useQuery({
    queryKey: ['onboarding-tasks', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_onboarding_tasks' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true });
      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
          return [];
        }
        throw error;
      }
      return data as unknown as OnboardingTask[];
    },
    enabled: !!clientId,
  });
}

export function useToggleOnboardingTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed, clientId }: { id: string; completed: boolean; clientId: string }) => {
      const { error } = await supabase
        .from('client_onboarding_tasks' as any)
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      return { id, completed, clientId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks', data.clientId] });
    },
  });
}

export function useSeedOnboardingTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, tasks }: { clientId: string; tasks: { category: string; title: string; sort_order: number }[] }) => {
      const rows = tasks.map(t => ({
        client_id: clientId,
        category: t.category,
        title: t.title,
        sort_order: t.sort_order,
        completed: false,
      }));
      const { error } = await supabase
        .from('client_onboarding_tasks' as any)
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks', vars.clientId] });
    },
  });
}
