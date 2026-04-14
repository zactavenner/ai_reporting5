import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AttributionModel = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'position_based';

export interface AttributionResult {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  attribution_model: AttributionModel;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  campaign_name?: string;
  campaign_status?: string;
  attributed_leads: number;
  attributed_calls: number;
  attributed_shows: number;
  attributed_commitments: number;
  attributed_commitment_dollars: number;
  attributed_funded_count: number;
  attributed_funded_dollars: number;
  attributed_spend: number;
  roas: number;
  cost_of_capital_pct: number;
  cpl: number;
  cpa: number;
  computed_at: string;
}

export interface LeadTouchpoint {
  id: string;
  lead_id: string;
  client_id: string;
  touchpoint_type: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  landing_page_url: string | null;
  timestamp: string;
  metadata: Record<string, any>;
}

export function useAttributionByCampaign(
  clientId: string | undefined,
  model: AttributionModel = 'last_touch',
  periodStart?: string,
  periodEnd?: string,
) {
  return useQuery({
    queryKey: ['attribution-campaign', clientId, model, periodStart, periodEnd],
    queryFn: async (): Promise<AttributionResult[]> => {
      if (!clientId) return [];
      let query = supabase
        .from('v_attribution_by_campaign')
        .select('*')
        .eq('client_id', clientId)
        .eq('attribution_model', model)
        .order('attributed_funded_dollars', { ascending: false });
      if (periodStart) query = query.gte('period_start', periodStart);
      if (periodEnd) query = query.lte('period_end', periodEnd);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AttributionResult[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAttributionDrillDown(
  clientId: string | undefined,
  model: AttributionModel = 'last_touch',
  periodStart?: string,
  periodEnd?: string,
  campaignId?: string,
) {
  return useQuery({
    queryKey: ['attribution-drilldown', clientId, model, periodStart, periodEnd, campaignId],
    queryFn: async (): Promise<AttributionResult[]> => {
      if (!clientId) return [];
      let query = supabase
        .from('attribution_results')
        .select('*')
        .eq('client_id', clientId)
        .eq('attribution_model', model);
      if (periodStart) query = query.gte('period_start', periodStart);
      if (periodEnd) query = query.lte('period_end', periodEnd);
      if (campaignId) query = query.eq('meta_campaign_id', campaignId);
      query = query.order('attributed_funded_dollars', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AttributionResult[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadJourney(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-journey', leadId],
    queryFn: async (): Promise<LeadTouchpoint[]> => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('lead_touchpoints')
        .select('*')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return (data || []) as LeadTouchpoint[];
    },
    enabled: !!leadId,
  });
}

export function useComputeAttribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId, periodStart, periodEnd, models,
    }: {
      clientId?: string;
      periodStart?: string;
      periodEnd?: string;
      models?: AttributionModel[];
    }) => {
      const { data, error } = await supabase.functions.invoke('compute-attribution', {
        body: { clientId, periodStart, periodEnd, models },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attribution-campaign'] });
      queryClient.invalidateQueries({ queryKey: ['attribution-drilldown'] });
    },
  });
}
