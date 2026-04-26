import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface LeadQuestion {
  question: string;
  answer: any;
  source: string;
}

export interface GHLNote {
  id: string;
  body: string;
  userId?: string;
  dateAdded: string;
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
  ghl_synced_at?: string | null;
  ghl_notes?: GHLNote[] | null;
  opportunity_status?: string | null;
  opportunity_stage?: string | null;
  opportunity_stage_id?: string | null;
  opportunity_value?: number | null;
}

export interface Call {
  id: string;
  client_id: string;
  lead_id: string | null;
  external_id: string;
  scheduled_at: string | null;
  booked_at: string | null;
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
  ghl_synced_at?: string | null;
  ghl_appointment_id?: string | null;
  ghl_calendar_id?: string | null;
  appointment_status?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export function useLeads(clientId?: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['leads', clientId, startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows((sb) => {
        let query = sb
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (clientId) {
          query = query.eq('client_id', clientId);
        }

        if (startDate) {
          query = query.gte('created_at', startDate + 'T00:00:00.000Z');
        }
        if (endDate) {
          const endNext = new Date(endDate + 'T00:00:00.000Z');
          endNext.setUTCDate(endNext.getUTCDate() + 1);
          query = query.lt('created_at', endNext.toISOString());
        }
        
        return query;
      });

      return data.map(lead => ({
        ...lead,
        ghl_notes: Array.isArray(lead.ghl_notes) ? (lead.ghl_notes as unknown as GHLNote[]) : null,
      })) as Lead[];
    },
  });
}

export function useCalls(clientId?: string, showedOnly?: boolean, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['calls', clientId, showedOnly, startDate, endDate],
    queryFn: async () => {
      // showed calls are counted by scheduled_at (the actual appointment date)
      // booked calls are counted by booked_at (when the booking was made)
      // This matches the RPC get_client_source_metrics and recalculate-daily-metrics
      const dateColumn = showedOnly ? 'scheduled_at' : 'booked_at';

      const data = await fetchAllRows((sb) => {
        let query = sb
          .from('calls')
          .select('*')
          .order(dateColumn, { ascending: false });

        if (clientId) {
          query = query.eq('client_id', clientId);
        }

        if (showedOnly) {
          query = query.eq('showed', true);
        }

        if (startDate) {
          query = query.gte(dateColumn, startDate + 'T00:00:00.000Z');
        }
        if (endDate) {
          const endNext = new Date(endDate + 'T00:00:00.000Z');
          endNext.setUTCDate(endNext.getUTCDate() + 1);
          query = query.lt(dateColumn, endNext.toISOString());
        }

        return query;
      });

      return data as Call[];
    },
  });
}
