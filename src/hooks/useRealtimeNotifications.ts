import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeNotifications(memberId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!memberId) return;

    const channel = supabase
      .channel(`notifications-${memberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_notifications',
          filter: `member_id=eq.${memberId}`,
        },
        (payload) => {
          // Invalidate to refetch
          queryClient.invalidateQueries({ queryKey: ['task-notifications', memberId] });

          // Browser notification for new inserts
          if (payload.eventType === 'INSERT' && payload.new) {
            const msg = (payload.new as any).message;
            if (Notification.permission === 'granted') {
              new Notification('New Task Notification', {
                body: msg,
                icon: '/favicon.ico',
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, queryClient]);
}

export function requestBrowserNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
