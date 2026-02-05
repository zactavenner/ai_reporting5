 import { useState, useRef, useEffect, useMemo } from 'react';
 import {
   Sheet,
   SheetContent,
   SheetHeader,
   SheetTitle,
 } from '@/components/ui/sheet';
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
   Trash2,
   Send,
   CheckCircle2,
   Video,
   ExternalLink,
   Mic,
   Paperclip,
   MessageSquare,
   History,
   Plus,
   FileUp,
   Link,
   Copy,
 } from 'lucide-react';
 import { format } from 'date-fns';
 import { cn, addBusinessDays } from '@/lib/utils';
 import {
   Task,
   TaskComment,
   TaskHistory,
   TaskFile,
   useUpdateTask,
   useDeleteTask,
   useTaskComments,
   useTaskFiles,
   useTaskHistory,
   useAddTaskComment,
   useUploadTaskFile,
   useAddTaskHistory,
   useAgencyMembers,
 } from '@/hooks/useTasks';
 import { useMeetings } from '@/hooks/useMeetings';
 import { useTeamMember } from '@/contexts/TeamMemberContext';
 import { useTaskFileReview } from '@/hooks/useTaskFileReview';
 import { TaskDiscussionVoiceNote, VoiceNotePlayer } from './TaskDiscussionVoiceNote';
 import { FilePreviewLightbox, MiniThumbnail } from './FilePreviewLightbox';
 import { InlineFilePreview } from './InlineFilePreview';
 import { SendToCreativeModal } from './SendToCreativeModal';
 import { MultiAssigneeSelector } from './MultiAssigneeSelector';
 import { toast } from 'sonner';
 
 interface TaskDetailPanelProps {
   task: Task | null;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   clientName?: string;
   clientId?: string;
   isPublicView?: boolean;
 }
 
 type TimelineEntry = 
   | { type: 'comment'; data: TaskComment; timestamp: Date }
   | { type: 'history'; data: TaskHistory; timestamp: Date };
 
 const STAGES = [
   { id: 'client_tasks', label: 'Client Tasks' },
   { id: 'todo', label: 'To Do' },
   { id: 'stuck', label: 'Stuck' },
   { id: 'review', label: 'Review' },
   { id: 'revisions', label: 'Revisions' },
   { id: 'done', label: 'Completed' },
 ];
 
 export function TaskDetailPanel({ task, open, onOpenChange, clientName, clientId, isPublicView = false }: TaskDetailPanelProps) {
   const updateTask = useUpdateTask();
   const deleteTask = useDeleteTask();
   const addHistory = useAddTaskHistory();
   const { data: comments = [] } = useTaskComments(task?.id);
   const { data: files = [] } = useTaskFiles(task?.id);
   const { data: history = [] } = useTaskHistory(task?.id);
   const { data: meetings = [] } = useMeetings();
   const { data: agencyMembers = [] } = useAgencyMembers();
   const addComment = useAddTaskComment();
   const uploadFile = useUploadTaskFile();
   const { currentMember } = useTeamMember();
   const { reviewFile, isReviewing, reviewingFileId } = useTaskFileReview();
   
   const [isEditingDescription, setIsEditingDescription] = useState(false);
   const [editedDescription, setEditedDescription] = useState('');
   const [newComment, setNewComment] = useState('');
   const [lightboxOpen, setLightboxOpen] = useState(false);
   const [selectedFileIndex, setSelectedFileIndex] = useState(0);
   const [inlineFileIndex, setInlineFileIndex] = useState(0);
   const [sendToCreativeOpen, setSendToCreativeOpen] = useState(false);
   const [selectedFileForCreative, setSelectedFileForCreative] = useState<TaskFile | null>(null);
   
   const fileInputRef = useRef<HTMLInputElement>(null);
   const discussionFileInputRef = useRef<HTMLInputElement>(null);
   
   const memberLookup = useMemo(() => {
     const lookup: Record<string, { name: string; podName?: string }> = {};
     agencyMembers.forEach(m => {
       lookup[m.name] = { name: m.name, podName: m.pod?.name };
     });
     return lookup;
   }, [agencyMembers]);
   
   const timeline = useMemo<TimelineEntry[]>(() => {
     const entries: TimelineEntry[] = [
       ...comments.map(c => ({ type: 'comment' as const, data: c, timestamp: new Date(c.created_at) })),
       ...history.map(h => ({ type: 'history' as const, data: h, timestamp: new Date(h.created_at) })),
     ];
     return entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
   }, [comments, history]);
   
   const getAuthorName = () => {
     if (isPublicView) return task?.assigned_client_name || 'Client';
     return currentMember?.name || 'Agency';
   };
   
   const getDisplayAuthorName = (authorName: string) => {
     if (!isPublicView) return authorName;
     const member = memberLookup[authorName];
     if (member?.podName) return `${member.podName} Team`;
     return authorName;
   };
   
   useEffect(() => {
     if (task) {
       setEditedDescription(task.description || '');
       setInlineFileIndex(0);
     }
   }, [task]);
   
   useEffect(() => {
     if (inlineFileIndex >= files.length && files.length > 0) {
       setInlineFileIndex(files.length - 1);
     }
   }, [files.length, inlineFileIndex]);
   
   if (!task) return null;
   
   const resolvedClientId = clientId || task.client_id;
   
   const handleCopyTaskUrl = () => {
     const baseUrl = window.location.origin;
     const taskUrl = isPublicView
       ? `${baseUrl}/public/${window.location.pathname.split('/')[2]}?task=${task.id}`
       : `${baseUrl}/client/${task.client_id}?task=${task.id}`;
     navigator.clipboard.writeText(taskUrl);
     toast.success('Task link copied to clipboard!');
   };
   
   const handleStatusChange = async (newStatus: string) => {
     const oldStage = task.stage;
     const isCompleting = newStatus === 'done';
     
     await addHistory.mutateAsync({
       taskId: task.id,
       action: isCompleting ? 'completed' : 'status_changed',
       oldValue: STAGES.find(s => s.id === oldStage)?.label || oldStage,
       newValue: STAGES.find(s => s.id === newStatus)?.label || newStatus,
       changedBy: getAuthorName(),
     });
     
     await updateTask.mutateAsync({
       id: task.id,
       stage: newStatus,
       status: newStatus === 'done' ? 'completed' : newStatus === 'todo' ? 'todo' : 'in_progress',
       completed_at: isCompleting ? new Date().toISOString() : null,
     });
   };
   
   const handlePriorityChange = async (newPriority: string) => {
     await addHistory.mutateAsync({
       taskId: task.id,
       action: 'priority_changed',
       oldValue: task.priority,
       newValue: newPriority,
       changedBy: getAuthorName(),
     });
     await updateTask.mutateAsync({ id: task.id, priority: newPriority });
   };
   
   const handleDueDateChange = async (newDate: Date | undefined) => {
     await addHistory.mutateAsync({
       taskId: task.id,
       action: 'due_date_changed',
       oldValue: task.due_date ? format(new Date(task.due_date), 'PP') : 'No date',
       newValue: newDate ? format(newDate, 'PP') : 'No date',
       changedBy: getAuthorName(),
     });
     await updateTask.mutateAsync({
       id: task.id,
       due_date: newDate ? format(newDate, 'yyyy-MM-dd') : null,
     });
   };
   
   const handleDescriptionSave = async () => {
     if (editedDescription !== task.description) {
       await addHistory.mutateAsync({
         taskId: task.id,
         action: 'description_updated',
         oldValue: task.description ? 'Previous description' : 'No description',
         newValue: editedDescription ? 'Updated description' : 'Removed description',
         changedBy: getAuthorName(),
       });
       await updateTask.mutateAsync({ id: task.id, description: editedDescription || null });
     }
     setIsEditingDescription(false);
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
     const authorName = getAuthorName();
     await uploadFile.mutateAsync({ taskId: task.id, file, uploadedBy: authorName });
     await addHistory.mutateAsync({
       taskId: task.id,
       action: 'file_uploaded',
       newValue: file.name,
       changedBy: authorName,
     });
     e.target.value = '';
   };
   
   const openLightbox = (index: number) => {
     setSelectedFileIndex(index);
     setLightboxOpen(true);
   };
   
   const handleSendToCreative = (file: TaskFile) => {
     setSelectedFileForCreative(file);
     setSendToCreativeOpen(true);
   };
   
   const handleAIReview = async (file: TaskFile) => {
     if (!task) return;
     await reviewFile(file, task.id, getAuthorName());
   };
   
   const getPriorityColor = (p: string) => {
     switch (p) {
       case 'high': return 'destructive';
       case 'medium': return 'secondary';
       case 'low': return 'outline';
       default: return 'secondary';
     }
   };
   
   const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
   
   const getHistoryIcon = (action: string) => {
     switch (action) {
       case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
       case 'created': return <Plus className="h-4 w-4 text-blue-500" />;
       case 'file_uploaded': return <Paperclip className="h-4 w-4 text-muted-foreground" />;
       case 'ai_review': return <CheckCircle2 className="h-4 w-4 text-purple-500" />;
       default: return <History className="h-4 w-4 text-muted-foreground" />;
     }
   };
   
   const formatHistoryAction = (entry: TaskHistory) => {
     switch (entry.action) {
       case 'created': return <span>Task created</span>;
       case 'completed': return <span className="text-green-600">Task completed</span>;
       case 'status_changed':
         return <span>Status: <span className="font-medium">{entry.old_value}</span> → <span className="font-medium">{entry.new_value}</span></span>;
       case 'priority_changed':
         return <span>Priority: <span className="font-medium">{entry.old_value}</span> → <span className="font-medium">{entry.new_value}</span></span>;
       case 'due_date_changed':
         return <span>Due date: <span className="font-medium">{entry.old_value}</span> → <span className="font-medium">{entry.new_value}</span></span>;
       case 'description_updated': return <span>Description updated</span>;
       case 'file_uploaded': return <span>Uploaded: <span className="font-medium">{entry.new_value}</span></span>;
       case 'ai_review': return <span>AI reviewed: <span className="font-medium">{entry.new_value}</span></span>;
       default: return <span>{entry.action}</span>;
     }
   };
   
   const linkedMeeting = task.meeting_id ? meetings.find(m => m.id === task.meeting_id) : null;
   
   return (
     <>
       <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
           <SheetHeader className="p-6 pb-4 border-b flex-shrink-0">
             <div className="flex items-start justify-between gap-4">
               <div className="flex-1 min-w-0">
                 <SheetTitle className="text-lg font-semibold leading-tight">
                   {task.title}
                 </SheetTitle>
                 {clientName && (
                   <p className="text-sm text-muted-foreground mt-1">Client: {clientName}</p>
                 )}
               </div>
              <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyTaskUrl}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </Button>
                  <Button
                    variant={task.stage === 'done' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => handleStatusChange(task.stage === 'done' ? 'todo' : 'done')}
                    className={task.stage !== 'done' ? 'border-success/50 text-success hover:bg-success/10' : ''}
                    disabled={updateTask.isPending}
                  >
                    {updateTask.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    {task.stage === 'done' ? 'Reopen' : 'Complete'}
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteTask.isPending}
                  >
                    {deleteTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
             </div>
             
             {linkedMeeting && (
               <div className="flex items-center gap-2 mt-2">
                 <Video className="h-4 w-4 text-muted-foreground" />
                 <span className="text-sm text-muted-foreground">From meeting:</span>
                 {linkedMeeting.meetgeek_url ? (
                   <a href={linkedMeeting.meetgeek_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                     {linkedMeeting.title} <ExternalLink className="h-3 w-3" />
                   </a>
                 ) : (
                   <span className="text-sm">{linkedMeeting.title}</span>
                 )}
               </div>
             )}
             
             <div className="space-y-4 pt-4">
               <div>
                 <Label className="text-xs text-muted-foreground">Description</Label>
                 {isEditingDescription ? (
                   <Textarea
                     value={editedDescription}
                     onChange={(e) => setEditedDescription(e.target.value)}
                     onBlur={handleDescriptionSave}
                     onKeyDown={(e) => {
                       if (e.key === 'Escape') {
                         setEditedDescription(task.description || '');
                         setIsEditingDescription(false);
                       }
                     }}
                     rows={3}
                     placeholder="Add a description..."
                     className="mt-1"
                     autoFocus
                   />
                 ) : (
                   <p onClick={() => setIsEditingDescription(true)} className="text-sm mt-1 cursor-pointer hover:bg-muted/50 rounded p-2 -mx-2 transition-colors min-h-[40px]">
                     {task.description || <span className="text-muted-foreground italic">Click to add description...</span>}
                   </p>
                 )}
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label className="text-xs text-muted-foreground">Status</Label>
                   <Select value={task.stage} onValueChange={handleStatusChange}>
                     <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       {STAGES.map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label className="text-xs text-muted-foreground">Priority</Label>
                   <Select value={task.priority} onValueChange={handlePriorityChange}>
                     <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="low"><Badge variant="outline" className="text-xs">Low</Badge></SelectItem>
                       <SelectItem value="medium"><Badge variant="secondary" className="text-xs">Medium</Badge></SelectItem>
                       <SelectItem value="high"><Badge variant="destructive" className="text-xs">High</Badge></SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label className="text-xs text-muted-foreground">Assigned To</Label>
                   <div className="mt-1"><MultiAssigneeSelector taskId={task.id} isPublicView={isPublicView} /></div>
                 </div>
                 <div>
                   <Label className="text-xs text-muted-foreground">Due Date</Label>
                   <Popover>
                     <PopoverTrigger asChild>
                       <Button variant="outline" className={cn('w-full justify-start text-left font-normal mt-1 h-9', !task.due_date && 'text-muted-foreground')}>
                         <CalendarIcon className="mr-2 h-4 w-4" />
                         {task.due_date ? format(new Date(task.due_date), 'PP') : 'Pick date'}
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0" align="start">
                       <Calendar mode="single" selected={task.due_date ? new Date(task.due_date) : undefined} onSelect={handleDueDateChange} initialFocus className="pointer-events-auto" />
                     </PopoverContent>
                   </Popover>
                 </div>
               </div>
             </div>
           </SheetHeader>
           
           <ScrollArea className="flex-1 overflow-y-auto">
             <div className="p-6 space-y-6">
               {files.length > 0 && (
                 <div>
                   <div className="flex items-center gap-2 mb-3">
                     <Paperclip className="h-4 w-4 text-muted-foreground" />
                     <span className="text-sm font-medium">Files ({files.length})</span>
                   </div>
                   <InlineFilePreview files={files} currentIndex={inlineFileIndex} onNavigate={setInlineFileIndex} onOpenLightbox={() => openLightbox(inlineFileIndex)} onSendToCreative={handleSendToCreative} onAIReview={handleAIReview} isReviewing={isReviewing} reviewingFileId={reviewingFileId} />
                   {files.length > 1 && (
                     <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                       {files.map((file, index) => (
                         <MiniThumbnail key={file.id} file={file} isActive={index === inlineFileIndex} onClick={() => setInlineFileIndex(index)} />
                       ))}
                       <button onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending} className="w-12 h-12 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-all flex-shrink-0">
                         {uploadFile.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                       </button>
                     </div>
                   )}
                   {files.length === 1 && (
                     <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending} className="mt-3">
                       {uploadFile.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                       Add more files
                     </Button>
                   )}
                 </div>
               )}
               
               {files.length === 0 && (
                 <div>
                   <div className="flex items-center gap-2 mb-3">
                     <Paperclip className="h-4 w-4 text-muted-foreground" />
                     <span className="text-sm font-medium">Files</span>
                   </div>
                   <button onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending} className="w-full h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-all">
                     {uploadFile.isPending ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : (
                       <div className="flex flex-col items-center gap-1 text-muted-foreground">
                         <Plus className="h-6 w-6" />
                         <span className="text-sm">Upload files</span>
                       </div>
                     )}
                   </button>
                 </div>
               )}
               
               <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
               
               <div>
                 <div className="flex items-center gap-2 mb-4">
                   <MessageSquare className="h-4 w-4 text-muted-foreground" />
                   <span className="text-sm font-medium">Activity & Discussion</span>
                 </div>
                 <div className="space-y-4">
                   {timeline.length === 0 ? (
                     <p className="text-sm text-muted-foreground text-center py-6">No activity yet. Start the conversation below.</p>
                   ) : (
                     timeline.map((entry) => (
                       <div key={`${entry.type}-${entry.data.id}`}>
                         {entry.type === 'comment' ? (
                           <div className="flex gap-3">
                             <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                               <span className="text-xs font-medium text-primary">{getInitials(getDisplayAuthorName(entry.data.author_name))}</span>
                             </div>
                             <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-2 flex-wrap">
                                 <span className="font-medium text-sm">{getDisplayAuthorName(entry.data.author_name)}</span>
                                 {entry.data.comment_type === 'voice' && <Badge variant="outline" className="text-xs h-5"><Mic className="h-3 w-3 mr-1" />Voice</Badge>}
                                 <span className="text-xs text-muted-foreground">{format(entry.timestamp, 'MMM d, h:mm a')}</span>
                               </div>
                               {entry.data.comment_type === 'voice' && entry.data.audio_url && (
                                 <div className="mt-2"><VoiceNotePlayer audioUrl={entry.data.audio_url} duration={entry.data.duration_seconds || undefined} transcript={entry.data.transcript} /></div>
                               )}
                               {entry.data.comment_type !== 'voice' && <div className="text-sm mt-1 whitespace-pre-wrap">{entry.data.content}</div>}
                             </div>
                           </div>
                         ) : (
                           <div className="flex gap-3 items-start">
                             <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">{getHistoryIcon(entry.data.action)}</div>
                             <div className="flex-1 min-w-0">
                               <p className="text-sm text-muted-foreground">{formatHistoryAction(entry.data)}{entry.data.changed_by && <span> by {getDisplayAuthorName(entry.data.changed_by)}</span>}</p>
                               <span className="text-xs text-muted-foreground">{format(entry.timestamp, 'MMM d, h:mm a')}</span>
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
           
           <div className="p-4 border-t bg-background flex-shrink-0">
             <div className="flex gap-2">
               <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Post a comment..." onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddComment()} className="flex-1" />
               <Button variant="outline" size="icon" onClick={() => discussionFileInputRef.current?.click()} disabled={uploadFile.isPending}>
                 {uploadFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
               </Button>
               <input type="file" ref={discussionFileInputRef} className="hidden" onChange={handleFileUpload} />
               <TaskDiscussionVoiceNote taskId={task.id} authorName={getAuthorName()} />
               <Button onClick={handleAddComment} disabled={!newComment.trim() || addComment.isPending}>
                 {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
               </Button>
             </div>
           </div>
         </SheetContent>
       </Sheet>
       
       <FilePreviewLightbox files={files} selectedIndex={selectedFileIndex} open={lightboxOpen} onOpenChange={setLightboxOpen} onNavigate={setSelectedFileIndex} onSendToCreative={handleSendToCreative} onAIReview={handleAIReview} isReviewing={isReviewing} reviewingFileId={reviewingFileId} />
       
       {resolvedClientId && (
         <SendToCreativeModal file={selectedFileForCreative} clientId={resolvedClientId} clientName={clientName} open={sendToCreativeOpen} onOpenChange={setSendToCreativeOpen} onSuccess={() => setSelectedFileForCreative(null)} />
       )}
     </>
   );
 }