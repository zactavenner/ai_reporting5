import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Lead {
  id: string;
  client_id: string;
  external_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string | null;
  is_spam: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  client_id: string;
  lead_id: string | null;
  external_id: string;
  scheduled_at: string | null;
  showed: boolean | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeads(clientId?: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['leads', clientId, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate + 'T23:59:59');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
  });
}

export function useCalls(clientId?: string, showedOnly?: boolean, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['calls', clientId, showedOnly, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('calls')
        .select('*')
        .order('scheduled_at', { ascending: false });
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      if (showedOnly) {
        query = query.eq('showed', true);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate + 'T23:59:59');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Call[];
    },
  });
}
