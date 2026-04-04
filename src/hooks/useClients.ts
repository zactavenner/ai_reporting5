import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Client {
  id: string;
  name: string;
  status: string;
  public_token: string | null;
  business_manager_url: string | null;
  slug: string | null;
  industry: string | null;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  offer_description: string | null;
  product_url: string | null;
  product_images: string[];
  brand_colors: string[];
  brand_fonts: string[];
  ghl_location_id: string | null;
  ghl_api_key: string | null;
  ghl_sync_status: string | null;
  ghl_sync_error: string | null;
  last_ghl_sync_at: string | null;
  hubspot_portal_id: string | null;
  hubspot_access_token: string | null;
  hubspot_sync_status: string | null;
  hubspot_sync_error: string | null;
  last_hubspot_sync_at: string | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  media_buyer: string | null;
  account_manager: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, public_token, business_manager_url, slug, industry, ghl_location_id, ghl_api_key, ghl_sync_status, ghl_sync_error, last_ghl_sync_at, hubspot_portal_id, hubspot_access_token, hubspot_sync_status, hubspot_sync_error, last_hubspot_sync_at, meta_ad_account_id, meta_access_token, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('name');
      
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, public_token, business_manager_url, slug, industry, ghl_location_id, ghl_api_key, ghl_sync_status, ghl_sync_error, last_ghl_sync_at, hubspot_portal_id, hubspot_access_token, hubspot_sync_status, hubspot_sync_error, last_hubspot_sync_at, meta_ad_account_id, meta_access_token, sort_order, created_at, updated_at')
        .eq('id', clientId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Client | null;
    },
    enabled: !!clientId,
  });
}

export function useClientByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['client-by-token', token],
    queryFn: async () => {
      if (!token) {
        console.log('[useClientByToken] No token provided');
        return null;
      }
      
      console.log('[useClientByToken] Looking up client by token:', token);
      
      // First try to find by slug (friendly URL)
      let { data, error } = await supabase
        .from('clients')
        .select('id, name, status, public_token, business_manager_url, slug, industry, ghl_location_id, ghl_api_key, ghl_sync_status, ghl_sync_error, last_ghl_sync_at, hubspot_portal_id, hubspot_access_token, hubspot_sync_status, hubspot_sync_error, last_hubspot_sync_at, meta_ad_account_id, meta_access_token, sort_order, created_at, updated_at')
        .eq('slug', token)
        .maybeSingle();
      
      console.log('[useClientByToken] Slug lookup result:', { data, error: error?.message });
      
      // If not found by slug, try by public_token (legacy UUID-based URLs)
      if (!data && !error) {
        console.log('[useClientByToken] Trying public_token lookup');
        const result = await supabase
          .from('clients')
          .select('id, name, status, public_token, business_manager_url, slug, industry, ghl_location_id, ghl_api_key, ghl_sync_status, ghl_sync_error, last_ghl_sync_at, hubspot_portal_id, hubspot_access_token, hubspot_sync_status, hubspot_sync_error, last_hubspot_sync_at, meta_ad_account_id, meta_access_token, sort_order, created_at, updated_at')
          .eq('public_token', token)
          .maybeSingle();
        
        data = result.data;
        error = result.error;
        console.log('[useClientByToken] Token lookup result:', { data, error: error?.message });
      }
      
      if (error) {
        console.error('[useClientByToken] Error:', error);
        throw error;
      }
      
      console.log('[useClientByToken] Final client data:', data?.name || 'not found');
      return data as Client | null;
    },
    enabled: !!token,
    retry: 2,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>) => {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', data.id] });
    },
    onError: (error) => {
      console.error('Failed to update client:', error);
      toast.error('Failed to update client');
    },
  });
}
