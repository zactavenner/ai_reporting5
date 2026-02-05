import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Calendar as CalendarIcon,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Task, AgencyMember, useUpdateTask, useTaskFiles } from '@/hooks/useTasks';
import { format, isToday, isPast, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

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

  const handleCheckboxChange = async (checked: boolean) => {
    await updateTask.mutateAsync({
      id: task.id,
      stage: checked ? 'done' : 'todo',
      status: checked ? 'completed' : 'todo',
      completed_at: checked ? new Date().toISOString() : null,
    });
  };

   const handleSelectionChange = (checked: boolean) => {
     if (onSelectChange) {
       onSelectChange(checked);
     }
   };
 
  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className={cn(
            'group p-3 bg-background border border-border rounded-lg cursor-grab active:cursor-grabbing transition-all duration-200 relative',
            'hover:border-primary/50 hover:shadow-md hover:scale-[1.02]',
            (isDragging || isSortableDragging) && 'opacity-50 shadow-lg rotate-2',
            isOverdue && 'border-destructive/50 bg-destructive/5',
             isCompleted && 'opacity-70 bg-muted/30',
             isSelected && 'ring-2 ring-primary border-primary'
          )}
        >
           {/* Selection Checkbox */}
          <div 
            className={cn(
              'absolute -left-2 top-3 transition-all duration-200 z-10',
               (isCompleted || isSelected || onSelectChange) ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn(
              'rounded-full p-0.5 shadow-sm transition-colors',
               isCompleted ? 'bg-green-500' : isSelected ? 'bg-primary' : 'bg-background border border-border'
            )}>
              <Checkbox 
                 checked={onSelectChange ? isSelected : isCompleted}
                 onCheckedChange={onSelectChange ? handleSelectionChange : handleCheckboxChange}
                className={cn(
                  'h-5 w-5 border-2 transition-colors',
                   isCompleted && !onSelectChange && 'border-green-500 bg-green-500 text-white data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500',
                   isSelected && onSelectChange && 'border-primary bg-primary text-primary-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary'
                )}
              />
            </div>
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
          
          {/* Assignee - show pod name in public view, full name in agency view */}
          {assignee && (
            <div className="flex items-center gap-1">
              {isPublicView ? (
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  style={assignee.pod?.color ? { 
                    backgroundColor: `${assignee.pod.color}20`,
                    borderColor: assignee.pod.color,
                    color: assignee.pod.color
                  } : undefined}
                >
                  {assignee.pod?.name ? `${assignee.pod.name} Pod` : 'Team'}
                </Badge>
              ) : (
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs bg-muted">
                    {(assignee.name || 'N/A').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
          
          {!task.due_date && !assignee && (
            <div className="flex-1" />
          )}
        </div>
      </div>
    </div>
      </HoverCardTrigger>
      
      {/* Hover Card Content */}
      <HoverCardContent className="w-72 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            <h4 className={cn('font-semibold text-sm', isCompleted && 'line-through text-muted-foreground')}>
              {task.title}
            </h4>
          </div>
          
          {task.description && (
            <p className="text-xs text-muted-foreground">{task.description}</p>
          )}
          
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant={getPriorityColor(task.priority)} className="text-xs">
              {task.priority}
            </Badge>
            {clientName && (
              <Badge variant="outline" className="text-xs">{clientName}</Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            {task.due_date && (
              <div className={cn(
                'flex items-center gap-1',
                isOverdue && 'text-destructive font-medium',
                isDueToday && 'text-amber-500 font-medium'
              )}>
                <CalendarIcon className="h-3 w-3" />
                <span>
                  {isOverdue 
                    ? `Overdue by ${formatDistanceToNow(new Date(task.due_date))}`
                    : isDueToday 
                      ? 'Due today'
                      : `Due ${format(new Date(task.due_date), 'MMM d, yyyy')}`
                  }
                </span>
              </div>
            )}
            
            {assignee && (
              <span>Assigned to {isPublicView && assignee.pod?.name ? `${assignee.pod.name} Pod` : (assignee.name || 'Unknown')}</span>
            )}
          </div>
          
          {files.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              <span>{files.length} attachment{files.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
