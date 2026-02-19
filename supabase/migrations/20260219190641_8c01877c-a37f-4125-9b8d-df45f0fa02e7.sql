
-- Add recurrence fields to tasks table
ALTER TABLE public.tasks
ADD COLUMN recurrence_type text DEFAULT NULL,
ADD COLUMN recurrence_interval integer DEFAULT 1,
ADD COLUMN recurrence_next_at timestamp with time zone DEFAULT NULL,
ADD COLUMN recurrence_parent_id uuid DEFAULT NULL REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Create index for efficient querying of due recurring tasks
CREATE INDEX idx_tasks_recurrence_next ON public.tasks(recurrence_next_at) WHERE recurrence_type IS NOT NULL;
