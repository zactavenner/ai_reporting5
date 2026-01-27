-- Add meeting_id reference to tasks for MeetGeek link
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.agency_meetings(id) ON DELETE SET NULL;

-- Add voice note fields to task_comments for discussion voice notes
ALTER TABLE public.task_comments 
ADD COLUMN IF NOT EXISTS audio_url TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS comment_type TEXT DEFAULT 'text';

-- Add highlights column to agency_meetings to store MeetGeek highlights
ALTER TABLE public.agency_meetings 
ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb;

-- Create index for faster meeting lookups
CREATE INDEX IF NOT EXISTS idx_tasks_meeting_id ON public.tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_agency_meetings_client_id ON public.agency_meetings(client_id);