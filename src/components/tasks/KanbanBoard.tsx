import { useState, useMemo, useEffect } from 'react';
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
  UserCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Task, useUpdateTask, useAgencyMembers, AgencyMember, useAddTaskHistory } from '@/hooks/useTasks';
import { Client } from '@/hooks/useClients';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateTaskModal } from './CreateTaskModal';
import { KanbanColumn } from './KanbanColumn';
import { KanbanTaskCard } from './KanbanTaskCard';
import { format, isToday, isPast, isTomorrow, isThisWeek, addDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTeamMember } from '@/contexts/TeamMemberContext';

interface KanbanBoardProps {
  tasks: Task[];
  clients: Client[];
  clientId?: string;
  isPublicView?: boolean;
}

const STAGES = [
  { id: 'client_tasks', label: 'Client Tasks', color: 'bg-cyan-500/20' },
  { id: 'todo', label: 'To-Do', color: 'bg-blue-500/20' },
  { id: 'stuck', label: 'Stuck', color: 'bg-destructive/20' },
  { id: 'review', label: 'Review', color: 'bg-purple-500/20' },
  { id: 'revisions', label: 'Revisions', color: 'bg-amber-500/20' },
  { id: 'done', label: 'Completed', color: 'bg-green-500/20' },
];

const MY_TASKS_KEY = 'kanban_my_tasks_filter';

export function KanbanBoard({ tasks, clients, clientId, isPublicView = false }: KanbanBoardProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createTaskStage, setCreateTaskStage] = useState('todo');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>('');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>('');
  const [showMyTasksOnly, setShowMyTasksOnly] = useState<boolean>(false);
  const [dueDateFilter, setDueDateFilter] = useState<string>('all');
  
  const updateTask = useUpdateTask();
  const addHistory = useAddTaskHistory();
  const { data: agencyMembers = [] } = useAgencyMembers();
  const { currentMember } = useTeamMember();
  
  // Initialize "My Tasks" filter based on logged-in member
  useEffect(() => {
    if (currentMember && !isPublicView) {
      // Check session storage for preference
      const stored = sessionStorage.getItem(MY_TASKS_KEY);
      if (stored === null) {
        // Default to showing user's own tasks
        setShowMyTasksOnly(true);
        setFilterAssigneeId(currentMember.id);
      } else {
        setShowMyTasksOnly(stored === 'true');
        if (stored === 'true') {
          setFilterAssigneeId(currentMember.id);
        }
      }
    }
  }, [currentMember, isPublicView]);
  
  // Toggle between my tasks and all tasks
  const handleToggleMyTasks = () => {
    const newValue = !showMyTasksOnly;
    setShowMyTasksOnly(newValue);
    sessionStorage.setItem(MY_TASKS_KEY, String(newValue));
    
    if (newValue && currentMember) {
      setFilterAssigneeId(currentMember.id);
    } else {
      setFilterAssigneeId('');
    }
  };
  
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
    
    // Filter by due date
    if (dueDateFilter && dueDateFilter !== 'all') {
      const now = new Date();
      const today = startOfDay(now);
      
      filtered = filtered.filter(t => {
        if (!t.due_date) {
          return dueDateFilter === 'no_date';
        }
        
        const dueDate = new Date(t.due_date);
        
        switch (dueDateFilter) {
          case 'overdue':
            return isPast(dueDate) && !isToday(dueDate);
          case 'today':
            return isToday(dueDate);
          case 'tomorrow':
            return isTomorrow(dueDate);
          case 'this_week':
            return isThisWeek(dueDate, { weekStartsOn: 1 });
          case 'no_date':
            return false; // Already handled above
          default:
            return true;
        }
      });
    }
    
    // Filter completed
    if (!showCompleted) {
      filtered = filtered.filter(t => t.status !== 'completed');
    }
    
    return filtered;
  }, [tasks, clientId, filterClientId, filterAssigneeId, searchQuery, showCompleted, dueDateFilter]);

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
        const isCompleting = targetStage.id === 'done';
        const oldStageName = STAGES.find(s => s.id === task.stage)?.label || task.stage;
        
        // Add history entry
        await addHistory.mutateAsync({
          taskId,
          action: isCompleting ? 'completed' : 'status_changed',
          oldValue: oldStageName,
          newValue: targetStage.label,
          changedBy: currentMember?.name || 'System',
        });
        
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
            {!isPublicView && !showMyTasksOnly && (
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
            
            {/* Due Date Filter */}
            <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
              <SelectTrigger className="w-40">
                <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Due Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="overdue">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    Overdue
                  </span>
                </SelectItem>
                <SelectItem value="today">Due Today</SelectItem>
                <SelectItem value="tomorrow">Due Tomorrow</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="no_date">No Due Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            {/* My Tasks / All Tasks Toggle - only for logged in team members */}
            {!isPublicView && currentMember && (
              <Button
                variant={showMyTasksOnly ? 'default' : 'outline'}
                size="sm"
                onClick={handleToggleMyTasks}
              >
                <UserCircle className="h-4 w-4 mr-2" />
                {showMyTasksOnly ? 'My Tasks' : 'All Tasks'}
              </Button>
            )}
            
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
                isPublicView={isPublicView}
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
                isPublicView={isPublicView}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        clientId={selectedTask?.client_id || undefined}
        clientName={selectedTask?.client_id ? clientMap[selectedTask.client_id] : undefined}
        isPublicView={isPublicView}
      />

      <CreateTaskModal
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        clients={clients}
        defaultClientId={clientId}
        isPublicView={isPublicView}
      />
    </>
  );
}
