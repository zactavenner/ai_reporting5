import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DailyMetric, FundedInvestor, aggregateMetrics, AggregatedMetrics } from './useMetrics';
import { differenceInDays, subDays, format } from 'date-fns';
import { fetchAllRows } from '@/lib/fetchAllRows';

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

      // Fetch prior period daily metrics (paginated)
      const dailyMetrics = await fetchAllRows<DailyMetric>((sb) => {
        let query = sb
          .from('daily_metrics')
          .select('*')
          .gte('date', priorStartStr)
          .lte('date', priorEndStr);

        if (clientId) {
          query = query.eq('client_id', clientId);
        }

        return query;
      });

      // Fetch prior period funded investors (paginated)
      const priorStartLocal = new Date(priorStartStr + 'T00:00:00');
      const priorEndNext = new Date(priorEndStr + 'T00:00:00');
      priorEndNext.setDate(priorEndNext.getDate() + 1);

      const fundedInvestors = await fetchAllRows<FundedInvestor>((sb) => {
        let query = sb
          .from('funded_investors')
          .select('*')
          .gte('funded_at', priorStartLocal.toISOString())
          .lt('funded_at', priorEndNext.toISOString());

        if (clientId) {
          query = query.eq('client_id', clientId);
        }

        return query;
      });

      // Aggregate the prior period metrics
      return aggregateMetrics(dailyMetrics, fundedInvestors);
    },
    enabled: !!startDate && !!endDate,
  });

  return {
    data: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
  };
}
