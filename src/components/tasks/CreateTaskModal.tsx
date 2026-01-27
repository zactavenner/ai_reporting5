import { useState, useEffect, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Loader2, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn, addBusinessDays } from '@/lib/utils';
import { useCreateTask, useAgencyMembers, AgencyMember } from '@/hooks/useTasks';
import { useAgencyPods } from '@/hooks/useAgencyPods';
import { Client } from '@/hooks/useClients';
import { Badge } from '@/components/ui/badge';
import { useTeamMember } from '@/contexts/TeamMemberContext';

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  defaultClientId?: string;
}

export function CreateTaskModal({ open, onOpenChange, clients, defaultClientId }: CreateTaskModalProps) {
  const createTask = useCreateTask();
  const { data: agencyMembers = [] } = useAgencyMembers();
  const { data: pods = [] } = useAgencyPods();
  const { currentMember } = useTeamMember();
  
  // Calculate default due date (2 business days from today)
  const defaultDueDate = useMemo(() => addBusinessDays(new Date(), 2), []);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(defaultDueDate);
  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedClientName, setAssignedClientName] = useState('');
  const [stage, setStage] = useState('todo');
  
  useEffect(() => {
    if (defaultClientId) {
      setClientId(defaultClientId);
    }
  }, [defaultClientId]);
  
  // Reset due date when modal opens
  useEffect(() => {
    if (open) {
      const newDefaultDate = addBusinessDays(new Date(), 2);
      setDueDate(newDefaultDate);
      setDueDateManuallySet(false);
    }
  }, [open]);
  
  const handleCreate = async () => {
    if (!title.trim()) return;
    
    await createTask.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      client_id: clientId || null,
      priority,
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
      status: 'todo',
      stage,
      assigned_to: assignedTo || null,
      assigned_client_name: assignedClientName || null,
      created_by: currentMember?.name || null,
    });
    
    // Reset form
    setTitle('');
    setDescription('');
    setClientId(defaultClientId || '');
    setPriority('medium');
    setDueDate(addBusinessDays(new Date(), 2));
    setDueDateManuallySet(false);
    setAssignedTo('');
    setAssignedClientName('');
    setStage('todo');
    onOpenChange(false);
  };

  // Get selected client name for the client assignment option
  const selectedClient = clients.find(c => c.id === clientId);

  // Group members by pod
  const membersByPod = useMemo(() => {
    const grouped: Record<string, AgencyMember[]> = { unassigned: [] };
    pods.forEach(pod => { grouped[pod.id] = []; });
    
    agencyMembers.forEach(member => {
      const podId = member.pod_id || 'unassigned';
      if (!grouped[podId]) grouped[podId] = [];
      grouped[podId].push(member);
    });
    
    return grouped;
  }, [agencyMembers, pods]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add task description..."
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Client</Label>
              <Select value={clientId || 'none'} onValueChange={(v) => setClientId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Low</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Medium</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">High</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="todo">To-Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>
                Due Date
                {!dueDateManuallySet && dueDate && (
                  <span className="text-xs text-muted-foreground ml-2">(auto: 2 business days)</span>
                )}
              </Label>
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
                    onSelect={(date) => {
                      setDueDate(date);
                      setDueDateManuallySet(true);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Assignment Section */}
          <div>
            <Label>Assign To</Label>
            <div className="space-y-2">
              <Select value={assignedTo || 'none'} onValueChange={(v) => { setAssignedTo(v === 'none' ? '' : v); setAssignedClientName(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agency member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
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
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-2 pl-4">
                              <User className="h-3 w-3" />
                              <span>{member.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                  {membersByPod.unassigned?.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Unassigned Members</SelectLabel>
                      {membersByPod.unassigned.map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2 pl-4">
                            <User className="h-3 w-3" />
                            <span>{member.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              
              {selectedClient && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Or assign to client:</span>
                  <Input
                    value={assignedClientName}
                    onChange={(e) => { setAssignedClientName(e.target.value); setAssignedTo(''); }}
                    placeholder={`${selectedClient.name} contact...`}
                    className="flex-1 h-8 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={!title.trim() || createTask.isPending}
            >
              {createTask.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
