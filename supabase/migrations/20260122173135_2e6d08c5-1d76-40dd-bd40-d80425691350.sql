-- Create agency members table
CREATE TABLE public.agency_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view agency_members" ON public.agency_members FOR SELECT USING (true);
CREATE POLICY "Public can insert agency_members" ON public.agency_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update agency_members" ON public.agency_members FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete agency_members" ON public.agency_members FOR DELETE USING (true);

-- Create tasks table for project management
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  stage TEXT NOT NULL DEFAULT 'backlog',
  assigned_to UUID REFERENCES public.agency_members(id) ON DELETE SET NULL,
  assigned_client_name TEXT,
  due_date DATE,
  created_by TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Public can insert tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update tasks" ON public.tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete tasks" ON public.tasks FOR DELETE USING (true);

-- Create task comments table
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view task_comments" ON public.task_comments FOR SELECT USING (true);
CREATE POLICY "Public can insert task_comments" ON public.task_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete task_comments" ON public.task_comments FOR DELETE USING (true);

-- Create task files table
CREATE TABLE public.task_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view task_files" ON public.task_files FOR SELECT USING (true);
CREATE POLICY "Public can insert task_files" ON public.task_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete task_files" ON public.task_files FOR DELETE USING (true);

-- Create task history table
CREATE TABLE public.task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view task_history" ON public.task_history FOR SELECT USING (true);
CREATE POLICY "Public can insert task_history" ON public.task_history FOR INSERT WITH CHECK (true);

-- Create chat conversations table for persistent chat history
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  conversation_type TEXT NOT NULL DEFAULT 'agency',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view chat_conversations" ON public.chat_conversations FOR SELECT USING (true);
CREATE POLICY "Public can insert chat_conversations" ON public.chat_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update chat_conversations" ON public.chat_conversations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete chat_conversations" ON public.chat_conversations FOR DELETE USING (true);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view chat_messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Public can insert chat_messages" ON public.chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete chat_messages" ON public.chat_messages FOR DELETE USING (true);

-- Create dashboard_preferences table for metric visibility settings
CREATE TABLE public.dashboard_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL DEFAULT 'agency',
  hidden_metrics TEXT[] DEFAULT '{}',
  custom_metrics JSONB DEFAULT '[]',
  chart_config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, preference_type)
);

-- Enable RLS
ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view dashboard_preferences" ON public.dashboard_preferences FOR SELECT USING (true);
CREATE POLICY "Public can insert dashboard_preferences" ON public.dashboard_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update dashboard_preferences" ON public.dashboard_preferences FOR UPDATE USING (true) WITH CHECK (true);

-- Create storage bucket for task files
INSERT INTO storage.buckets (id, name, public) VALUES ('task-files', 'task-files', true);

-- Create storage policies for task files
CREATE POLICY "Task files are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'task-files');
CREATE POLICY "Anyone can upload task files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "Anyone can delete task files" ON storage.objects FOR DELETE USING (bucket_id = 'task-files');

-- Add triggers for updated_at
CREATE TRIGGER update_agency_members_updated_at BEFORE UPDATE ON public.agency_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dashboard_preferences_updated_at BEFORE UPDATE ON public.dashboard_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();