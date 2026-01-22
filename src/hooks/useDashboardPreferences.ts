import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DashboardPreferences {
  id: string;
  client_id: string | null;
  preference_type: string;
  hidden_metrics: string[];
  custom_metrics: CustomMetric[];
  chart_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CustomMetric {
  id: string;
  key: string;
  label: string;
  formula: string;
  format: 'currency' | 'percent' | 'number';
}

// Fetch preferences for agency or client
export function useDashboardPreferences(clientId?: string, type: string = 'agency') {
  return useQuery({
    queryKey: ['dashboard-preferences', clientId, type],
    queryFn: async () => {
      let query = supabase.from('dashboard_preferences').select('*');
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      } else {
        query = query.is('client_id', null);
      }
      
      query = query.eq('preference_type', type);
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      
      // Return default preferences if none exist
      if (!data) {
        return {
          id: '',
          client_id: clientId || null,
          preference_type: type,
          hidden_metrics: [] as string[],
          custom_metrics: [] as CustomMetric[],
          chart_config: {} as Record<string, any>,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      
      return {
        ...data,
        custom_metrics: Array.isArray(data.custom_metrics) ? data.custom_metrics as unknown as CustomMetric[] : [],
        chart_config: (data.chart_config || {}) as Record<string, any>,
      };
    },
  });
}

// Update or create preferences
export function useUpdateDashboardPreferences() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ clientId, type, hiddenMetrics, customMetrics, chartConfig }: {
      clientId?: string;
      type?: string;
      hiddenMetrics?: string[];
      customMetrics?: CustomMetric[];
      chartConfig?: Record<string, any>;
    }) => {
      const preferenceType = type || 'agency';
      
      // Check if record exists
      let query = supabase.from('dashboard_preferences').select('id');
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      } else {
        query = query.is('client_id', null);
      }
      
      query = query.eq('preference_type', preferenceType);
      
      const { data: existing } = await query.maybeSingle();
      
      const updates: any = {};
      if (hiddenMetrics !== undefined) updates.hidden_metrics = hiddenMetrics;
      if (customMetrics !== undefined) updates.custom_metrics = customMetrics;
      if (chartConfig !== undefined) updates.chart_config = chartConfig;
      
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('dashboard_preferences')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Insert new
        const insertData: any = {
          client_id: clientId || null,
          preference_type: preferenceType,
          hidden_metrics: hiddenMetrics || [],
          custom_metrics: customMetrics || [],
          chart_config: chartConfig || {},
        };
        
        const { data, error } = await supabase
          .from('dashboard_preferences')
          .insert(insertData)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, { clientId, type }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-preferences', clientId, type || 'agency'] });
      toast.success('Dashboard preferences saved');
    },
    onError: (error: Error) => {
      toast.error('Failed to save preferences: ' + error.message);
    },
  });
}
