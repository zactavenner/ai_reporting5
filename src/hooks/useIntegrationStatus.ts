import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IntegrationStatus {
  id: string;
  client_id: string | null;
  integration_name: string;
  is_connected: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  records_synced: number;
  error_count: number;
  last_error_message: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const INTEGRATIONS = ['meta_ads', 'ghl', 'hubspot', 'meetgeek', 'stripe'] as const;
export type IntegrationName = typeof INTEGRATIONS[number];

export function useIntegrationStatuses() {
  return useQuery({
    queryKey: ['integration-statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_status')
        .select('*')
        .order('integration_name');
      if (error) throw error;
      return (data || []) as IntegrationStatus[];
    },
  });
}

export function useTestIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ integration, clientId }: { integration: IntegrationName; clientId?: string }) => {
      const { data, error } = await supabase.functions.invoke('test-integration-connection', {
        body: { integration, client_id: clientId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integration-statuses'] });
      toast.success(data?.message || 'Connection test complete');
    },
    onError: (err: any) => {
      toast.error(`Test failed: ${err.message}`);
    },
  });
}

export function useTokenExpiryWarnings(statuses: IntegrationStatus[]) {
  const warnings: { integration: string; daysLeft: number }[] = [];
  for (const s of statuses) {
    if (s.token_expires_at) {
      const daysLeft = Math.ceil(
        (new Date(s.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 7 && daysLeft > 0) {
        warnings.push({ integration: s.integration_name, daysLeft });
      }
    }
  }
  return warnings;
}

export function getIntegrationDisplayName(name: string): string {
  const map: Record<string, string> = {
    meta_ads: 'Meta Ads',
    ghl: 'GoHighLevel',
    hubspot: 'HubSpot',
    meetgeek: 'MeetGeek',
    stripe: 'Stripe',
  };
  return map[name] || name;
}

export function getStatusColor(status: IntegrationStatus | undefined): 'green' | 'yellow' | 'red' {
  if (!status || !status.is_connected) return 'red';
  if (status.last_sync_status === 'failed') return 'red';
  if (!status.last_sync_at) return 'yellow';
  const hoursSince = (Date.now() - new Date(status.last_sync_at).getTime()) / (1000 * 60 * 60);
  if (hoursSince <= 24) return 'green';
  if (hoursSince <= 72) return 'yellow';
  return 'red';
}
