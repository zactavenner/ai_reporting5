import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface PerformanceRow {
  client_id: string;
  client_name: string;
  // Period identifier — date for daily, week_start for weekly, month_start for monthly
  period_start: string;
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  reconnect_calls: number;
  reconnect_showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_count: number;
  funded_dollars: number;
  // Derived (computed in view)
  cpl: number;
  dollar_per_call: number;
  dollar_per_show: number;
  show_pct: number;
  cpa: number;
  cost_of_capital_pct: number;
}

const VIEW_MAP: Record<Granularity, string> = {
  daily: 'v_client_performance_daily',
  weekly: 'v_client_performance_weekly',
  monthly: 'v_client_performance_monthly',
};

// Column that holds the period start date differs per view
const PERIOD_COL: Record<Granularity, string> = {
  daily: 'date_account_tz',
  weekly: 'week_start',
  monthly: 'month_start',
};

export function useClientPerformance(
  clientId: string | undefined,
  granularity: Granularity,
  year: number,
) {
  return useQuery({
    queryKey: ['client-performance', clientId, granularity, year],
    queryFn: async (): Promise<PerformanceRow[]> => {
      if (!clientId) return [];

      const view = VIEW_MAP[granularity];
      const periodCol = PERIOD_COL[granularity];
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data, error } = await supabase
        .from(view as any)
        .select('*')
        .eq('client_id', clientId)
        .gte(periodCol, startDate)
        .lte(periodCol, endDate)
        .order(periodCol, { ascending: true });

      if (error) {
        console.error(`Failed to query ${view}:`, error);
        return [];
      }

      return (data || []).map((row: any) => ({
        client_id: row.client_id,
        client_name: row.client_name,
        period_start: row[periodCol],
        ad_spend: Number(row.ad_spend) || 0,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        ctr: Number(row.ctr) || 0,
        leads: Number(row.leads) || 0,
        spam_leads: Number(row.spam_leads) || 0,
        calls: Number(row.calls) || 0,
        showed_calls: Number(row.showed_calls) || 0,
        reconnect_calls: Number(row.reconnect_calls) || 0,
        reconnect_showed: Number(row.reconnect_showed) || 0,
        commitments: Number(row.commitments) || 0,
        commitment_dollars: Number(row.commitment_dollars) || 0,
        funded_count: Number(row.funded_count) || 0,
        funded_dollars: Number(row.funded_dollars) || 0,
        cpl: Number(row.cpl) || 0,
        dollar_per_call: Number(row.dollar_per_call) || 0,
        dollar_per_show: Number(row.dollar_per_show) || 0,
        show_pct: Number(row.show_pct) || 0,
        cpa: Number(row.cpa) || 0,
        cost_of_capital_pct: Number(row.cost_of_capital_pct) || 0,
      }));
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export interface ReconciliationResult {
  metric: string;
  dailySum: number;
  weeklySum: number;
  monthlySum: number;
  dailyVsWeekly: boolean; // true = match
  weeklyVsMonthly: boolean;
}

/**
 * Runs reconciliation: compares sum-of-dailies vs weekly vs monthly for a year.
 * Purely client-side query against the 3 views — no edge function needed.
 */
export function useReconciliationCheck(clientId: string | undefined, year: number, enabled: boolean) {
  return useQuery({
    queryKey: ['reconciliation-check', clientId, year],
    queryFn: async (): Promise<ReconciliationResult[]> => {
      if (!clientId) return [];

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      // Fetch all three views in parallel
      const [dailyRes, weeklyRes, monthlyRes] = await Promise.all([
        supabase
          .from('v_client_performance_daily' as any)
          .select('ad_spend, leads, calls, showed_calls, reconnect_calls, reconnect_showed, commitments, commitment_dollars, funded_count, funded_dollars')
          .eq('client_id', clientId)
          .gte('date_account_tz', startDate)
          .lte('date_account_tz', endDate),
        supabase
          .from('v_client_performance_weekly' as any)
          .select('ad_spend, leads, calls, showed_calls, reconnect_calls, reconnect_showed, commitments, commitment_dollars, funded_count, funded_dollars')
          .eq('client_id', clientId)
          .gte('week_start', startDate)
          .lte('week_start', endDate),
        supabase
          .from('v_client_performance_monthly' as any)
          .select('ad_spend, leads, calls, showed_calls, reconnect_calls, reconnect_showed, commitments, commitment_dollars, funded_count, funded_dollars')
          .eq('client_id', clientId)
          .gte('month_start', startDate)
          .lte('month_start', endDate),
      ]);

      const sumField = (rows: any[], field: string) =>
        (rows || []).reduce((s: number, r: any) => s + (Number(r[field]) || 0), 0);

      const daily = dailyRes.data || [];
      const weekly = weeklyRes.data || [];
      const monthly = monthlyRes.data || [];

      const METRICS = [
        { key: 'ad_spend', label: 'Ad Spend' },
        { key: 'leads', label: 'Leads' },
        { key: 'calls', label: 'Calls' },
        { key: 'showed_calls', label: 'Showed' },
        { key: 'reconnect_calls', label: 'Reconnect Calls' },
        { key: 'reconnect_showed', label: 'Reconnect Showed' },
        { key: 'commitments', label: 'Commitments' },
        { key: 'commitment_dollars', label: 'Commitment $' },
        { key: 'funded_count', label: 'Funded #' },
        { key: 'funded_dollars', label: 'Funded $' },
      ];

      const TOLERANCE = 0.01; // allow rounding diff

      return METRICS.map(({ key, label }) => {
        const d = sumField(daily, key);
        const w = sumField(weekly, key);
        const m = sumField(monthly, key);
        return {
          metric: label,
          dailySum: Math.round(d * 100) / 100,
          weeklySum: Math.round(w * 100) / 100,
          monthlySum: Math.round(m * 100) / 100,
          dailyVsWeekly: Math.abs(d - w) <= TOLERANCE,
          weeklyVsMonthly: Math.abs(w - m) <= TOLERANCE,
        };
      });
    },
    enabled: !!clientId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Utility to invalidate all performance caches (call after "Sync now") */
export function useInvalidatePerformance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['client-performance'] });
    qc.invalidateQueries({ queryKey: ['reconciliation-check'] });
    qc.invalidateQueries({ queryKey: ['yearly-metrics'] });
    qc.invalidateQueries({ queryKey: ['daily-metrics'] });
  };
}
