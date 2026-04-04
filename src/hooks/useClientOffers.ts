import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientOffer {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  offer_type: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useClientOffers(clientId?: string) {
  return useQuery({
    queryKey: ['client-offers', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_offers' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ClientOffer[];
    },
    enabled: !!clientId,
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offer: {
      client_id: string;
      title: string;
      description?: string;
      file_url?: string;
      file_name?: string;
      file_type?: string;
      file_size_bytes?: number;
      offer_type?: string;
      uploaded_by?: string;
    }) => {
      const { data, error } = await supabase
        .from('client_offers' as any)
        .insert(offer as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['client-offers', vars.client_id] });
      toast.success('Offer/file added');
    },
    onError: (err: Error) => {
      toast.error(`Failed to add: ${err.message}`);
    },
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId, updates }: { id: string; clientId: string; updates: Partial<{
      title: string;
      description: string | null;
      offer_type: string;
      file_url: string | null;
      file_name: string | null;
      file_type: string | null;
      file_size_bytes: number | null;
    }> }) => {
      const { error } = await supabase
        .from('client_offers' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.invalidateQueries({ queryKey: ['client-offers', clientId] });
      toast.success('Updated successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from('client_offers' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.invalidateQueries({ queryKey: ['client-offers', clientId] });
      toast.success('Removed');
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete: ${err.message}`);
    },
  });
}

export async function uploadOfferFile(clientId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop();
  const path = `${clientId}/${Date.now()}-${file.name}`;
  
  const { error } = await supabase.storage
    .from('client-offers')
    .upload(path, file, { upsert: true });
  
  if (error) throw error;
  
  const { data: urlData } = supabase.storage
    .from('client-offers')
    .getPublicUrl(path);
  
  return { url: urlData.publicUrl, path };
}
