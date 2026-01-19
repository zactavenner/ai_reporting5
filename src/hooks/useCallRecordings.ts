import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CallRecording {
  id: string;
  client_id: string;
  lead_id: string | null;
  external_id: string;
  scheduled_at: string | null;
  showed: boolean;
  outcome: string | null;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  quality_score: number | null;
  created_at: string;
}

export function useCallRecordings(clientId?: string) {
  return useQuery({
    queryKey: ['call-recordings', clientId],
    queryFn: async () => {
      let query = supabase
        .from('calls')
        .select('*')
        .order('scheduled_at', { ascending: false });
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as CallRecording[];
    },
    enabled: !!clientId,
  });
}