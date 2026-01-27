import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

export interface CreativeComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Creative {
  id: string;
  client_id: string;
  title: string;
  type: 'image' | 'video' | 'copy';
  platform: 'meta' | 'tiktok' | 'youtube' | 'google';
  file_url: string | null;
  headline: string | null;
  body_copy: string | null;
  cta_text: string | null;
  status: 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched';
  comments: CreativeComment[];
  created_at: string;
  updated_at: string;
}

export function useCreatives(clientId?: string) {
  return useQuery({
    queryKey: ['creatives', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('creatives')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform the data to match our Creative type
      return (data || []).map((item) => ({
        ...item,
        type: item.type as 'image' | 'video' | 'copy',
        platform: (item.platform as 'meta' | 'tiktok' | 'youtube' | 'google') || 'meta',
        status: item.status as 'pending' | 'approved' | 'revisions' | 'rejected',
        comments: (item.comments as unknown as CreativeComment[]) || [],
      })) as Creative[];
    },
    enabled: !!clientId,
  });
}

export function useCreateCreative() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (creative: {
      client_id: string;
      client_name?: string;
      title: string;
      type?: string;
      platform?: string;
      file_url?: string | null;
      headline?: string | null;
      body_copy?: string | null;
      cta_text?: string | null;
      status?: string;
      comments?: Json;
    }) => {
      const { data, error } = await supabase
        .from('creatives')
        .insert({
          client_id: creative.client_id,
          title: creative.title,
          type: creative.type || 'image',
          platform: creative.platform || 'meta',
          file_url: creative.file_url || null,
          headline: creative.headline || null,
          body_copy: creative.body_copy || null,
          cta_text: creative.cta_text || null,
          status: creative.status || 'pending',
          comments: creative.comments || [],
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Auto-create task for client to review the creative
      const previewLink = creative.file_url ? `\n\n**Preview:** ${creative.file_url}` : '';
      const { error: taskError } = await supabase
        .from('tasks')
        .insert({
          client_id: creative.client_id,
          title: `Review creative: ${creative.title}`,
          description: `Please review the new ${creative.type || 'image'} creative "${creative.title}" for ${creative.platform || 'meta'}.${previewLink}`,
          status: 'todo',
          stage: 'todo',
          priority: 'medium',
          created_by: 'System',
          assigned_client_name: creative.client_name || null,
        });
      
      if (taskError) {
        console.error('Failed to create review task for creative:', taskError);
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.client_id] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.client_id] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      toast.success('Creative uploaded and review task created');
    },
    onError: (error: Error) => {
      toast.error('Failed to upload creative: ' + error.message);
    },
  });
}

export function useUpdateCreativeStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      clientId,
      creativeTitle
    }: { 
      id: string; 
      status: 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched'; 
      clientId: string;
      creativeTitle?: string;
    }) => {
      const { data, error } = await supabase
        .from('creatives')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Auto-create task when creative is approved
      if (status === 'approved' && data) {
        const title = creativeTitle || data.title || 'Untitled Creative';
        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            client_id: clientId,
            title: `Launch approved creative: ${title}`,
            description: `Creative "${title}" has been approved and is ready to launch.`,
            status: 'todo',
            stage: 'todo',
            priority: 'high',
            created_by: 'System',
          });
        
        if (taskError) {
          console.error('Failed to create task for approved creative:', taskError);
        }
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
      toast.success(`Creative ${variables.status}`);
    },
    onError: (error: Error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });
}

export function useAddCreativeComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      comment,
      clientId 
    }: { 
      id: string; 
      comment: CreativeComment;
      clientId: string;
    }) => {
      // First get current comments
      const { data: current, error: fetchError } = await supabase
        .from('creatives')
        .select('comments')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const existingComments = (current?.comments as unknown as CreativeComment[]) || [];
      const updatedComments = [...existingComments, comment];
      
      const { data, error } = await supabase
        .from('creatives')
        .update({ comments: updatedComments as unknown as Json })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error('Failed to add comment: ' + error.message);
    },
  });
}

export function useDeleteCreative() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from('creatives')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creatives', variables.clientId] });
      toast.success('Creative deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete creative: ' + error.message);
    },
  });
}

export async function uploadCreativeFile(file: File, clientId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${clientId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('creatives')
    .upload(fileName, file);
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('creatives')
    .getPublicUrl(data.path);
  
  return publicUrl;
}
