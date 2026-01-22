import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Calendar as CalendarIcon,
  Paperclip,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { Task, AgencyMember } from '@/hooks/useTasks';
import { format, isToday, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'p-3 bg-background border border-border rounded-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg rotate-2',
        isOverdue && 'border-destructive/50 bg-destructive/5'
      )}
    >
      {/* Priority Badge & Client Tag */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge variant={getPriorityColor(task.priority)} className="text-xs uppercase">
          {task.priority}
        </Badge>
        {clientName && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded truncate max-w-24">
            {clientName}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm mb-2 line-clamp-2">{task.title}</h4>

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
  );
}
