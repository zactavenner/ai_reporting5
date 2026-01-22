import { useState, useRef } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FileText,
  Clock,
  User,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Task,
  useUpdateTask,
  useDeleteTask,
  useTaskComments,
  useTaskFiles,
  useTaskHistory,
  useAddTaskComment,
  useUploadTaskFile,
} from '@/hooks/useTasks';

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName?: string;
}

export function TaskDetailModal({ task, open, onOpenChange, clientName }: TaskDetailModalProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: comments = [] } = useTaskComments(task?.id);
  const { data: files = [] } = useTaskFiles(task?.id);
  const { data: history = [] } = useTaskHistory(task?.id);
  const addComment = useAddTaskComment();
  const uploadFile = useUploadTaskFile();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('todo');
  const [dueDate, setDueDate] = useState<Date>();
  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize form when task changes
  useState(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority);
      setStatus(task.status);
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    }
  });
  
  if (!task) return null;
  
  const handleSave = async () => {
    await updateTask.mutateAsync({
      id: task.id,
      title,
      description: description || null,
      priority,
      status,
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
      authorName: 'Agency',
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
      uploadedBy: 'Agency',
    });
    
    e.target.value = '';
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
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {isEditing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-semibold"
                />
              ) : (
                <span>{task.title}</span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant={getPriorityColor(task.priority)}>{task.priority}</Badge>
              <Badge variant={getStatusColor(task.status)}>{task.status.replace('_', ' ')}</Badge>
            </div>
          </div>
          {clientName && (
            <p className="text-sm text-muted-foreground">Client: {clientName}</p>
          )}
        </DialogHeader>
        
        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comments">
              Comments ({comments.length})
            </TabsTrigger>
            <TabsTrigger value="files">
              Files ({files.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({history.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="flex-1 overflow-auto">
            <div className="space-y-4 p-1">
              <div>
                <Label>Description</Label>
                {isEditing ? (
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Add a description..."
                  />
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    {task.description || 'No description'}
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
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
                        {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
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
                    {task.due_date ? format(new Date(task.due_date), 'PPP') : 'No due date'}
                  </p>
                )}
              </div>
              
              <div className="flex justify-between pt-4 border-t">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateTask.isPending}>
                      {updateTask.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                )}
                <Button 
                  variant="destructive" 
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
          </TabsContent>
          
          <TabsContent value="comments" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No comments yet
                  </p>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{comment.author_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.created_at), 'PPp')}
                        </span>
                      </div>
                      <p className="text-sm">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="flex gap-2 pt-4 border-t">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
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
          </TabsContent>
          
          <TabsContent value="files" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-2">
                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No files uploaded
                  </p>
                ) : (
                  files.map(file => (
                    <a
                      key={file.id}
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="flex-1 truncate text-sm">{file.file_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(file.created_at), 'PP')}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="pt-4 border-t">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadFile.isPending}
                className="w-full"
              >
                {uploadFile.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload File
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="history" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-3">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No history yet
                  </p>
                ) : (
                  history.map(item => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="rounded-full p-1.5 bg-muted">
                        {item.action === 'completed' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : item.action === 'assigned' ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p>
                          <span className="font-medium">{item.action}</span>
                          {item.old_value && item.new_value && (
                            <span className="text-muted-foreground">
                              {' '}from {item.old_value} to {item.new_value}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), 'PPp')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
