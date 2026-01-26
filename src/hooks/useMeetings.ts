import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Meeting {
  id: string;
  client_id: string | null;
  meeting_id: string;
  title: string;
  meeting_date: string | null;
  duration_minutes: number | null;
  participants: any[];
  summary: string | null;
  transcript: string | null;
  action_items: any[];
  recording_url: string | null;
  meetgeek_url: string | null;
  created_at: string;
}

export interface PendingMeetingTask {
  id: string;
  meeting_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  approved_by: string | null;
  task_id: string | null;
  created_at: string;
  meeting?: Meeting;
}

export function useMeetings(clientId?: string) {
  return useQuery({
    queryKey: ['meetings', clientId],
    queryFn: async () => {
      let query = supabase
        .from('agency_meetings')
        .select('*')
        .order('meeting_date', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Meeting[];
    },
  });
}

export function usePendingMeetingTasks() {
  return useQuery({
    queryKey: ['pending-meeting-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_meeting_tasks')
        .select(`
          *,
          meeting:agency_meetings(*)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PendingMeetingTask[];
    },
  });
}

export function useAssignMeetingToClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, clientId }: { meetingId: string; clientId: string | null }) => {
      const { error } = await supabase
        .from('agency_meetings')
        .update({ client_id: clientId })
        .eq('id', meetingId);

      if (error) throw error;

      // Also update any pending tasks for this meeting
      if (clientId) {
        await supabase
          .from('pending_meeting_tasks')
          .update({ client_id: clientId })
          .eq('meeting_id', meetingId)
          .eq('status', 'pending');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
      toast.success('Meeting assigned to client');
    },
    onError: (error) => {
      toast.error('Failed to assign meeting');
      console.error(error);
    },
  });
}

export function useApprovePendingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pendingTaskId,
      clientId,
      title,
      description,
      priority,
    }: {
      pendingTaskId: string;
      clientId: string | null;
      title: string;
      description: string;
      priority: string;
    }) => {
      // Create the real task
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          client_id: clientId,
          title,
          description,
          priority,
          status: 'todo',
          stage: 'TODO',
          created_by: 'MeetGeek',
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Update pending task status
      const { error: updateError } = await supabase
        .from('pending_meeting_tasks')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: 'User',
          task_id: newTask.id,
        })
        .eq('id', pendingTaskId);

      if (updateError) throw updateError;

      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task approved and created');
    },
    onError: (error) => {
      toast.error('Failed to approve task');
      console.error(error);
    },
  });
}

export function useRejectPendingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pendingTaskId: string) => {
      const { error } = await supabase
        .from('pending_meeting_tasks')
        .update({ status: 'rejected' })
        .eq('id', pendingTaskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
      toast.success('Task rejected');
    },
    onError: (error) => {
      toast.error('Failed to reject task');
      console.error(error);
    },
  });
}

export function useUpdatePendingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<PendingMeetingTask, 'title' | 'description' | 'priority' | 'client_id'>>;
    }) => {
      const { error } = await supabase
        .from('pending_meeting_tasks')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
    },
  });
}

export function useSyncMeetings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('meetgeek-webhook', {
        body: { action: 'sync' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
      if (data?.synced !== undefined) {
        toast.success(`Synced ${data.synced} new meetings`);
      } else {
        toast.success('Meetings synced');
      }
    },
    onError: (error) => {
      toast.error('Failed to sync meetings');
      console.error(error);
    },
  });
}

export function useCreatePendingTaskFromActionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      clientId,
      title,
      description,
    }: {
      meetingId: string;
      clientId: string | null;
      title: string;
      description: string;
    }) => {
      const { data, error } = await supabase
        .from('pending_meeting_tasks')
        .insert({
          meeting_id: meetingId,
          client_id: clientId,
          title,
          description,
          priority: 'medium',
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-meeting-tasks'] });
      toast.success('Task added for review');
    },
    onError: (error) => {
      toast.error('Failed to create pending task');
      console.error(error);
    },
  });
}
