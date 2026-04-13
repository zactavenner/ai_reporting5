import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgencyWeeklyRow {
  week_start: string;
  ad_spend: number;
  funded_dollars: number;
  cost_of_capital_pct: number;
  client_count: number;
}

/**
 * Fetches the last N weeks of agency-level performance from v_agency_performance_weekly.
 * Used for the Cost of Capital sparkline in AgencyStatsBar.
 */
export function useAgencyWeeklyPerformance(weeks = 12) {
  return useQuery({
    queryKey: ['agency-performance-weekly', weeks],
    queryFn: async (): Promise<AgencyWeeklyRow[]> => {
      const { data, error } = await supabase
        .from('v_agency_performance_weekly' as any)
        .select('week_start, ad_spend, funded_dollars, cost_of_capital_pct, client_count')
        .order('week_start', { ascending: false })
        .limit(weeks);

      if (error) {
        console.error('Failed to query v_agency_performance_weekly:', error);
        return [];
      }

      return (data || [])
        .map((row: any) => ({
          week_start: row.week_start,
          ad_spend: Number(row.ad_spend) || 0,
          funded_dollars: Number(row.funded_dollars) || 0,
          cost_of_capital_pct: Number(row.cost_of_capital_pct) || 0,
          client_count: Number(row.client_count) || 0,
        }))
        .reverse(); // chronological order for sparkline
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Computes current agency-level Cost of Capital from the weekly data.
 */
export function useAgencyCostOfCapital() {
  const { data: weeklyData = [], isLoading } = useAgencyWeeklyPerformance(12);

  const totalAdSpend = weeklyData.reduce((s, w) => s + w.ad_spend, 0);
  const totalFunded = weeklyData.reduce((s, w) => s + w.funded_dollars, 0);
  const costOfCapital = totalFunded > 0 ? (totalAdSpend / totalFunded) * 100 : 0;
  const sparkline = weeklyData.map(w => w.cost_of_capital_pct);

  return { costOfCapital, sparkline, isLoading };
}
