import { useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2,
  PlusCircle,
  Edit3,
  Trash2,
  ArrowRight,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Search,
} from 'lucide-react';
import { Task, useTaskHistory, TaskHistory } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';

interface TaskHistoryTabProps {
  tasks: Task[];
  clientId?: string;
}

type HistoryEventType = 
  | 'created' 
  | 'completed' 
  | 'status_changed' 
  | 'priority_changed' 
  | 'assigned' 
  | 'due_date_changed'
  | 'stage_changed'
  | 'description_changed';

interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  taskId: string;
  taskTitle: string;
  timestamp: Date;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  clientName?: string;
}

const EVENT_CONFIG: Record<HistoryEventType, { icon: typeof CheckCircle2; label: string; color: string }> = {
  created: { icon: PlusCircle, label: 'Created', color: 'text-blue-500' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-green-500' },
  status_changed: { icon: ArrowRight, label: 'Status Changed', color: 'text-orange-500' },
  priority_changed: { icon: AlertTriangle, label: 'Priority Changed', color: 'text-amber-500' },
  assigned: { icon: User, label: 'Assigned', color: 'text-purple-500' },
  due_date_changed: { icon: Calendar, label: 'Due Date Changed', color: 'text-cyan-500' },
  stage_changed: { icon: ArrowRight, label: 'Stage Changed', color: 'text-indigo-500' },
  description_changed: { icon: Edit3, label: 'Description Updated', color: 'text-gray-500' },
};

export function TaskHistoryTab({ tasks, clientId }: TaskHistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Build history from tasks data
  const historyEvents = useMemo(() => {
    const events: HistoryEvent[] = [];

    tasks.forEach(task => {
      // Task created event
      events.push({
        id: `created-${task.id}`,
        type: 'created',
        taskId: task.id,
        taskTitle: task.title,
        timestamp: new Date(task.created_at),
        changedBy: task.created_by || undefined,
        clientName: task.assigned_client_name || undefined,
      });

      // Task completed event
      if (task.completed_at) {
        events.push({
          id: `completed-${task.id}`,
          type: 'completed',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: new Date(task.completed_at),
          clientName: task.assigned_client_name || undefined,
        });
      }

      // Status change events (we can infer from current status)
      if (task.status === 'in_progress' && task.updated_at !== task.created_at) {
        events.push({
          id: `status-progress-${task.id}`,
          type: 'status_changed',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: new Date(task.updated_at),
          oldValue: 'pending',
          newValue: 'in_progress',
          clientName: task.assigned_client_name || undefined,
        });
      }

      // Stage change events
      if (task.stage !== 'todo' && task.updated_at !== task.created_at) {
        events.push({
          id: `stage-${task.id}`,
          type: 'stage_changed',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: new Date(task.updated_at),
          newValue: task.stage,
          clientName: task.assigned_client_name || undefined,
        });
      }

      // Assignment event
      if (task.assigned_to) {
        events.push({
          id: `assigned-${task.id}`,
          type: 'assigned',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: new Date(task.updated_at),
          newValue: task.assigned_to,
          clientName: task.assigned_client_name || undefined,
        });
      }
    });

    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events;
  }, [tasks]);

  // Filter by search
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return historyEvents;
    const query = searchQuery.toLowerCase();
    return historyEvents.filter(e => 
      e.taskTitle.toLowerCase().includes(query) ||
      e.clientName?.toLowerCase().includes(query) ||
      e.changedBy?.toLowerCase().includes(query)
    );
  }, [historyEvents, searchQuery]);

  // Limit display
  const displayedEvents = showAll ? filteredEvents : filteredEvents.slice(0, 100);

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      todo: 'To Do',
      stuck: 'Stuck',
      review: 'Review',
      revisions: 'Revisions',
      completed: 'Completed',
    };
    return labels[stage] || stage;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-amber-500';
      default: return 'text-muted-foreground';
    }
  };

  if (historyEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Clock className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No history yet</p>
        <p className="text-xs mt-1">Task activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filteredEvents.length} events</span>
        <span>•</span>
        <span>{tasks.filter(t => t.completed_at).length} completed</span>
        <span>•</span>
        <span>{tasks.filter(t => !t.completed_at).length} active</span>
      </div>

      {/* History list */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-1 pr-4">
          {displayedEvents.map((event) => {
            const config = EVENT_CONFIG[event.type];
            const Icon = config.icon;

            return (
              <div
                key={event.id}
                className="flex items-start gap-3 py-3 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors"
              >
                <div className={cn('mt-0.5 flex-shrink-0', config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs h-5">
                      {config.label}
                    </Badge>
                    {event.clientName && (
                      <Badge variant="secondary" className="text-xs h-5">
                        {event.clientName}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate mt-1">
                    {event.taskTitle}
                  </p>
                  {/* Show change details */}
                  {event.type === 'status_changed' && event.oldValue && event.newValue && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.oldValue} → {event.newValue}
                    </p>
                  )}
                  {event.type === 'stage_changed' && event.newValue && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Moved to {getStageLabel(event.newValue)}
                    </p>
                  )}
                  {event.type === 'assigned' && event.newValue && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Assigned to {event.newValue}
                    </p>
                  )}
                  {event.changedBy && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {event.changedBy}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">
                    {format(event.timestamp, 'MMM d, yyyy')}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(event.timestamp, 'h:mm a')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Load more */}
      {!showAll && filteredEvents.length > 100 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Show all {filteredEvents.length} events
          </Button>
        </div>
      )}
    </div>
  );
}
