import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Client {
  id: string;
  name: string;
  status: string;
  public_token: string | null;
  business_manager_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, public_token, business_manager_url, created_at, updated_at')
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
        .select('id, name, status, public_token, business_manager_url, created_at, updated_at')
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
      if (!token) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, public_token, business_manager_url, created_at, updated_at')
        .eq('public_token', token)
        .maybeSingle();
      
      if (error) throw error;
      return data as Client | null;
    },
    enabled: !!token,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
