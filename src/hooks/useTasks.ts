import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Task {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  stage: string;
  assigned_to: string | null;
  assigned_client_name: string | null;
  due_date: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface TaskFile {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface AgencyMember {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

// Fetch all tasks across clients (agency level)
export function useAllTasks() {
  return useQuery({
    queryKey: ['all-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Task[];
    },
  });
}

// Fetch tasks for a specific client
export function useTasks(clientId?: string) {
  return useQuery({
    queryKey: ['tasks', clientId],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*');
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Task[];
    },
    enabled: true,
  });
}

// Fetch task comments
export function useTaskComments(taskId?: string) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as TaskComment[];
    },
    enabled: !!taskId,
  });
}

// Fetch task files
export function useTaskFiles(taskId?: string) {
  return useQuery({
    queryKey: ['task-files', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_files')
        .select('*')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TaskFile[];
    },
    enabled: !!taskId,
  });
}

// Fetch task history
export function useTaskHistory(taskId?: string) {
  return useQuery({
    queryKey: ['task-history', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TaskHistory[];
    },
    enabled: !!taskId,
  });
}

// Fetch agency members
export function useAgencyMembers() {
  return useQuery({
    queryKey: ['agency-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_members')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as AgencyMember[];
    },
  });
}

// Create task mutation
export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (task: Omit<Partial<Task>, 'id'> & { title: string }) => {
      const insertData: any = { ...task };
      
      const { data, error } = await supabase
        .from('tasks')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      toast.success('Task created successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to create task: ' + error.message);
    },
  });
}

// Update task mutation
export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to update task: ' + error.message);
    },
  });
}

// Delete task mutation
export function useDeleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      toast.success('Task deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete task: ' + error.message);
    },
  });
}

// Add comment mutation
export function useAddTaskComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, authorName, content }: { taskId: string; authorName: string; content: string }) => {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          author_name: authorName,
          content,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
    },
    onError: (error: Error) => {
      toast.error('Failed to add comment: ' + error.message);
    },
  });
}

// Upload file mutation
export function useUploadTaskFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, file, uploadedBy }: { taskId: string; file: File; uploadedBy: string }) => {
      // Upload to storage
      const filePath = `${taskId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-files')
        .getPublicUrl(filePath);
      
      // Save to database
      const { data, error } = await supabase
        .from('task_files')
        .insert({
          task_id: taskId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          uploaded_by: uploadedBy,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['task-files', taskId] });
      toast.success('File uploaded successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to upload file: ' + error.message);
    },
  });
}

// Add agency member mutation
export function useAddAgencyMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, email, role }: { name: string; email: string; role?: string }) => {
      const { data, error } = await supabase
        .from('agency_members')
        .insert({ name, email, role: role || 'member' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-members'] });
      toast.success('Team member added');
    },
    onError: (error: Error) => {
      toast.error('Failed to add member: ' + error.message);
    },
  });
}

// Add task history
export function useAddTaskHistory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, action, oldValue, newValue, changedBy }: {
      taskId: string;
      action: string;
      oldValue?: string;
      newValue?: string;
      changedBy?: string;
    }) => {
      const { data, error } = await supabase
        .from('task_history')
        .insert({
          task_id: taskId,
          action,
          old_value: oldValue || null,
          new_value: newValue || null,
          changed_by: changedBy || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['task-history', taskId] });
    },
  });
}
