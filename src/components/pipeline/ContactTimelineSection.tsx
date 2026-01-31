import { RefreshCw, Calendar, Mail, Phone, MessageSquare, FileText, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TimelineEvent, useSyncContactTimeline } from '@/hooks/useContactTimeline';
import { useRealtimeTimeline } from '@/hooks/useRealtimeTimeline';

interface ContactTimelineSectionProps {
  events: TimelineEvent[];
  isLoading: boolean;
  ghlContactId: string | null;
  clientId: string;
  isPublicView?: boolean;
}

const eventIcons: Record<string, React.ReactNode> = {
  task: <CheckCircle className="h-4 w-4" />,
  appointment: <Calendar className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  call: <Phone className="h-4 w-4" />,
  form_submission: <FileText className="h-4 w-4" />,
  opportunity_stage_change: <Clock className="h-4 w-4" />,
};

const eventColors: Record<string, string> = {
  task: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  appointment: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  note: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  email: 'bg-green-500/10 text-green-600 border-green-500/20',
  sms: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  call: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  form_submission: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  opportunity_stage_change: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

export function ContactTimelineSection({ 
  events, 
  isLoading, 
  ghlContactId,
  clientId,
  isPublicView 
}: ContactTimelineSectionProps) {
  const syncTimeline = useSyncContactTimeline();
  
  // Subscribe to realtime updates for this contact's timeline
  useRealtimeTimeline(clientId, ghlContactId || undefined);

  const handleSync = () => {
    if (ghlContactId) {
      syncTimeline.mutate({ clientId, ghlContactId });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Activity Timeline
        </h3>
        {!isPublicView && ghlContactId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncTimeline.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncTimeline.isPending ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No timeline events synced yet.
          {!isPublicView && ghlContactId && (
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={handleSync}>
                Sync Contact Timeline
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
          
          <div className="space-y-4">
            {events.map(event => (
              <div key={event.id} className="flex gap-3 relative">
                {/* Icon */}
                <div className={`
                  relative z-10 flex items-center justify-center 
                  w-8 h-8 rounded-full border
                  ${eventColors[event.event_type] || 'bg-muted text-muted-foreground border-border'}
                `}>
                  {eventIcons[event.event_type] || <Clock className="h-4 w-4" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium capitalize">
                      {event.event_type.replace('_', ' ')}
                    </span>
                    {event.event_subtype && (
                      <span className="text-xs text-muted-foreground">
                        ({event.event_subtype})
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(event.event_at).toLocaleString()}
                    </span>
                  </div>
                  
                  {event.title && (
                    <div className="text-sm mt-1">{event.title}</div>
                  )}
                  
                  {event.body && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {event.body}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
