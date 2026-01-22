import { useState, useEffect } from 'react';
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
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Loader2, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCreateTask, useAgencyMembers, AgencyMember } from '@/hooks/useTasks';
import { Client } from '@/hooks/useClients';
import { Badge } from '@/components/ui/badge';

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  defaultClientId?: string;
}

export function CreateTaskModal({ open, onOpenChange, clients, defaultClientId }: CreateTaskModalProps) {
  const createTask = useCreateTask();
  const { data: agencyMembers = [] } = useAgencyMembers();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState<Date>();
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedClientName, setAssignedClientName] = useState('');
  const [stage, setStage] = useState('backlog');
  
  useEffect(() => {
    if (defaultClientId) {
      setClientId(defaultClientId);
    }
  }, [defaultClientId]);
  
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
    });
    
    // Reset form
    setTitle('');
    setDescription('');
    setClientId(defaultClientId || '');
    setPriority('medium');
    setDueDate(undefined);
    setAssignedTo('');
    setAssignedClientName('');
    setStage('backlog');
    onOpenChange(false);
  };

  // Get selected client name for the client assignment option
  const selectedClient = clients.find(c => c.id === clientId);
  
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
              <Label>Due Date</Label>
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
                  {agencyMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span>{member.name}</span>
                        <Badge variant="outline" className="text-xs ml-1">Agency</Badge>
                      </div>
                    </SelectItem>
                  ))}
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
