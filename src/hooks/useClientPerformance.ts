import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface PerformanceRow {
  client_id: string;
  client_name?: string;
  // Date fields vary by granularity
  report_date?: string;    // daily
  week_start?: string;     // weekly
  month_start?: string;    // monthly
  year?: number;
  month?: number;
  iso_week?: number;

  // Core metrics
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  reconnect_calls: number;
  reconnect_showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_investors: number;
  funded_dollars: number;

  // Derived (computed in DB view)
  cpl: number;
  dollar_per_call: number;
  dollar_per_show: number;
  show_pct: number;
  cpa: number;
  cost_of_capital_pct: number;

  days_in_period?: number;
}

const VIEW_MAP: Record<Granularity, string> = {
  daily: 'v_client_performance_daily',
  weekly: 'v_client_performance_weekly',
  monthly: 'v_client_performance_monthly',
};

/**
 * Fetches client performance data from the source-of-truth DB views.
 * Automatically selects the right view based on granularity.
 * Results are cached for 5 minutes; invalidated on "Sync now".
 */
export function useClientPerformance(
  clientId: string | undefined,
  granularity: Granularity,
  year?: number
) {
  const view = VIEW_MAP[granularity];

  return useQuery({
    queryKey: ['client-performance', clientId, granularity, year],
    queryFn: async (): Promise<PerformanceRow[]> => {
      if (!clientId) return [];

      let query = supabase
        .from(view)
        .select('*')
        .eq('client_id', clientId);

      // Date filtering per granularity
      if (year) {
        if (granularity === 'daily') {
          query = query
            .gte('report_date', `${year}-01-01`)
            .lte('report_date', `${year}-12-31`);
        } else if (granularity === 'weekly') {
          query = query.eq('iso_year', year);
        } else if (granularity === 'monthly') {
          query = query.eq('year', year);
        }
      }

      // Order
      if (granularity === 'daily') {
        query = query.order('report_date', { ascending: false });
      } else if (granularity === 'weekly') {
        query = query.order('week_start', { ascending: false });
      } else {
        query = query.order('month_start', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PerformanceRow[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetches agency-level performance (portfolio rollup across all clients).
 * Uses the v_agency_performance_monthly view which weights by spend, not simple average.
 */
export function useAgencyPerformance(year?: number) {
  return useQuery({
    queryKey: ['agency-performance', year],
    queryFn: async () => {
      let query = supabase
        .from('v_agency_performance_monthly')
        .select('*');

      if (year) {
        query = query.eq('year', year);
      }

      query = query.order('month_start', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to invalidate performance caches after a sync.
 * Call this from the "Sync now" button handler.
 */
export function useInvalidatePerformance() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['client-performance'] });
    queryClient.invalidateQueries({ queryKey: ['agency-performance'] });
    queryClient.invalidateQueries({ queryKey: ['yearly-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
  };
}
