import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  // Opportunity fields from GHL sync
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
  booked_at: string | null; // When the appointment was CREATED in GHL (used for historical filtering)
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
  // Embedded contact info for display (denormalized from leads)
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
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

      // Use full timestamp with timezone to ensure proper filtering
      // startDate at local midnight = startDate + 'T00:00:00' in local time
      // We append local timezone offset to ensure correct UTC conversion
      if (startDate) {
        // Create date at start of local day and convert to ISO string
        const startLocal = new Date(startDate + 'T00:00:00');
        query = query.gte('created_at', startLocal.toISOString());
      }
      if (endDate) {
        // Create date at end of local day (23:59:59.999) and convert to ISO string
        const endLocal = new Date(endDate + 'T23:59:59.999');
        query = query.lte('created_at', endLocal.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      // Cast ghl_notes from Json to GHLNote[] for each lead
      return (data || []).map(lead => ({
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
      let query = supabase
        .from('calls')
        .select('*')
        .order('booked_at', { ascending: false }); // Order by booked_at (when appointment was created in GHL)
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      if (showedOnly) {
        query = query.eq('showed', true);
      }

      // Filter by booked_at (GHL creation date) for accurate historical reporting
      // This ensures calls appear on the date they were BOOKED, not synced
      if (startDate) {
        const startLocal = new Date(startDate + 'T00:00:00');
        query = query.gte('booked_at', startLocal.toISOString());
      }
      if (endDate) {
        const endLocal = new Date(endDate + 'T23:59:59.999');
        query = query.lte('booked_at', endLocal.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Call[];
    },
  });
}
