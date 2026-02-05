import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Calendar as CalendarIcon,
  Paperclip,
  AlertTriangle,
  Check,
  CheckCircle2,
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
  isPublicView?: boolean;
  isSelected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}

export function KanbanTaskCard({ 
  task, 
  clientName, 
  assignee,
  onClick,
  isDragging,
  isPublicView = false,
  isSelected = false,
  onSelectChange,
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
  const isSelectionMode = !!onSelectChange;

  const handleCompleteTask = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateTask.mutateAsync({
      id: task.id,
      stage: isCompleted ? 'todo' : 'done',
      status: isCompleted ? 'todo' : 'completed',
      completed_at: isCompleted ? null : new Date().toISOString(),
    });
  };

  const handleSelectionChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectChange) {
      onSelectChange(!isSelected);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative p-3 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-200 overflow-hidden',
        // Base styling
        'bg-card border shadow-sm',
        // Default hover - subtle lift
        !isSelected && !isCompleted && 'hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30',
        // Dragging state
        (isDragging || isSortableDragging) && 'opacity-60 shadow-xl rotate-1 scale-105',
        // Overdue styling
        isOverdue && !isCompleted && 'border-destructive/40 bg-destructive/5',
        // Completed styling
        isCompleted && 'bg-muted/40 border-border/50',
        // Selection styling
        isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background border-primary shadow-md'
      )}
    >
      {/* Complete Button - Always visible on hover */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'absolute -left-1 top-3 z-10 flex items-center justify-center w-6 h-6 rounded-full shadow-sm transition-all duration-200 cursor-pointer',
                // Show on hover, when selected, or when completed
                isSelected || isCompleted 
                  ? 'opacity-100 scale-100' 
                  : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100',
                // Completed state
                isCompleted && 'bg-success text-success-foreground hover:bg-success/80',
                // Selected state
                isSelected && !isCompleted && 'bg-primary text-primary-foreground hover:bg-primary/80',
                // Default unchecked state
                !isCompleted && !isSelected && 'bg-background border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary/10'
              )}
              onClick={isSelectionMode ? handleSelectionChange : handleCompleteTask}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
              ) : isSelected ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                <Check className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={2} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {isSelectionMode 
              ? (isSelected ? 'Deselect' : 'Select for bulk action')
              : (isCompleted ? 'Mark incomplete' : 'Mark complete')
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div onClick={onClick} className={cn('pl-3', isCompleted && 'opacity-60')}>
        {/* Priority Badge & Client Tag */}
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <Badge 
            variant={getPriorityColor(task.priority)} 
            className={cn(
              'text-[10px] uppercase font-semibold px-1.5 py-0',
              isCompleted && 'opacity-50'
            )}
          >
            {task.priority}
          </Badge>
          <div className="flex items-center gap-1 flex-shrink-0">
            {files.length > 0 && (
              <div className="flex items-center gap-0.5 text-muted-foreground/70">
                <Paperclip className="h-3 w-3" />
                <span className="text-[10px]">{files.length}</span>
              </div>
            )}
            {clientName && (
              <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded truncate max-w-16">
                {clientName}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h4 className={cn(
          'font-medium text-sm leading-tight mb-1.5 line-clamp-2 break-words',
          isCompleted && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </h4>

        {/* Description Preview */}
        {task.description && (
          <p className={cn(
            'text-xs text-muted-foreground line-clamp-2 mb-2 break-words',
            isCompleted && 'opacity-70'
          )}>
            {task.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 gap-2">
          {/* Due Date */}
          {task.due_date && (
            <div className={cn(
              'flex items-center gap-1 text-[11px] font-medium flex-shrink-0',
              isOverdue && !isCompleted && 'text-destructive',
              isDueToday && !isCompleted && 'text-warning',
              isCompleted && 'text-muted-foreground line-through'
            )}>
              {isOverdue && !isCompleted && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
              <CalendarIcon className="h-3 w-3 flex-shrink-0" />
              <span>{format(new Date(task.due_date), 'MMM d')}</span>
            </div>
          )}
          
          <div className="flex-1" />
          
          {/* Assignee */}
          {assignee && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {isPublicView ? (
                <Badge 
                  variant="outline" 
                  className="text-[10px] font-normal border-border/60 px-1.5 py-0"
                  style={assignee.pod?.color ? { 
                    backgroundColor: `${assignee.pod.color}15`,
                    borderColor: `${assignee.pod.color}40`,
                    color: assignee.pod.color
                  } : undefined}
                >
                  {assignee.pod?.name ? `${assignee.pod.name}` : 'Team'}
                </Badge>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Avatar className="h-5 w-5 border border-border/50">
                        <AvatarFallback className="text-[9px] font-medium bg-muted/80 text-muted-foreground">
                          {(assignee.name || 'N/A').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{assignee.name || 'Unassigned'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
