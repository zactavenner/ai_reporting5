import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientPortalProfile {
  id: string;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'disabled';
}

export interface ClientPortalClient {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  status: string;
}

export interface ClientPortalTask {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: 'low' | 'medium' | 'high' | string;
  stage: string;
  due_date: string | null;
  created_by: string | null;
  completed_at: string | null;
  parent_task_id: string | null;
  visible_to_client: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientPortalComment {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  created_at: string;
  comment_type: string | null;
}

export interface ClientPortalData {
  ok: boolean;
  profile: ClientPortalProfile;
  clients: ClientPortalClient[];
  tasks: ClientPortalTask[];
  comments: ClientPortalComment[];
}

async function callClientPortal(payload: Record<string, unknown>): Promise<ClientPortalData> {
  const { data, error } = await supabase.functions.invoke('client-portal', { body: payload });
  if (error) {
    let message = error.message || 'Client portal request failed';
    try {
      const body = await (error as any)?.context?.json?.();
      if (body?.error) message = String(body.error);
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as ClientPortalData;
}

export function useClientPortal() {
  return useQuery({
    queryKey: ['client-portal'],
    queryFn: () => callClientPortal({ action: 'overview' }),
    retry: false,
    staleTime: 20_000,
  });
}

function usePortalMutation<TVars>(
  build: (vars: TVars) => Record<string, unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => callClientPortal(build(vars)),
    onSuccess: (data) => {
      queryClient.setQueryData(['client-portal'], data);
      if (successMessage) toast.success(successMessage);
    },
    onError: (error: Error) => toast.error(error.message || 'Request failed'),
  });
}

export function useCreateClientPortalTask() {
  return usePortalMutation<{
    client_id: string;
    title: string;
    description?: string;
    priority?: string;
    due_date?: string;
  }>((vars) => ({ action: 'create_task', ...vars }), 'Task added');
}

export function useUpdateClientPortalTask() {
  return usePortalMutation<{
    task_id: string;
    stage?: string;
    status?: string;
    priority?: string;
    due_date?: string | null;
  }>((vars) => ({ action: 'update_task', ...vars }), 'Task updated');
}

export function useAddClientPortalComment() {
  return usePortalMutation<{
    task_id: string;
    content: string;
  }>((vars) => ({ action: 'add_comment', ...vars }), 'Comment added');
}
