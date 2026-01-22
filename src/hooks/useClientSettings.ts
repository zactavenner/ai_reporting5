import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClientSettings {
  id: string;
  client_id: string;
  cpl_threshold_yellow: number;
  cpl_threshold_red: number;
  cost_per_call_threshold_yellow: number;
  cost_per_call_threshold_red: number;
  cost_per_show_threshold_yellow: number;
  cost_per_show_threshold_red: number;
  cost_per_investor_threshold_yellow: number;
  cost_per_investor_threshold_red: number;
  cost_of_capital_threshold_yellow: number;
  cost_of_capital_threshold_red: number;
  funded_investor_label: string;
  mrr: number;
  ad_spend_fee_threshold: number;
  ad_spend_fee_percent: number;
  monthly_ad_spend_target: number;
  daily_ad_spend_target: number | null;
  total_raise_amount: number;
}

export interface KPIThresholds {
  costPerLead?: { yellow: number; red: number };
  costPerCall?: { yellow: number; red: number };
  costPerShow?: { yellow: number; red: number };
  costPerInvestor?: { yellow: number; red: number };
  costOfCapital?: { yellow: number; red: number };
}

const defaultSettings: Omit<ClientSettings, 'id' | 'client_id'> = {
  cpl_threshold_yellow: 50,
  cpl_threshold_red: 100,
  cost_per_call_threshold_yellow: 100,
  cost_per_call_threshold_red: 200,
  cost_per_show_threshold_yellow: 150,
  cost_per_show_threshold_red: 300,
  cost_per_investor_threshold_yellow: 500,
  cost_per_investor_threshold_red: 1000,
  cost_of_capital_threshold_yellow: 5,
  cost_of_capital_threshold_red: 10,
  funded_investor_label: 'Funded Investors',
  mrr: 0,
  ad_spend_fee_threshold: 30000,
  ad_spend_fee_percent: 10,
  monthly_ad_spend_target: 0,
  daily_ad_spend_target: null,
  total_raise_amount: 0,
};

export function useClientSettings(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-settings', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('client_settings')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      
      if (error) throw error;
      
      // Return data with defaults if not found
      if (!data) {
        return {
          client_id: clientId,
          ...defaultSettings,
        } as ClientSettings;
      }
      
      return data as ClientSettings;
    },
    enabled: !!clientId,
  });
}

export function useUpdateClientSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: Partial<ClientSettings> & { client_id: string }) => {
      const { data, error } = await supabase
        .from('client_settings')
        .upsert(settings, { onConflict: 'client_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-settings', data.client_id] });
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['all-client-mrr'] });
    },
  });
}

export function getThresholdsFromSettings(settings: ClientSettings | null | undefined): KPIThresholds {
  if (!settings) return {};
  
  return {
    costPerLead: {
      yellow: settings.cpl_threshold_yellow,
      red: settings.cpl_threshold_red,
    },
    costPerCall: {
      yellow: settings.cost_per_call_threshold_yellow,
      red: settings.cost_per_call_threshold_red,
    },
    costPerShow: {
      yellow: settings.cost_per_show_threshold_yellow,
      red: settings.cost_per_show_threshold_red,
    },
    costPerInvestor: {
      yellow: settings.cost_per_investor_threshold_yellow,
      red: settings.cost_per_investor_threshold_red,
    },
    costOfCapital: {
      yellow: settings.cost_of_capital_threshold_yellow,
      red: settings.cost_of_capital_threshold_red,
    },
  };
}

// Helper to get effective daily target (either from daily input or calculated from monthly)
export function getEffectiveDailyTarget(settings: ClientSettings | null | undefined): number {
  if (!settings) return 0;
  if (settings.daily_ad_spend_target && settings.daily_ad_spend_target > 0) {
    return settings.daily_ad_spend_target;
  }
  // Calculate from monthly (use current month's days)
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (settings.monthly_ad_spend_target || 0) / daysInMonth;
}

// Helper to get effective monthly target (either from monthly input or calculated from daily)
export function getEffectiveMonthlyTarget(settings: ClientSettings | null | undefined): number {
  if (!settings) return 0;
  if (settings.monthly_ad_spend_target && settings.monthly_ad_spend_target > 0) {
    return settings.monthly_ad_spend_target;
  }
  // Calculate from daily (use current month's days)
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (settings.daily_ad_spend_target || 0) * daysInMonth;
}
