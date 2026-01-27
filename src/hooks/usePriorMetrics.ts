import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DailyMetric, FundedInvestor, aggregateMetrics, AggregatedMetrics } from './useMetrics';
import { differenceInDays, subDays, format } from 'date-fns';

/**
 * Hook to fetch metrics from the prior period (same duration as current period)
 * For example, if viewing Jan 15-21, prior period is Jan 8-14
 */
export function usePriorPeriodMetrics(
  clientId: string | undefined,
  startDate?: string,
  endDate?: string
): { data: AggregatedMetrics | null; isLoading: boolean } {
  const queryResult = useQuery({
    queryKey: ['prior-metrics', clientId, startDate, endDate],
    queryFn: async (): Promise<AggregatedMetrics | null> => {
      if (!startDate || !endDate) return null;

      // Calculate the duration of the current period
      const start = new Date(startDate);
      const end = new Date(endDate);
      const duration = differenceInDays(end, start) + 1;

      // Calculate prior period dates
      const priorEnd = subDays(start, 1);
      const priorStart = subDays(priorEnd, duration - 1);
      const priorStartStr = format(priorStart, 'yyyy-MM-dd');
      const priorEndStr = format(priorEnd, 'yyyy-MM-dd');

      // Fetch prior period daily metrics
      let metricsQuery = supabase
        .from('daily_metrics')
        .select('*')
        .gte('date', priorStartStr)
        .lte('date', priorEndStr);

      if (clientId) {
        metricsQuery = metricsQuery.eq('client_id', clientId);
      }

      const { data: dailyMetrics, error: metricsError } = await metricsQuery;
      if (metricsError) throw metricsError;

      // Fetch prior period funded investors
      const priorStartLocal = new Date(priorStartStr + 'T00:00:00');
      const priorEndLocal = new Date(priorEndStr + 'T23:59:59.999');

      let fundedQuery = supabase
        .from('funded_investors')
        .select('*')
        .gte('funded_at', priorStartLocal.toISOString())
        .lte('funded_at', priorEndLocal.toISOString());

      if (clientId) {
        fundedQuery = fundedQuery.eq('client_id', clientId);
      }

      const { data: fundedInvestors, error: fundedError } = await fundedQuery;
      if (fundedError) throw fundedError;

      // Aggregate the prior period metrics
      return aggregateMetrics(
        (dailyMetrics || []) as DailyMetric[],
        (fundedInvestors || []) as FundedInvestor[]
      );
    },
    enabled: !!startDate && !!endDate,
  });

  return {
    data: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
  };
}
