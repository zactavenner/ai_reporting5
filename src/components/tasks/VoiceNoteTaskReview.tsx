 import { useState, useMemo, useEffect } from 'react';
 import { Check, X, CalendarIcon, User, Building2, Loader2, Mic } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { Label } from '@/components/ui/label';
 import { Badge } from '@/components/ui/badge';
 import { Calendar } from '@/components/ui/calendar';
 import {
   Popover,
   PopoverContent,
   PopoverTrigger,
 } from '@/components/ui/popover';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
   SelectGroup,
   SelectLabel,
 } from '@/components/ui/select';
 import { format, parse, isValid } from 'date-fns';
 import { cn } from '@/lib/utils';
 import { useAgencyPods } from '@/hooks/useAgencyPods';
 import { useAgencyMembers } from '@/hooks/useTasks';
 
 interface ExtractedTaskData {
   title: string;
   description: string;
   priority: 'low' | 'medium' | 'high';
   suggestedAssignee: string | null;
   suggestedAssigneeType: 'member' | 'pod' | null;
   dueDate: string | null;
   dueDateReason?: string;
 }
 
 interface VoiceNoteTaskReviewProps {
   transcript: string;
   extracted: ExtractedTaskData | null;
   audioUrl: string;
   duration: number;
   onConfirm: (taskData: {
     title: string;
     description: string;
     priority: string;
     dueDate: Date | null;
     assignedTo: string;
     assignedPodId: string;
   }) => void;
   onCancel: () => void;
   isSubmitting?: boolean;
 }
 
 export function VoiceNoteTaskReview({
   transcript,
   extracted,
   audioUrl,
   duration,
   onConfirm,
   onCancel,
   isSubmitting = false,
 }: VoiceNoteTaskReviewProps) {
   const { data: agencyMembers = [] } = useAgencyMembers();
   const { data: pods = [] } = useAgencyPods();
 
   // Form state initialized from extracted data
   const [title, setTitle] = useState(extracted?.title || '');
   const [description, setDescription] = useState(extracted?.description || '');
   const [priority, setPriority] = useState(extracted?.priority || 'medium');
   const [dueDate, setDueDate] = useState<Date | undefined>(() => {
     if (extracted?.dueDate) {
       const parsed = parse(extracted.dueDate, 'yyyy-MM-dd', new Date());
       return isValid(parsed) ? parsed : undefined;
     }
     return undefined;
   });
   const [assignedTo, setAssignedTo] = useState('');
   const [selectedPodId, setSelectedPodId] = useState('');
 
   // Try to match suggested assignee to actual members/pods
   useEffect(() => {
     if (extracted?.suggestedAssignee && extracted?.suggestedAssigneeType) {
       if (extracted.suggestedAssigneeType === 'pod') {
         const matchedPod = pods.find(p => 
           p.name.toLowerCase().includes(extracted.suggestedAssignee!.toLowerCase()) ||
           extracted.suggestedAssignee!.toLowerCase().includes(p.name.toLowerCase())
         );
         if (matchedPod) {
           setSelectedPodId(matchedPod.id);
         }
       } else if (extracted.suggestedAssigneeType === 'member') {
         const matchedMember = agencyMembers.find(m =>
           m.name.toLowerCase().includes(extracted.suggestedAssignee!.toLowerCase()) ||
           extracted.suggestedAssignee!.toLowerCase().includes(m.name.toLowerCase())
         );
         if (matchedMember) {
           setAssignedTo(matchedMember.name);
         }
       }
     }
   }, [extracted, pods, agencyMembers]);
 
   // Group members by pod
   const membersByPod = useMemo(() => {
     const grouped: Record<string, typeof agencyMembers> = { unassigned: [] };
     pods.forEach(pod => { grouped[pod.id] = []; });
     
     agencyMembers.forEach(member => {
       const podId = member.pod_id || 'unassigned';
       if (!grouped[podId]) grouped[podId] = [];
       grouped[podId].push(member);
     });
     
     return grouped;
   }, [agencyMembers, pods]);
 
   const getMembersForPod = (podId: string) => {
     return agencyMembers.filter(m => m.pod_id === podId);
   };
 
   const handleConfirm = () => {
     onConfirm({
       title: title.trim() || 'Voice Note Task',
       description: description.trim(),
       priority,
       dueDate: dueDate || null,
       assignedTo,
       assignedPodId: selectedPodId,
     });
   };
 
   const formatTime = (seconds: number) => {
     const mins = Math.floor(seconds / 60);
     const secs = seconds % 60;
     return `${mins}:${secs.toString().padStart(2, '0')}`;
   };
 
   return (
     <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           <Mic className="h-4 w-4 text-primary" />
           <span className="text-sm font-medium">Review Voice Task</span>
           <Badge variant="outline" className="text-xs">{formatTime(duration)}</Badge>
         </div>
         <Button variant="ghost" size="sm" onClick={onCancel}>
           <X className="h-4 w-4" />
         </Button>
       </div>
 
       {/* Transcript preview */}
       <div className="p-3 bg-background rounded border text-sm text-muted-foreground">
         <p className="font-medium text-xs mb-1">Transcript:</p>
         <p className="italic">"{transcript.slice(0, 200)}{transcript.length > 200 ? '...' : ''}"</p>
       </div>
 
       {/* Editable task fields */}
       <div className="space-y-3">
         <div>
           <Label className="text-xs">Task Title</Label>
           <Input
             value={title}
             onChange={(e) => setTitle(e.target.value)}
             placeholder="Enter task title"
             className="mt-1"
           />
         </div>
 
         <div>
           <Label className="text-xs">Description</Label>
           <Textarea
             value={description}
             onChange={(e) => setDescription(e.target.value)}
             placeholder="Add description..."
             rows={2}
             className="mt-1"
           />
         </div>
 
         <div className="grid grid-cols-2 gap-3">
           <div>
             <Label className="text-xs">Priority</Label>
             <Select value={priority} onValueChange={(v: 'low' | 'medium' | 'high') => setPriority(v)}>
               <SelectTrigger className="mt-1">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="low">
                   <Badge variant="outline" className="text-xs">Low</Badge>
                 </SelectItem>
                 <SelectItem value="medium">
                   <Badge variant="secondary" className="text-xs">Medium</Badge>
                 </SelectItem>
                 <SelectItem value="high">
                   <Badge variant="destructive" className="text-xs">High</Badge>
                 </SelectItem>
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <Label className="text-xs">
               Due Date
               {extracted?.dueDateReason && (
                 <span className="text-muted-foreground ml-1">({extracted.dueDateReason})</span>
               )}
             </Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button
                   variant="outline"
                   className={cn(
                     'w-full justify-start text-left font-normal mt-1',
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
           </div>
         </div>
 
         <div>
           <Label className="text-xs">
             Assign To
             {extracted?.suggestedAssignee && (
               <span className="text-muted-foreground ml-1">(suggested: {extracted.suggestedAssignee})</span>
             )}
           </Label>
           <Select 
             value={selectedPodId ? `pod:${selectedPodId}` : (assignedTo || 'none')} 
             onValueChange={(v) => { 
               if (v === 'none') {
                 setAssignedTo('');
                 setSelectedPodId('');
               } else if (v.startsWith('pod:')) {
                 setSelectedPodId(v.replace('pod:', ''));
                 setAssignedTo('');
               } else {
                 setAssignedTo(v);
                 setSelectedPodId('');
               }
             }}
           >
             <SelectTrigger className="mt-1">
               <SelectValue placeholder="Select assignee..." />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="none">Unassigned</SelectItem>
               
               <SelectGroup>
                 <SelectLabel className="text-xs text-muted-foreground">Teams</SelectLabel>
                 {pods.map(pod => {
                   const memberCount = getMembersForPod(pod.id).length;
                   return (
                     <SelectItem key={`pod:${pod.id}`} value={`pod:${pod.id}`}>
                       <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pod.color || '#888' }} />
                         <Building2 className="h-3 w-3" />
                         <span>{pod.name}</span>
                         <Badge variant="outline" className="text-xs ml-1">{memberCount}</Badge>
                       </div>
                     </SelectItem>
                   );
                 })}
               </SelectGroup>
               
               {pods.map(pod => {
                 const podMembers = membersByPod[pod.id] || [];
                 if (podMembers.length === 0) return null;
                 return (
                   <SelectGroup key={pod.id}>
                     <SelectLabel className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pod.color }} />
                       {pod.name}
                     </SelectLabel>
                     {podMembers.map(member => (
                       <SelectItem key={member.id} value={member.name}>
                         <div className="flex items-center gap-2 pl-4">
                           <User className="h-3 w-3" />
                           <span>{member.name}</span>
                         </div>
                       </SelectItem>
                     ))}
                   </SelectGroup>
                 );
               })}
             </SelectContent>
           </Select>
         </div>
       </div>
 
       {/* Action buttons */}
       <div className="flex justify-end gap-2 pt-2">
         <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
           Cancel
         </Button>
         <Button size="sm" onClick={handleConfirm} disabled={!title.trim() || isSubmitting}>
           {isSubmitting ? (
             <Loader2 className="h-4 w-4 animate-spin mr-2" />
           ) : (
             <Check className="h-4 w-4 mr-2" />
           )}
           Create Task
         </Button>
       </div>
     </div>
   );
 }