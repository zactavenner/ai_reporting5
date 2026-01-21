import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ClientSettings } from './useClientSettings';

export interface ClientMRRSettings {
  client_id: string;
  mrr: number;
  ad_spend_fee_threshold: number;
  ad_spend_fee_percent: number;
}

export function useAllClientMRR(clientIds: string[]) {
  return useQuery({
    queryKey: ['all-client-mrr', clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('client_settings')
        .select('client_id, mrr, ad_spend_fee_threshold, ad_spend_fee_percent')
        .in('client_id', clientIds);
      
      if (error) throw error;
      
      const result: Record<string, ClientMRRSettings> = {};
      
      for (const clientId of clientIds) {
        const settings = data?.find(s => s.client_id === clientId);
        result[clientId] = {
          client_id: clientId,
          mrr: settings?.mrr || 0,
          ad_spend_fee_threshold: settings?.ad_spend_fee_threshold || 30000,
          ad_spend_fee_percent: settings?.ad_spend_fee_percent || 10,
        };
      }
      
      return result;
    },
    enabled: clientIds.length > 0,
  });
}

export function useUpdateClientMRR() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: ClientMRRSettings) => {
      const { data, error } = await supabase
        .from('client_settings')
        .upsert({
          client_id: settings.client_id,
          mrr: settings.mrr,
          ad_spend_fee_threshold: settings.ad_spend_fee_threshold,
          ad_spend_fee_percent: settings.ad_spend_fee_percent,
        }, { onConflict: 'client_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-client-mrr'] });
      queryClient.invalidateQueries({ queryKey: ['client-settings'] });
    },
  });
}

// Calculate total MRR including ad spend fees
export function calculateClientRevenue(
  mrr: number,
  adSpend: number,
  feeThreshold: number,
  feePercent: number
): number {
  let total = mrr;
  if (adSpend > feeThreshold) {
    total += (adSpend - feeThreshold) * (feePercent / 100);
  }
  return total;
}

export function calculateAgencyMRR(
  mrrSettings: Record<string, ClientMRRSettings>,
  adSpends: Record<string, number>
): { totalMRR: number; projectedAnnual: number } {
  let totalMRR = 0;
  
  for (const [clientId, settings] of Object.entries(mrrSettings)) {
    const adSpend = adSpends[clientId] || 0;
    totalMRR += calculateClientRevenue(
      settings.mrr,
      adSpend,
      settings.ad_spend_fee_threshold,
      settings.ad_spend_fee_percent
    );
  }
  
  return {
    totalMRR,
    projectedAnnual: totalMRR * 12,
  };
}
