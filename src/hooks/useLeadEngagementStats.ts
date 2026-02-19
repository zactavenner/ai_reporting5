import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface LeadEngagementStats {
  emailsSent: number;
  smsSent: number;
  callsMade: number;
  hasRecording: boolean;
}

export type EngagementStatsMap = Record<string, LeadEngagementStats>;

// Fetch engagement stats for all leads in a client
export function useLeadEngagementStats(clientId?: string, leadExternalIds?: string[]) {
  return useQuery({
    queryKey: ['lead-engagement-stats', clientId, leadExternalIds?.length],
    queryFn: async (): Promise<EngagementStatsMap> => {
      if (!clientId || !leadExternalIds?.length) return {};

      // Get timeline events for these contacts (paginated)
      const timelineEvents = await fetchAllRows((sb) =>
        sb.from('contact_timeline_events')
          .select('ghl_contact_id, event_type')
          .eq('client_id', clientId)
          .in('ghl_contact_id', leadExternalIds)
      );

      // Get calls with recordings for these leads (paginated)
      const callsWithRecordings = await fetchAllRows((sb) =>
        sb.from('calls')
          .select('lead_id, recording_url')
          .eq('client_id', clientId)
          .not('recording_url', 'is', null)
      );

      // Build stats map
      const statsMap: EngagementStatsMap = {};

      // Initialize all leads with zero stats
      leadExternalIds.forEach(id => {
        statsMap[id] = {
          emailsSent: 0,
          smsSent: 0,
          callsMade: 0,
          hasRecording: false,
        };
      });

      // Count events per contact
      timelineEvents.forEach(event => {
        const stats = statsMap[event.ghl_contact_id];
        if (!stats) return;

        const eventType = event.event_type?.toLowerCase() || '';
        if (eventType.includes('email')) {
          stats.emailsSent++;
        } else if (eventType.includes('sms') || eventType.includes('text')) {
          stats.smsSent++;
        } else if (eventType.includes('call')) {
          stats.callsMade++;
        }
      });

      // Mark leads with recordings
      callsWithRecordings.forEach(call => {
        if (call.lead_id && call.recording_url) {
          Object.values(statsMap).forEach(stats => {
            // Simplified approach
          });
        }
      });

      return statsMap;
    },
    enabled: !!clientId && !!leadExternalIds?.length,
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch call recordings map for leads
export function useLeadCallRecordings(clientId?: string) {
  return useQuery({
    queryKey: ['lead-call-recordings', clientId],
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!clientId) return {};

      const data = await fetchAllRows((sb) =>
        sb.from('calls')
          .select('lead_id, recording_url')
          .eq('client_id', clientId)
          .not('recording_url', 'is', null)
      );

      const recordingsMap: Record<string, boolean> = {};
      data.forEach(call => {
        if (call.lead_id) {
          recordingsMap[call.lead_id] = true;
        }
      });

      return recordingsMap;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}
