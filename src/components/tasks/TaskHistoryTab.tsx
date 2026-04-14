import { useMemo, useState, useRef } from 'react';
import { isToday, isPast, parseISO } from 'date-fns';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  PlusCircle,
  Edit3,
  ArrowRight,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  Search,
  FileEdit,
  Video,
  Mic,
  ThumbsUp,
  Image,
  ClipboardCheck,
  Send,
  Paperclip,
  Upload,
} from 'lucide-react';
import { Task, TaskHistory, useAddTaskHistory, useAgencyMembers } from '@/hooks/useTasks';
import { VoiceNote } from '@/hooks/useVoiceNotes';
import { Meeting } from '@/hooks/useMeetings';
import { Creative } from '@/hooks/useCreatives';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { TaskDiscussionVoiceNote, VoiceNotePlayer } from './TaskDiscussionVoiceNote';
import { TaskDetailPanel } from './TaskDetailPanel';
import { toast } from 'sonner';

interface TaskHistoryTabProps {
  tasks: Task[];
  clientId?: string;
  voiceNotes?: VoiceNote[];
  meetings?: Meeting[];
  creatives?: Creative[];
  isPublicView?: boolean;
}

type EventType = 
  | 'created' 
  | 'completed' 
  | 'status_changed' 
  | 'priority_changed' 
  | 'assigned' 
  | 'due_date_changed'
  | 'stage_changed'
  | 'description_changed'
  | 'update'
  | 'voice_note'
  | 'meeting'
  | 'creative_approved'
  | 'creative_launched'
  | 'task_review';

interface UnifiedEvent {
  id: string;
  type: EventType;
  title: string;
  timestamp: Date;
  taskId?: string;
  dueDate?: string | null;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  clientName?: string;
  content?: string;
  // Voice note specific
  audioUrl?: string;
  transcript?: string;
  duration?: number;
  // Meeting specific
  summary?: string;
  // Creative specific
  platform?: string;
  fileUrl?: string;
  creativeType?: string;
}

const EVENT_CONFIG: Record<EventType, { icon: typeof CheckCircle2; label: string; color: string }> = {
  created: { icon: PlusCircle, label: 'Created', color: 'text-blue-500' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-green-500' },
  status_changed: { icon: ArrowRight, label: 'Status Changed', color: 'text-orange-500' },
  priority_changed: { icon: AlertTriangle, label: 'Priority Changed', color: 'text-amber-500' },
  assigned: { icon: User, label: 'Assigned', color: 'text-purple-500' },
  due_date_changed: { icon: Calendar, label: 'Due Date Changed', color: 'text-cyan-500' },
  stage_changed: { icon: ArrowRight, label: 'Stage Changed', color: 'text-indigo-500' },
  description_changed: { icon: Edit3, label: 'Description Updated', color: 'text-muted-foreground' },
  update: { icon: FileEdit, label: 'Update', color: 'text-primary' },
  voice_note: { icon: Mic, label: 'Voice Note', color: 'text-pink-500' },
  meeting: { icon: Video, label: 'Meeting', color: 'text-indigo-500' },
  creative_approved: { icon: ThumbsUp, label: 'Creative Approved', color: 'text-emerald-500' },
  creative_launched: { icon: Image, label: 'Creative Launched', color: 'text-orange-500' },
  task_review: { icon: ClipboardCheck, label: 'Ready for Review', color: 'text-amber-500' },
};

export function TaskHistoryTab({ tasks, clientId, voiceNotes = [], meetings = [], creatives = [], isPublicView = false }: TaskHistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTaskForPanel, setSelectedTaskForPanel] = useState<Task | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addHistory = useAddTaskHistory();
  const { currentMember } = useTeamMember();
  const { data: agencyMembers = [] } = useAgencyMembers();

  // Fetch all task history records from database
  const taskIds = tasks.map(t => t.id);
  const { data: dbHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ['all-task-history', taskIds],
    queryFn: async () => {
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TaskHistory[];
    },
    enabled: taskIds.length > 0,
  });

  // Build unified timeline from all sources
  const allEvents = useMemo(() => {
    const events: UnifiedEvent[] = [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const memberMap = new Map(agencyMembers.map(m => [m.id, m.name]));

    // Task history events from DB
    dbHistory.forEach(h => {
      const task = taskMap.get(h.task_id);
      if (!task) return;

      let eventType: EventType = 'update';
      if (h.action === 'status_changed') eventType = 'status_changed';
      else if (h.action === 'stage_changed') eventType = 'stage_changed';
      else if (h.action === 'priority_changed') eventType = 'priority_changed';
      else if (h.action === 'assigned') eventType = 'assigned';
      else if (h.action === 'due_date_changed') eventType = 'due_date_changed';
      else if (h.action === 'description_changed') eventType = 'description_changed';
      else if (h.action === 'completed') eventType = 'completed';

      events.push({
        id: `history-${h.id}`,
        type: eventType,
        title: task.title,
        timestamp: new Date(h.created_at),
        taskId: task.id,
        dueDate: task.due_date,
        changedBy: h.changed_by || undefined,
        oldValue: h.old_value || undefined,
        newValue: h.new_value || undefined,
        clientName: task.assigned_client_name || undefined,
        content: (h.action === 'update' || h.action === 'client_update' || h.action === 'note') ? h.new_value || undefined : undefined,
      });
    });

    // Task created events
    tasks.forEach(task => {
      events.push({
        id: `created-${task.id}`,
        type: 'created',
        title: task.title,
        timestamp: new Date(task.created_at),
        taskId: task.id,
        dueDate: task.due_date,
        changedBy: task.created_by || undefined,
        clientName: task.assigned_client_name || undefined,
      });

      if (task.completed_at) {
        events.push({
          id: `completed-${task.id}`,
          type: 'completed',
          title: task.title,
          timestamp: new Date(task.completed_at),
          taskId: task.id,
          dueDate: task.due_date,
          clientName: task.assigned_client_name || undefined,
        });
      }

      if (task.stage === 'review') {
        events.push({
          id: `review-${task.id}`,
          type: 'task_review',
          title: task.title,
          timestamp: new Date(task.updated_at),
          taskId: task.id,
          dueDate: task.due_date,
          clientName: task.assigned_client_name || undefined,
        });
      }

      if (task.assigned_to) {
        events.push({
          id: `assigned-${task.id}`,
          type: 'assigned',
          title: task.title,
          timestamp: new Date(task.updated_at),
          taskId: task.id,
          dueDate: task.due_date,
          newValue: memberMap.get(task.assigned_to) || task.assigned_to,
          clientName: task.assigned_client_name || undefined,
        });
      }
    });

    // Voice notes
    voiceNotes.forEach(note => {
      events.push({
        id: `voice-${note.id}`,
        type: 'voice_note',
        title: note.title,
        timestamp: new Date(note.created_at),
        changedBy: note.recorded_by || undefined,
        audioUrl: note.audio_url || undefined,
        transcript: note.transcript || undefined,
        duration: note.duration_seconds || undefined,
        summary: note.summary || undefined,
      });
    });

    // Meetings
    meetings.forEach(meeting => {
      events.push({
        id: `meeting-${meeting.id}`,
        type: 'meeting',
        title: meeting.title,
        timestamp: new Date(meeting.meeting_date || meeting.created_at),
        summary: meeting.summary || undefined,
        duration: meeting.duration_minutes || undefined,
      });
    });

    // Creatives
    creatives.forEach(creative => {
      if (creative.status === 'approved') {
        events.push({
          id: `creative-approved-${creative.id}`,
          type: 'creative_approved',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          platform: creative.platform || undefined,
          fileUrl: creative.file_url || undefined,
          creativeType: creative.type || undefined,
        });
      }
      if (creative.status === 'launched') {
        events.push({
          id: `creative-launched-${creative.id}`,
          type: 'creative_launched',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          platform: creative.platform || undefined,
          fileUrl: creative.file_url || undefined,
          creativeType: creative.type || undefined,
        });
      }
    });

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events;
  }, [tasks, dbHistory, voiceNotes, meetings, creatives, agencyMembers]);

  // Filter by search
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return allEvents;
    const query = searchQuery.toLowerCase();
    return allEvents.filter(e => 
      e.title.toLowerCase().includes(query) ||
      e.clientName?.toLowerCase().includes(query) ||
      e.changedBy?.toLowerCase().includes(query) ||
      e.content?.toLowerCase().includes(query) ||
      e.summary?.toLowerCase().includes(query)
    );
  }, [allEvents, searchQuery]);

  const displayedEvents = showAll ? filteredEvents : filteredEvents.slice(0, 100);

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      todo: 'To Do', stuck: 'Stuck', review: 'Review',
      revisions: 'Revisions', completed: 'Completed', done: 'Done', client_tasks: 'Client Tasks',
    };
    return labels[stage] || stage;
  };

  const getAuthorName = () => {
    if (isPublicView) return 'Client';
    return currentMember?.name || 'Agency';
  };

  // Submit a text update as a general activity entry  
  const handleSubmitUpdate = async () => {
    if (!updateText.trim()) return;
    setIsSubmitting(true);
    try {
      // Use the first task as a reference, or create a general note via task_history on a "general" basis
      // We'll attach it to the first task if available, or show an error
      if (tasks.length === 0) {
        toast.error('No tasks available to attach update to. Create a task first.');
        setIsSubmitting(false);
        return;
      }
      // Attach to most recently created task as a general note
      const targetTask = tasks[0];
      await addHistory.mutateAsync({
        taskId: targetTask.id,
        action: isPublicView ? 'client_update' : 'update',
        newValue: updateText.trim(),
        changedBy: getAuthorName(),
      });
      setUpdateText('');
      refetchHistory();
      toast.success('Update posted');
    } catch (err) {
      toast.error('Failed to post update');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (tasks.length === 0) {
      toast.error('No tasks available to attach file to. Create a task first.');
      return;
    }
    setIsSubmitting(true);
    try {
      const targetTask = tasks[0];
      const filePath = `task-files/${targetTask.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(filePath, file);
      
      if (uploadError) {
        // Bucket may not exist, post as text note instead
        await addHistory.mutateAsync({
          taskId: targetTask.id,
          action: isPublicView ? 'client_update' : 'update',
          newValue: `📎 File attached: ${file.name}`,
          changedBy: getAuthorName(),
        });
      } else {
        const { data: urlData } = supabase.storage.from('task-attachments').getPublicUrl(filePath);
        await addHistory.mutateAsync({
          taskId: targetTask.id,
          action: isPublicView ? 'client_update' : 'update',
          newValue: `📎 File: [${file.name}](${urlData.publicUrl})`,
          changedBy: getAuthorName(),
        });
      }
      setSelectedFile(null);
      refetchHistory();
      toast.success('File uploaded');
    } catch (err) {
      toast.error('Failed to upload file');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Submission area */}
      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
        <Textarea
          placeholder="Post an update, note, or feedback..."
          value={updateText}
          onChange={(e) => setUpdateText(e.target.value)}
          className="min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmitUpdate();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
            >
              <Paperclip className="h-4 w-4 mr-1" />
              File
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
              disabled={isSubmitting}
            >
              <Mic className="h-4 w-4 mr-1" />
              Voice
            </Button>
          </div>
          <Button
            size="sm"
            onClick={handleSubmitUpdate}
            disabled={!updateText.trim() || isSubmitting}
          >
            <Send className="h-4 w-4 mr-1" />
            Post
          </Button>
        </div>
        {showVoiceRecorder && tasks.length > 0 && (
          <div className="border-t border-border pt-3">
            <TaskDiscussionVoiceNote
              taskId={tasks[0].id}
              authorName={getAuthorName()}
              clientId={clientId}
              mode="comment"
              onTaskCreated={() => {
                setShowVoiceRecorder(false);
                refetchHistory();
                toast.success('Voice note posted');
              }}
            />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search activity..."
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

      {/* Unified activity list */}
      {allEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Clock className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-sm">No activity yet</p>
          <p className="text-xs mt-1">Task updates, voice notes, and meetings will appear here</p>
        </div>
      ) : (
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
                  <div className="flex-1 min-w-0 w-[80%] break-words">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs h-5">
                        {config.label}
                      </Badge>
                      {event.clientName && (
                        <Badge variant="secondary" className="text-xs h-5">
                          {event.clientName}
                        </Badge>
                      )}
                      {event.platform && (
                        <Badge variant="outline" className="text-xs h-5">
                          {event.platform}
                        </Badge>
                      )}
                      {event.duration && event.type === 'meeting' && (
                        <Badge variant="secondary" className="text-xs h-5">
                          {event.duration} min
                        </Badge>
                      )}
                    </div>

                    {/* Voice note with inline player */}
                    {event.type === 'voice_note' && event.audioUrl ? (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">{event.title}</p>
                        <VoiceNotePlayer
                          audioUrl={event.audioUrl}
                          duration={event.duration}
                          transcript={event.transcript}
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate mt-1">
                          {event.title}
                        </p>
                        {/* Update content */}
                        {event.type === 'update' && event.content && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                            {event.content}
                          </p>
                        )}
                        {/* Meeting summary */}
                        {event.type === 'meeting' && event.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {event.summary}
                          </p>
                        )}
                        {/* Creative inline media preview */}
                        {(event.type === 'creative_approved' || event.type === 'creative_launched') && event.fileUrl && (
                          <div className="mt-2">
                            {event.creativeType === 'video' ? (
                              <video
                                src={event.fileUrl}
                                controls
                                className="rounded-md max-h-48 w-auto border border-border"
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={event.fileUrl}
                                alt={event.title}
                                className="rounded-md max-h-48 w-auto border border-border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(event.fileUrl, '_blank')}
                              />
                            )}
                          </div>
                        )}
                        {/* Status changes */}
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
                      </>
                    )}

                    {event.changedBy && (
                      <p className={cn(
                        "text-xs mt-0.5",
                        event.type === 'update' ? 'text-muted-foreground/70 mt-1' : 'text-muted-foreground'
                      )}>
                        {event.type === 'update' ? `— ${event.changedBy}` : `by ${event.changedBy}`}
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
      )}

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
