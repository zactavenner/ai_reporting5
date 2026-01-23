import { useState, useMemo } from 'react';
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  MoreHorizontal, 
  Calendar as CalendarIcon,
  User,
  Paperclip,
  MessageSquare,
  Search,
  Filter,
  CheckCircle2,
  Eye,
  EyeOff,
  Building2,
  Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Task, useUpdateTask, useAgencyMembers, AgencyMember } from '@/hooks/useTasks';
import { Client } from '@/hooks/useClients';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateTaskModal } from './CreateTaskModal';
import { KanbanColumn } from './KanbanColumn';
import { KanbanTaskCard } from './KanbanTaskCard';
import { format, isToday, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

interface KanbanBoardProps {
  tasks: Task[];
  clients: Client[];
  clientId?: string;
  isPublicView?: boolean;
}

const STAGES = [
  { id: 'todo', label: 'To-Do', color: 'bg-blue-500/20' },
  { id: 'stuck', label: 'Stuck', color: 'bg-destructive/20' },
  { id: 'review', label: 'Review', color: 'bg-purple-500/20' },
  { id: 'revisions', label: 'Revisions', color: 'bg-amber-500/20' },
  { id: 'done', label: 'Completed', color: 'bg-green-500/20' },
];

export function KanbanBoard({ tasks, clients, clientId, isPublicView = false }: KanbanBoardProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createTaskStage, setCreateTaskStage] = useState('todo');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>('');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>('');
  
  const updateTask = useUpdateTask();
  const { data: agencyMembers = [] } = useAgencyMembers();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    
    // Filter by client - use prop clientId if provided, otherwise use filter dropdown
    const effectiveClientId = clientId || (filterClientId && filterClientId !== 'all' ? filterClientId : '');
    if (effectiveClientId) {
      filtered = filtered.filter(t => t.client_id === effectiveClientId);
    }
    
    // Filter by assignee
    if (filterAssigneeId && filterAssigneeId !== 'all') {
      filtered = filtered.filter(t => t.assigned_to === filterAssigneeId);
    }
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }
    
    // Filter completed
    if (!showCompleted) {
      filtered = filtered.filter(t => t.status !== 'completed');
    }
    
    return filtered;
  }, [tasks, clientId, filterClientId, filterAssigneeId, searchQuery, showCompleted]);

  // Group by stage
  const tasksByStage = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    STAGES.forEach(stage => {
      grouped[stage.id] = filteredTasks.filter(t => t.stage === stage.id);
    });
    return grouped;
  }, [filteredTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = filteredTasks.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    
    const { active, over } = event;
    if (!over) return;
    
    const taskId = active.id as string;
    const overId = over.id as string;
    
    // Check if dropped on a stage column
    const targetStage = STAGES.find(s => s.id === overId);
    
    if (targetStage) {
      const task = filteredTasks.find(t => t.id === taskId);
      if (task && task.stage !== targetStage.id) {
        await updateTask.mutateAsync({
          id: taskId,
          stage: targetStage.id,
          status: targetStage.id === 'done' ? 'completed' : task.status === 'completed' ? 'in_progress' : task.status,
          completed_at: targetStage.id === 'done' ? new Date().toISOString() : null,
        });
      }
    }
  };

  const handleAddTask = (stageId: string) => {
    setCreateTaskStage(stageId);
    setShowCreateTask(true);
  };

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const memberMap = useMemo(() => {
    const map: Record<string, AgencyMember> = {};
    agencyMembers.forEach(m => { map[m.id] = m; });
    return map;
  }, [agencyMembers]);

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="pl-9 w-48 md:w-64"
              />
            </div>
            
            {/* Client Filter - only show if not in public view and not already filtered by clientId prop */}
            {!clientId && !isPublicView && (
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger className="w-40">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Assignee Filter - hide in public view */}
            {!isPublicView && (
              <Select value={filterAssigneeId} onValueChange={setFilterAssigneeId}>
                <SelectTrigger className="w-40">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {agencyMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {showCompleted ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Hide Completed
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Show Completed
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => handleAddTask('todo')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Kanban Board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                tasks={tasksByStage[stage.id]}
                clientMap={clientMap}
                memberMap={memberMap}
                onAddTask={() => handleAddTask(stage.id)}
                onTaskClick={setSelectedTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && (
              <KanbanTaskCard
                task={activeTask}
                clientName={activeTask.client_id ? clientMap[activeTask.client_id] : undefined}
                assignee={activeTask.assigned_to ? memberMap[activeTask.assigned_to] : undefined}
                isDragging
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        clientName={selectedTask?.client_id ? clientMap[selectedTask.client_id] : undefined}
      />

      <CreateTaskModal
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        clients={clients}
        defaultClientId={clientId}
      />
    </>
  );
}
