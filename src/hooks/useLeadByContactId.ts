import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Lead, GHLNote } from './useLeadsAndCalls';

/**
 * Hook to fetch a lead record by GHL Contact ID (external_id)
 * Used to get full lead details (UTM, questions) for opportunities and other records
 */
export function useLeadByContactId(clientId: string | undefined, ghlContactId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-by-contact-id', clientId, ghlContactId],
    queryFn: async () => {
      if (!clientId || !ghlContactId) return null;
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', clientId)
        .eq('external_id', ghlContactId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Cast ghl_notes from Json to GHLNote[]
      return {
        ...data,
        ghl_notes: Array.isArray(data.ghl_notes) ? (data.ghl_notes as unknown as GHLNote[]) : null,
      } as Lead;
    },
    enabled: !!clientId && !!ghlContactId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
