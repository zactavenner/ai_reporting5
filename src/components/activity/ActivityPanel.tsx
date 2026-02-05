import { useState, useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle2,
  PlusCircle,
  ThumbsUp,
  Clock,
  Video,
  Filter,
  Mic,
  Activity,
  Trash2,
  ClipboardCheck,
  Image,
  ExternalLink,
  ListTodo,
  Check,
  X,
   Plus,
} from 'lucide-react';
import { Task } from '@/hooks/useTasks';
import { VoiceNote } from '@/hooks/useVoiceNotes';
import { Meeting } from '@/hooks/useMeetings';
import { Creative } from '@/hooks/useCreatives';
import { cn } from '@/lib/utils';
import { useApprovePendingTask, useRejectPendingTask, useCreatePendingTaskFromActionItem } from '@/hooks/useMeetings';
import { toast } from 'sonner';
 import { TaskDiscussionVoiceNote } from '@/components/tasks/TaskDiscussionVoiceNote';
 import { useTeamMember } from '@/contexts/TeamMemberContext';

interface ActivityPanelProps {
  tasks: Task[];
  voiceNotes?: VoiceNote[];
  meetings?: Meeting[];
  creatives?: Creative[];
  isPublicView?: boolean;
   clientId?: string;
   clientName?: string;
  onDeleteActivity?: (activityId: string, type: string) => void;
  onActivityClick?: (activityId: string, type: ActivityType) => void;
}

type ActivityType = 'task_created' | 'task_completed' | 'task_ready_for_review' | 'meeting_synced' | 'voice_note_recorded' | 'creative_approved' | 'creative_launched';

interface ActivityItem {
  id: string;
  sourceId: string;
  type: ActivityType;
  title: string;
  timestamp: Date;
  metadata?: {
    priority?: string;
    summary?: string;
    duration?: number;
    platform?: string;
    actionItems?: any[];
    clientId?: string;
  };
}

const ACTIVITY_CONFIG: Record<ActivityType, { icon: typeof CheckCircle2; label: string; color: string }> = {
  task_created: { icon: PlusCircle, label: 'Task Created', color: 'text-blue-500' },
  task_completed: { icon: CheckCircle2, label: 'Task Completed', color: 'text-green-500' },
  task_ready_for_review: { icon: ClipboardCheck, label: 'Ready for Review', color: 'text-amber-500' },
  meeting_synced: { icon: Video, label: 'Meeting Summary', color: 'text-indigo-500' },
  voice_note_recorded: { icon: Mic, label: 'Voice Note', color: 'text-pink-500' },
  creative_approved: { icon: ThumbsUp, label: 'Creative Approved', color: 'text-emerald-500' },
  creative_launched: { icon: Image, label: 'Creative Launched', color: 'text-orange-500' },
};

export function ActivityPanel({ 
  tasks, 
  voiceNotes = [], 
  meetings = [],
  creatives = [],
  isPublicView = false,
   clientId,
   clientName,
  onDeleteActivity,
  onActivityClick,
}: ActivityPanelProps) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Set<ActivityType>>(new Set());
  const [actionItemsModal, setActionItemsModal] = useState<{
    open: boolean;
    title: string;
    actionItems: any[];
    sourceId: string;
    clientId: string | null;
    type: 'voice_note' | 'meeting';
  }>({ open: false, title: '', actionItems: [], sourceId: '', clientId: null, type: 'voice_note' });
   const [showVoiceTaskRecorder, setShowVoiceTaskRecorder] = useState(false);

  const createPendingTask = useCreatePendingTaskFromActionItem();
  const approvePendingTask = useApprovePendingTask();
   const { currentMember } = useTeamMember();

  // Build unified activity list
  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    // Task activities
    tasks.forEach(task => {
      items.push({
        id: `task-created-${task.id}`,
        sourceId: task.id,
        type: 'task_created',
        title: task.title,
        timestamp: new Date(task.created_at),
        metadata: { priority: task.priority },
      });

      if (task.completed_at) {
        items.push({
          id: `task-completed-${task.id}`,
          sourceId: task.id,
          type: 'task_completed',
          title: task.title,
          timestamp: new Date(task.completed_at),
          metadata: { priority: task.priority },
        });
      }

      if (task.stage === 'review') {
        items.push({
          id: `task-review-${task.id}`,
          sourceId: task.id,
          type: 'task_ready_for_review',
          title: task.title,
          timestamp: new Date(task.updated_at),
          metadata: { priority: task.priority },
        });
      }
    });

    // Meeting activities
    meetings.forEach(meeting => {
      items.push({
        id: `meeting-${meeting.id}`,
        sourceId: meeting.id,
        type: 'meeting_synced',
        title: meeting.title,
        timestamp: new Date(meeting.meeting_date || meeting.created_at),
        metadata: { 
          summary: meeting.summary || undefined,
          duration: meeting.duration_minutes || undefined,
          actionItems: meeting.action_items,
          clientId: meeting.client_id || undefined,
        },
      });
    });

    // Voice note activities - include action items
    voiceNotes.forEach(note => {
      items.push({
        id: `voice-note-${note.id}`,
        sourceId: note.id,
        type: 'voice_note_recorded',
        title: note.title,
        timestamp: new Date(note.created_at),
        metadata: { 
          summary: note.summary || undefined,
          actionItems: note.action_items || [],
          clientId: note.client_id || undefined,
        },
      });
    });

    // Creative activities
    creatives.forEach(creative => {
      if (creative.status === 'approved') {
        items.push({
          id: `creative-approved-${creative.id}`,
          sourceId: creative.id,
          type: 'creative_approved',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          metadata: { platform: creative.platform },
        });
      }
      if (creative.status === 'launched') {
        items.push({
          id: `creative-launched-${creative.id}`,
          sourceId: creative.id,
          type: 'creative_launched',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          metadata: { platform: creative.platform },
        });
      }
    });

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [tasks, meetings, voiceNotes, creatives]);

  const filteredActivities = useMemo(() => {
    if (filters.size === 0) return activities;
    return activities.filter(a => filters.has(a.type));
  }, [activities, filters]);

  const toggleFilter = (type: ActivityType) => {
    const newFilters = new Set(filters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setFilters(newFilters);
  };

  const handleDelete = (activity: ActivityItem) => {
    if (onDeleteActivity) {
      const actualId = activity.id.split('-').slice(2).join('-') || activity.id.split('-')[1];
      onDeleteActivity(actualId, activity.type);
    }
  };

  const handleActivityClick = (activity: ActivityItem) => {
    // For voice notes and meetings with action items, show the action items modal
    if ((activity.type === 'voice_note_recorded' || activity.type === 'meeting_synced') && 
        activity.metadata?.actionItems && 
        activity.metadata.actionItems.length > 0) {
      setActionItemsModal({
        open: true,
        title: activity.title,
        actionItems: activity.metadata.actionItems,
        sourceId: activity.sourceId,
        clientId: activity.metadata.clientId || null,
        type: activity.type === 'voice_note_recorded' ? 'voice_note' : 'meeting',
      });
    } else if (onActivityClick) {
      onActivityClick(activity.sourceId, activity.type);
    }
  };

  const handleCreateTask = async (actionItem: any) => {
    const title = typeof actionItem === 'string' ? actionItem : actionItem.title || actionItem.text || actionItem;
    const description = typeof actionItem === 'string' ? '' : actionItem.description || '';
    
    try {
      if (actionItemsModal.type === 'meeting') {
        // Create pending task for meetings
        await createPendingTask.mutateAsync({
          meetingId: actionItemsModal.sourceId,
          clientId: actionItemsModal.clientId,
          title,
          description,
        });
        toast.success('Task added for review');
      } else {
        // For voice notes, directly approve and create the task
        await approvePendingTask.mutateAsync({
          pendingTaskId: `voice-${Date.now()}`, // Temporary ID
          clientId: actionItemsModal.clientId,
          title,
          description,
          priority: 'medium',
        });
        toast.success('Task created');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    }
  };

  const hasActionItems = (activity: ActivityItem) => {
    return activity.metadata?.actionItems && activity.metadata.actionItems.length > 0;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Activity className="h-4 w-4 mr-2" />
            Activity
            {activities.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {activities.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
             {/* Voice Task Recording Section */}
             {!isPublicView && (
               <div className="pb-4 border-b">
                 {showVoiceTaskRecorder ? (
                   <TaskDiscussionVoiceNote
                     taskId="new"
                     authorName={currentMember?.name || 'Agency'}
                     clientId={clientId}
                     clientName={clientName}
                     mode="create_task"
                     onTaskCreated={() => {
                       setShowVoiceTaskRecorder(false);
                       toast.success('Task created from voice recording!');
                     }}
                   />
                 ) : (
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="w-full"
                     onClick={() => setShowVoiceTaskRecorder(true)}
                   >
                     <Mic className="h-4 w-4 mr-2" />
                     Record Voice Task
                   </Button>
                 )}
               </div>
             )}

            {/* Filter toolbar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filteredActivities.length} activities
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                    {filters.size > 0 && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                        {filters.size}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {Object.entries(ACTIVITY_CONFIG).map(([type, config]) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={filters.has(type as ActivityType)}
                      onCheckedChange={() => toggleFilter(type as ActivityType)}
                    >
                      <config.icon className={cn('h-4 w-4 mr-2', config.color)} />
                      {config.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Activity list */}
            {filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">No activity yet</p>
                <p className="text-xs mt-1">Tasks and meeting updates will appear here</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-1 pr-4">
                  {filteredActivities.map((activity) => {
                    const config = ACTIVITY_CONFIG[activity.type];
                    const Icon = config.icon;
                    const hasItems = hasActionItems(activity);

                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          "flex items-start gap-3 py-3 border-b border-border last:border-0 group",
                          (onActivityClick || hasItems) && "cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
                        )}
                        onClick={() => handleActivityClick(activity)}
                      >
                        <div className={cn('mt-0.5 flex-shrink-0', config.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              {config.label}
                            </span>
                            {activity.metadata?.duration && (
                              <Badge variant="secondary" className="text-xs h-5">
                                {activity.metadata.duration} min
                              </Badge>
                            )}
                            {activity.metadata?.platform && (
                              <Badge variant="outline" className="text-xs h-5">
                                {activity.metadata.platform}
                              </Badge>
                            )}
                            {/* Show action items indicator */}
                            {hasItems && (
                              <Badge variant="outline" className="text-xs h-5 gap-1 text-primary border-primary/50">
                                <ListTodo className="h-3 w-3" />
                                {activity.metadata!.actionItems!.length} action items
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate mt-0.5">
                            {activity.title}
                          </p>
                          {activity.metadata?.summary && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {activity.metadata.summary}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          {/* Always show date and time */}
                          <span className="text-xs font-medium text-foreground whitespace-nowrap">
                            {format(activity.timestamp, 'MMM d, yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(activity.timestamp, 'h:mm a')}
                          </span>
                          {(onActivityClick || hasItems) && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                          )}
                          {!isPublicView && onDeleteActivity && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(activity);
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Action Items Modal */}
      <Dialog open={actionItemsModal.open} onOpenChange={(open) => setActionItemsModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              Action Items Found
            </DialogTitle>
            <DialogDescription>
              From: {actionItemsModal.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {actionItemsModal.actionItems.map((item, index) => {
              const title = typeof item === 'string' ? item : item.title || item.text || JSON.stringify(item);
              const description = typeof item === 'string' ? '' : item.description || '';
              
              return (
                <div 
                  key={index} 
                  className="p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{title}</p>
                      {description && (
                        <p className="text-xs text-muted-foreground mt-1">{description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 gap-1"
                      onClick={() => handleCreateTask(item)}
                      disabled={createPendingTask.isPending}
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add Task
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {actionItemsModal.actionItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No action items found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
