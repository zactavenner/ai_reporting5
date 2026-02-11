import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DailyMetric } from './useMetrics';

/**
 * Hook to fetch all metrics for a specific year (not filtered by date range)
 */
export function useYearlyMetrics(clientId: string | undefined, year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  return useQuery({
    queryKey: ['yearly-metrics', clientId, year],
    queryFn: async () => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from('daily_metrics')
        .select('*')
        .eq('client_id', clientId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data as DailyMetric[];
    },
    enabled: !!clientId,
  });
}

/**
 * Hook to update a daily metric record
 */
export function useUpdateDailyMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      date,
      updates,
    }: {
      clientId: string;
      date: string;
      updates: Partial<Omit<DailyMetric, 'id' | 'client_id' | 'date'>>;
    }) => {
      // First check if record exists
      const { data: existing } = await supabase
        .from('daily_metrics')
        .select('id')
        .eq('client_id', clientId)
        .eq('date', date)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('daily_metrics')
          .update(updates)
          .eq('client_id', clientId)
          .eq('date', date)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('daily_metrics')
          .insert({
            client_id: clientId,
            date,
            ...updates,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yearly-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    },
  });
}

/**
 * Hook to create or update a monthly aggregate (creates daily records for the month)
 */
export function useUpsertMonthlyMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      year,
      month,
      updates,
    }: {
      clientId: string;
      year: number;
      month: number;
      updates: Partial<Omit<DailyMetric, 'id' | 'client_id' | 'date'>>;
    }) => {
      // Use first day of month as representative date
      const date = `${year}-${String(month).padStart(2, '0')}-01`;

      // Check if any record exists for this month
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const endOfMonth = `${year}-${String(month).padStart(2, '0')}-31`;

      const { data: allMonthRecords } = await supabase
        .from('daily_metrics')
        .select('*')
        .eq('client_id', clientId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .order('date', { ascending: true });

      const existing = allMonthRecords && allMonthRecords.length > 0 ? allMonthRecords[0] : null;

      if (existing) {
        // Calculate adjusted updates: desired total minus sum of OTHER records
        const adjustedUpdates = { ...updates };
        const otherRecords = allMonthRecords!.filter(r => r.id !== existing.id);
        
        for (const [field, desiredValue] of Object.entries(updates)) {
          if (desiredValue === undefined || desiredValue === null) continue;
          const otherSum = otherRecords.reduce((sum, r) => sum + Number((r as any)[field] || 0), 0);
          (adjustedUpdates as any)[field] = Number(desiredValue) - otherSum;
        }

        const { data, error } = await supabase
          .from('daily_metrics')
          .update(adjustedUpdates)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new record for first day of month
        const { data, error } = await supabase
          .from('daily_metrics')
          .insert({
            client_id: clientId,
            date,
            ...updates,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yearly-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    },
  });
}
