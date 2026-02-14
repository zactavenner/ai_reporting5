import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useMetaCampaigns(clientId: string | undefined) {
  return useQuery({
    queryKey: ['meta-campaigns', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('meta_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .order('spend', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });
}

export function useMetaAdSets(clientId: string | undefined, campaignId?: string) {
  return useQuery({
    queryKey: ['meta-ad-sets', clientId, campaignId],
    queryFn: async () => {
      if (!clientId) return [];
      let query = supabase
        .from('meta_ad_sets')
        .select('*')
        .eq('client_id', clientId)
        .order('spend', { ascending: false });
      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });
}

export function useMetaAds(clientId: string | undefined, adSetId?: string) {
  return useQuery({
    queryKey: ['meta-ads', clientId, adSetId],
    queryFn: async () => {
      if (!clientId) return [];
      let query = supabase
        .from('meta_ads')
        .select('*')
        .eq('client_id', clientId)
        .order('spend', { ascending: false });
      if (adSetId) {
        query = query.eq('ad_set_id', adSetId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });
}

export function useSyncMetaAds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke('sync-meta-ads', {
        body: { clientId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      return data;
    },
    onSuccess: (data, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['meta-campaigns', clientId] });
      queryClient.invalidateQueries({ queryKey: ['meta-ad-sets', clientId] });
      queryClient.invalidateQueries({ queryKey: ['meta-ads', clientId] });
      toast.success(`Synced ${data.campaigns} campaigns, ${data.adSets} ad sets, ${data.ads} ads`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to sync Meta Ads');
    },
  });
}
