-- Add parent_task_id column for subtask hierarchy
ALTER TABLE public.tasks ADD COLUMN parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE DEFAULT NULL;

-- Index for efficient subtask queries
CREATE INDEX idx_tasks_parent_task_id ON public.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- Add show_subtasks_to_client flag for controlling visibility on public view
ALTER TABLE public.tasks ADD COLUMN show_subtasks_to_client BOOLEAN DEFAULT true;