-- Create agency_meetings table for storing synced meetings from MeetGeek
CREATE TABLE public.agency_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  meeting_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  participants JSONB DEFAULT '[]',
  summary TEXT,
  transcript TEXT,
  action_items JSONB DEFAULT '[]',
  recording_url TEXT,
  meetgeek_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_meetings ENABLE ROW LEVEL SECURITY;

-- RLS policies for agency_meetings
CREATE POLICY "Public can view agency_meetings" ON public.agency_meetings FOR SELECT USING (true);
CREATE POLICY "Public can insert agency_meetings" ON public.agency_meetings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update agency_meetings" ON public.agency_meetings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete agency_meetings" ON public.agency_meetings FOR DELETE USING (true);

-- Create pending_meeting_tasks table for task approval workflow
CREATE TABLE public.pending_meeting_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.agency_meetings(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by TEXT,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_meeting_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for pending_meeting_tasks
CREATE POLICY "Public can view pending_meeting_tasks" ON public.pending_meeting_tasks FOR SELECT USING (true);
CREATE POLICY "Public can insert pending_meeting_tasks" ON public.pending_meeting_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update pending_meeting_tasks" ON public.pending_meeting_tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete pending_meeting_tasks" ON public.pending_meeting_tasks FOR DELETE USING (true);

-- Add MeetGeek configuration columns to agency_settings
ALTER TABLE public.agency_settings 
ADD COLUMN meetgeek_api_key TEXT,
ADD COLUMN meetgeek_webhook_secret TEXT;