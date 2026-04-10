import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/components/tasks/NotificationsTab';
import { useRealtimeNotifications, requestBrowserNotificationPermission } from '@/hooks/useRealtimeNotifications';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CheckCheck } from 'lucide-react';

interface NotificationBellProps {
  onTaskClick?: (taskId: string) => void;
}

export function NotificationBell({ onTaskClick }: NotificationBellProps) {
  const { currentMember } = useTeamMember();
  const { data: notifications = [] } = useNotifications(currentMember?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);

  // Enable realtime + browser notifications
  useRealtimeNotifications(currentMember?.id);

  useEffect(() => {
    requestBrowserNotificationPermission();
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const recent = notifications.slice(0, 15);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && currentMember && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate(currentMember.id)}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50',
                    !n.is_read && 'bg-primary/5'
                  )}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    if (n.task_id && onTaskClick) {
                      onTaskClick(n.task_id);
                      setOpen(false);
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs leading-snug', !n.is_read && 'font-medium')}>
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {format(new Date(n.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
