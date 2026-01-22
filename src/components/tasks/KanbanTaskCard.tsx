import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Calendar as CalendarIcon,
  Paperclip,
  AlertTriangle,
} from 'lucide-react';
import { Task, AgencyMember, useUpdateTask, useTaskFiles } from '@/hooks/useTasks';
import { format, isToday, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface KanbanTaskCardProps {
  task: Task;
  clientName?: string;
  assignee?: AgencyMember;
  onClick?: () => void;
  isDragging?: boolean;
}

export function KanbanTaskCard({ 
  task, 
  clientName, 
  assignee,
  onClick,
  isDragging,
}: KanbanTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const updateTask = useUpdateTask();
  const { data: files = [] } = useTaskFiles(task.id);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && task.status !== 'completed';
  const isDueToday = task.due_date && isToday(new Date(task.due_date));
  const isCompleted = task.stage === 'done' || task.status === 'completed';

  const handleCheckboxChange = async (checked: boolean) => {
    await updateTask.mutateAsync({
      id: task.id,
      stage: checked ? 'done' : 'todo',
      status: checked ? 'completed' : 'todo',
      completed_at: checked ? new Date().toISOString() : null,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group p-3 bg-background border border-border rounded-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors relative',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg rotate-2',
        isOverdue && 'border-destructive/50 bg-destructive/5',
        isCompleted && 'opacity-60'
      )}
    >
      {/* Hover Checkbox */}
      <div 
        className={cn(
          'absolute -left-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity z-10',
          isCompleted && 'opacity-100'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox 
          checked={isCompleted}
          onCheckedChange={handleCheckboxChange}
          className="h-5 w-5 bg-background border-2"
        />
      </div>

      <div onClick={onClick}>
        {/* Priority Badge & Client Tag */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <Badge variant={getPriorityColor(task.priority)} className="text-xs uppercase">
            {task.priority}
          </Badge>
          <div className="flex items-center gap-1">
            {files.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      <span className="text-xs">{files.length}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{files.length} file{files.length > 1 ? 's' : ''} attached</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {clientName && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded truncate max-w-24">
                {clientName}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h4 className={cn('font-medium text-sm mb-2 line-clamp-2', isCompleted && 'line-through')}>{task.title}</h4>

        {/* Description Preview */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {task.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Due Date */}
          {task.due_date && (
            <div className={cn(
              'flex items-center gap-1 text-xs',
              isOverdue && 'text-destructive',
              isDueToday && 'text-amber-500'
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <CalendarIcon className="h-3 w-3" />
              <span>{format(new Date(task.due_date), 'MMM d')}</span>
            </div>
          )}
          
          {/* Assignee */}
          {assignee && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-muted">
                {assignee.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          
          {!task.due_date && !assignee && (
            <div className="flex-1" />
          )}
        </div>
      </div>
    </div>
  );
}
