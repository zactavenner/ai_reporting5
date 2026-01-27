-- Create client_voice_notes table
CREATE TABLE public.client_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  duration_seconds integer DEFAULT 0,
  audio_url text,
  transcript text,
  summary text,
  action_items jsonb DEFAULT '[]'::jsonb,
  recorded_by text DEFAULT 'User',
  is_public_recording boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_voice_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Public can view client_voice_notes" ON public.client_voice_notes
  FOR SELECT USING (true);

CREATE POLICY "Public can insert client_voice_notes" ON public.client_voice_notes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can update client_voice_notes" ON public.client_voice_notes
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete client_voice_notes" ON public.client_voice_notes
  FOR DELETE USING (true);

-- Add voice_note_id to pending_meeting_tasks for source tracking
ALTER TABLE public.pending_meeting_tasks 
  ADD COLUMN voice_note_id uuid REFERENCES public.client_voice_notes(id) ON DELETE CASCADE;

-- Make meeting_id nullable so voice notes can create tasks without a meeting
ALTER TABLE public.pending_meeting_tasks 
  ALTER COLUMN meeting_id DROP NOT NULL;