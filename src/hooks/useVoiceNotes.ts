import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VoiceNote {
  id: string;
  client_id: string;
  title: string;
  duration_seconds: number;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  action_items: any[];
  recorded_by: string;
  is_public_recording: boolean;
  created_at: string;
}

export function useVoiceNotes(clientId?: string) {
  return useQuery({
    queryKey: ['voice-notes', clientId],
    queryFn: async () => {
      let query = supabase
        .from('client_voice_notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as VoiceNote[];
    },
    enabled: !!clientId,
  });
}

interface CreateVoiceNoteParams {
  audioBase64: string;
  clientId: string;
  clientName?: string;
  isPublicRecording?: boolean;
  durationSeconds?: number;
}

interface CreateVoiceNoteResult {
  success: boolean;
  voiceNote: {
    id: string;
    title: string;
    summary: string;
    transcript: string;
    action_items: any[];
    duration_seconds: number;
  };
  tasksCreated: number;
}

export function useCreateVoiceNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateVoiceNoteParams): Promise<CreateVoiceNoteResult> => {
      const { data, error } = await supabase.functions.invoke('process-voice-note', {
        body: params,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data as CreateVoiceNoteResult;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['voice-notes', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
    },
  });
}

export function useDeleteVoiceNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from('client_voice_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, clientId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['voice-notes', data.clientId] });
    },
  });
}
