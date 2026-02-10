import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CalendarIcon,
  Trash2,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Task, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { MultiAssigneeSelector } from './MultiAssigneeSelector';

interface SubtaskRowProps {
  subtask: Task;
  isPublicView?: boolean;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onStartEdit: (subtask: Task) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, title: string) => void;
  onToggleComplete: (subtask: Task) => void;
}

export function SubtaskRow({
  subtask,
  isPublicView = false,
  editingSubtaskId,
  editingSubtaskTitle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleComplete,
}: SubtaskRowProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [localEditTitle, setLocalEditTitle] = useState(editingSubtaskTitle);

  const isEditing = editingSubtaskId === subtask.id;

  // Sync local title when editing starts
  if (isEditing && localEditTitle !== editingSubtaskTitle && editingSubtaskTitle === subtask.title) {
    setLocalEditTitle(editingSubtaskTitle);
  }

  const handlePriorityChange = async (priority: string) => {
    await updateTask.mutateAsync({ id: subtask.id, priority });
  };

  const handleDueDateChange = async (date: Date | undefined) => {
    await updateTask.mutateAsync({
      id: subtask.id,
      due_date: date ? format(date, 'yyyy-MM-dd') : null,
    });
  };

  const handleDelete = async () => {
    await deleteTask.mutateAsync(subtask.id);
  };

  const getPriorityVariant = (p: string) => {
    switch (p) {
      case 'high': return 'destructive' as const;
      case 'medium': return 'secondary' as const;
      case 'low': return 'outline' as const;
      default: return 'secondary' as const;
    }
  };

  return (
    <div className="rounded-md hover:bg-muted/50 group transition-colors">
      {/* Main row: checkbox + title + delete */}
      <div className="flex items-center gap-2 py-1.5 px-2">
        <button
          onClick={() => onToggleComplete(subtask)}
          className="flex-shrink-0"
        >
          {subtask.stage === 'done' ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
          )}
        </button>

        {isEditing ? (
          <Input
            value={localEditTitle}
            onChange={(e) => setLocalEditTitle(e.target.value)}
            className="h-7 text-sm flex-1"
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && localEditTitle.trim()) {
                onSaveEdit(subtask.id, localEditTitle.trim());
              }
              if (e.key === 'Escape') onCancelEdit();
            }}
            onBlur={() => {
              if (localEditTitle.trim() && localEditTitle.trim() !== subtask.title) {
                onSaveEdit(subtask.id, localEditTitle.trim());
              } else {
                onCancelEdit();
              }
            }}
          />
        ) : (
          <span
            className={cn(
              "text-sm flex-1 cursor-pointer hover:text-primary transition-colors",
              subtask.stage === 'done' && "line-through text-muted-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(subtask);
            }}
          >
            {subtask.title}
          </span>
        )}

        {!isPublicView && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>

      {/* Metadata row: priority + due date + assignees */}
      <div className="flex items-center gap-2 px-2 pb-1.5 pl-8 flex-wrap">
        {/* Priority */}
        {!isPublicView ? (
          <Select value={subtask.priority || 'medium'} onValueChange={handlePriorityChange}>
            <SelectTrigger className="h-6 w-auto text-xs border-none bg-transparent p-0 gap-1 [&>svg]:h-3 [&>svg]:w-3">
              <Badge variant={getPriorityVariant(subtask.priority || 'medium')} className="text-[10px] px-1.5 py-0">
                {subtask.priority || 'medium'}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low"><Badge variant="outline" className="text-xs">Low</Badge></SelectItem>
              <SelectItem value="medium"><Badge variant="secondary" className="text-xs">Medium</Badge></SelectItem>
              <SelectItem value="high"><Badge variant="destructive" className="text-xs">High</Badge></SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={getPriorityVariant(subtask.priority || 'medium')} className="text-[10px] px-1.5 py-0">
            {subtask.priority || 'medium'}
          </Badge>
        )}

        {/* Due date */}
        {!isPublicView ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 text-[10px] px-1.5 gap-1",
                  !subtask.due_date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-3 w-3" />
                {subtask.due_date ? format(new Date(subtask.due_date), 'MMM d') : 'No date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={subtask.due_date ? new Date(subtask.due_date) : undefined}
                onSelect={handleDueDateChange}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        ) : (
          subtask.due_date && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(subtask.due_date), 'MMM d')}
            </span>
          )
        )}

        {/* Assignees */}
        <div className="ml-auto">
          <MultiAssigneeSelector
            taskId={subtask.id}
            isPublicView={isPublicView}
          />
        </div>
      </div>
    </div>
  );
}
