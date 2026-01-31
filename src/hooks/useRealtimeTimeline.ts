import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to subscribe to realtime updates for contact timeline events.
 * When events are inserted/updated/deleted, it automatically invalidates the query cache.
 */
export function useRealtimeTimeline(clientId: string | undefined, ghlContactId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clientId || !ghlContactId) return;

    const channel = supabase
      .channel(`timeline-${clientId}-${ghlContactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_timeline_events',
          filter: `ghl_contact_id=eq.${ghlContactId}`,
        },
        (payload) => {
          console.log('Timeline realtime update:', payload.eventType);
          // Invalidate the timeline query to trigger a refetch
          queryClient.invalidateQueries({
            queryKey: ['contact-timeline', clientId, ghlContactId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, ghlContactId, queryClient]);
}

/**
 * Hook to subscribe to realtime updates for all timeline events for a client.
 * Useful for dashboards that show aggregated activity.
 */
export function useRealtimeClientTimeline(clientId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`client-timeline-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_timeline_events',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          console.log('Client timeline realtime update:', payload.eventType);
          // Invalidate all timeline queries for this client
          queryClient.invalidateQueries({
            queryKey: ['contact-timeline', clientId],
            exact: false,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);
}
