import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DailyReportClientDetail {
  client_id: string;
  client_name: string;
  leads: number;
  calls: number;
  showed: number;
  funded: number;
  funded_dollars: number;
  ad_spend: number;
  leads_delta: number;
  calls_delta: number;
  showed_delta: number;
  sync_status: 'healthy' | 'stale' | 'error' | 'not_configured';
  last_sync_at: string | null;
  discrepancies: Array<{
    metric: string;
    expected: number;
    actual: number;
    fixed: boolean;
  }>;
}

export interface DailyReport {
  id: string;
  report_date: string;
  status: 'pending' | 'completed' | 'partial' | 'failed';
  total_clients: number;
  total_leads: number;
  total_calls: number;
  total_showed: number;
  total_funded: number;
  total_ad_spend: number;
  total_funded_dollars: number;
  leads_delta: number;
  calls_delta: number;
  showed_delta: number;
  funded_delta: number;
  ad_spend_delta: number;
  discrepancies_found: number;
  discrepancies_fixed: number;
  clients_with_issues: number;
  client_details: DailyReportClientDetail[];
  healthy_clients: number;
  stale_clients: number;
  error_clients: number;
  not_configured_clients: number;
  slack_sent: boolean;
  slack_sent_at: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export function useLatestDailyReport() {
  return useQuery({
    queryKey: ['daily-reports', 'latest'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('daily_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        client_details: (data.client_details || []) as DailyReportClientDetail[],
      } as DailyReport;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

export function useDailyReports(limit = 7) {
  return useQuery({
    queryKey: ['daily-reports', 'list', limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('daily_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        client_details: (r.client_details || []) as DailyReportClientDetail[],
      })) as DailyReport[];
    },
  });
}

export function useGenerateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportDate?: string) => {
      const { data, error } = await supabase.functions.invoke('daily-close-report', {
        body: reportDate ? { reportDate } : {},
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-reports'] });
      toast.success('Daily report generated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to generate report: ' + error.message);
    },
  });
}
