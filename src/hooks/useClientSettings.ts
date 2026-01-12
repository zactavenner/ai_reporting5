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
