import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CalendarIcon,
  Loader2,
  Upload,
  Trash2,
  Send,
  Clock,
  User,
  CheckCircle2,
  Video,
  ExternalLink,
  Mic,
  ChevronDown,
  ChevronUp,
  Paperclip,
  MessageSquare,
  History,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Task,
  TaskComment,
  TaskHistory,
  useUpdateTask,
  useDeleteTask,
  useTaskComments,
  useTaskFiles,
  useTaskHistory,
  useAddTaskComment,
  useUploadTaskFile,
} from '@/hooks/useTasks';
import { useMeetings } from '@/hooks/useMeetings';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { TaskDiscussionVoiceNote, VoiceNotePlayer } from './TaskDiscussionVoiceNote';
import { FilePreviewLightbox, FileThumbnail } from './FilePreviewLightbox';

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName?: string;
  isPublicView?: boolean;
}

// Timeline entry types
type TimelineEntry = 
  | { type: 'comment'; data: TaskComment; timestamp: Date }
  | { type: 'history'; data: TaskHistory; timestamp: Date };

export function TaskDetailModal({ task, open, onOpenChange, clientName, isPublicView = false }: TaskDetailModalProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: comments = [] } = useTaskComments(task?.id);
  const { data: files = [] } = useTaskFiles(task?.id);
  const { data: history = [] } = useTaskHistory(task?.id);
  const { data: meetings = [] } = useMeetings();
  const addComment = useAddTaskComment();
  const uploadFile = useUploadTaskFile();
  const { currentMember } = useTeamMember();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('todo');
  const [stage, setStage] = useState('backlog');
  const [dueDate, setDueDate] = useState<Date>();
  const [assignedTo, setAssignedTo] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Unified timeline - merge comments and history, sorted chronologically
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...comments.map(c => ({ 
        type: 'comment' as const, 
        data: c, 
        timestamp: new Date(c.created_at) 
      })),
      ...history.map(h => ({ 
        type: 'history' as const, 
        data: h, 
        timestamp: new Date(h.created_at) 
      })),
    ];
    return entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [comments, history]);
  
  // Get author name based on view type
  const getAuthorName = () => {
    if (isPublicView) {
      return task?.assigned_client_name || 'Client';
    }
    return currentMember?.name || 'Agency';
  };
  
  // Initialize form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority);
      setStatus(task.status);
      setStage(task.stage);
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
      setAssignedTo(task.assigned_to || '');
    }
  }, [task]);
  
  if (!task) return null;
  
  const handleSave = async () => {
    await updateTask.mutateAsync({
      id: task.id,
      title,
      description: description || null,
      priority,
      status,
      stage,
      assigned_to: assignedTo || null,
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    });
    setIsEditing(false);
  };
  
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    await deleteTask.mutateAsync(task.id);
    onOpenChange(false);
  };
  
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({
      taskId: task.id,
      authorName: getAuthorName(),
      content: newComment.trim(),
    });
    setNewComment('');
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    await uploadFile.mutateAsync({
      taskId: task.id,
      file,
      uploadedBy: getAuthorName(),
    });
    
    e.target.value = '';
  };
  
  const openLightbox = (index: number) => {
    setSelectedFileIndex(index);
    setLightboxOpen(true);
  };
  
  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };
  
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'todo': return 'outline';
      default: return 'outline';
    }
  };
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  // Find linked meeting
  const linkedMeeting = task.meeting_id ? meetings.find(m => m.id === task.meeting_id) : null;
  
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {/* Header Section */}
          <DialogHeader className="p-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg font-semibold"
                  />
                ) : (
                  <DialogTitle className="text-lg font-semibold leading-tight">
                    {task.title}
                  </DialogTitle>
                )}
                {clientName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Client: {clientName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={getPriorityColor(task.priority)}>{task.priority}</Badge>
                <Badge variant={getStatusColor(task.status)}>{task.status.replace('_', ' ')}</Badge>
              </div>
            </div>
            
            {/* MeetGeek Reference Link */}
            {linkedMeeting && (
              <div className="flex items-center gap-2 mt-2">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">From meeting:</span>
                {linkedMeeting.meetgeek_url ? (
                  <a 
                    href={linkedMeeting.meetgeek_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {linkedMeeting.title}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-sm">{linkedMeeting.title}</span>
                )}
              </div>
            )}
            
            {/* Collapsible Details Section */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full mt-3 justify-between text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                {showDetails ? 'Hide' : 'Show'} task details
              </span>
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            
            {showDetails && (
              <div className="space-y-4 pt-4 border-t mt-3">
                <div>
                  <Label>Description</Label>
                  {isEditing ? (
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Add a description..."
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {task.description || 'No description'}
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Priority</Label>
                    {isEditing ? (
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm mt-1">
                        <Badge variant={getPriorityColor(task.priority)}>
                          {task.priority}
                        </Badge>
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Status</Label>
                    {isEditing ? (
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm mt-1">
                        <Badge variant={getStatusColor(task.status)}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !dueDate && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dueDate ? format(dueDate, 'PP') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dueDate}
                            onSelect={setDueDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.due_date ? format(new Date(task.due_date), 'PP') : 'No due date'}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-between pt-2">
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={updateTask.isPending}>
                        {updateTask.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      Edit
                    </Button>
                  )}
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteTask.isPending}
                  >
                    {deleteTask.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogHeader>
          
          {/* Scrollable Content */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Files Gallery */}
              {files.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Files ({files.length})</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {files.map((file, index) => (
                      <FileThumbnail
                        key={file.id}
                        file={file}
                        onClick={() => openLightbox(index)}
                      />
                    ))}
                    {/* Upload button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadFile.isPending}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-all flex-shrink-0"
                    >
                      {uploadFile.isPending ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="h-6 w-6 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              )}
              
              {/* Upload area when no files */}
              {files.length === 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Files</span>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadFile.isPending}
                    className="w-full h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-all"
                  >
                    {uploadFile.isPending ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Upload className="h-5 w-5" />
                        <span className="text-sm">Upload files</span>
                      </div>
                    )}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              )}
              
              {/* Discussion Thread */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Discussion</span>
                </div>
                
                <div className="space-y-4">
                  {timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No activity yet. Start the conversation below.
                    </p>
                  ) : (
                    timeline.map((entry, idx) => (
                      <div key={`${entry.type}-${entry.type === 'comment' ? entry.data.id : entry.data.id}`}>
                        {entry.type === 'comment' ? (
                          // Comment entry
                          <div className="flex gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-medium text-primary">
                                {getInitials(entry.data.author_name)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{entry.data.author_name}</span>
                                {entry.data.comment_type === 'voice' && (
                                  <Badge variant="outline" className="text-xs h-5">
                                    <Mic className="h-3 w-3 mr-1" />
                                    Voice
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {format(entry.timestamp, 'MMM d, h:mm a')}
                                </span>
                              </div>
                              {/* Voice Note Player */}
                              {entry.data.comment_type === 'voice' && entry.data.audio_url && (
                                <div className="mt-2">
                                  <VoiceNotePlayer 
                                    audioUrl={entry.data.audio_url} 
                                    duration={entry.data.duration_seconds || undefined} 
                                  />
                                </div>
                              )}
                              {/* Text content */}
                              <p className="text-sm mt-1">
                                {entry.data.comment_type === 'voice' && entry.data.transcript 
                                  ? entry.data.transcript 
                                  : entry.data.content}
                              </p>
                            </div>
                          </div>
                        ) : (
                          // History entry
                          <div className="flex gap-3 items-start">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              {entry.data.action === 'completed' ? (
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                              ) : entry.data.action === 'assigned' ? (
                                <User className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <History className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground">
                                <span className="capitalize">{entry.data.action}</span>
                                {entry.data.old_value && entry.data.new_value && (
                                  <span>
                                    {' '}from <span className="font-medium">{entry.data.old_value}</span> to{' '}
                                    <span className="font-medium">{entry.data.new_value}</span>
                                  </span>
                                )}
                                {entry.data.changed_by && (
                                  <span> by {entry.data.changed_by}</span>
                                )}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {format(entry.timestamp, 'MMM d, h:mm a')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
          
          {/* Comment Input - Fixed at bottom */}
          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Post a comment..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
                className="flex-1"
              />
              <TaskDiscussionVoiceNote 
                taskId={task.id} 
                authorName={getAuthorName()}
              />
              <Button 
                onClick={handleAddComment}
                disabled={!newComment.trim() || addComment.isPending}
              >
                {addComment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* File Lightbox */}
      <FilePreviewLightbox
        files={files}
        selectedIndex={selectedFileIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onNavigate={setSelectedFileIndex}
      />
    </>
  );
}
