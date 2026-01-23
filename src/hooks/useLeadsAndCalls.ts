import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadQuestion {
  question: string;
  answer: any;
  source: string;
}

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
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  assigned_user?: string | null;
  pipeline_value?: number | null;
  custom_fields?: Record<string, any> | null;
  questions?: any[] | null;
  campaign_name?: string | null;
  ad_set_name?: string | null;
  ad_id?: string | null;
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
  is_reconnect?: boolean;
  recording_url?: string | null;
  summary?: string | null;
  quality_score?: number | null;
  transcript?: string | null;
  direction?: 'inbound' | 'outbound' | null;
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
