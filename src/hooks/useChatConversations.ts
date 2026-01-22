import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatConversation {
  id: string;
  client_id: string | null;
  title: string;
  conversation_type: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

// Fetch all conversations (agency level)
export function useAllConversations() {
  return useQuery({
    queryKey: ['all-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data as ChatConversation[];
    },
  });
}

// Fetch conversations for a specific client
export function useConversations(clientId?: string, type: string = 'agency') {
  return useQuery({
    queryKey: ['conversations', clientId, type],
    queryFn: async () => {
      let query = supabase.from('chat_conversations').select('*');
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      } else {
        query = query.is('client_id', null);
      }
      
      query = query.eq('conversation_type', type);
      
      const { data, error } = await query.order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data as ChatConversation[];
    },
  });
}

// Fetch messages for a conversation
export function useConversationMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as ChatMessage[];
    },
    enabled: !!conversationId,
  });
}

// Create conversation
export function useCreateConversation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ clientId, title, type }: { clientId?: string; title?: string; type?: string }) => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .insert({
          client_id: clientId || null,
          title: title || 'New Conversation',
          conversation_type: type || 'agency',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as ChatConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['all-conversations'] });
    },
  });
}

// Update conversation title
export function useUpdateConversation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['all-conversations'] });
    },
  });
}

// Delete conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('chat_conversations')
        .delete()
        .eq('id', conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['all-conversations'] });
      toast.success('Conversation deleted');
    },
  });
}

// Add message to conversation
export function useAddMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, role, content }: { conversationId: string; role: string; content: string }) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update conversation's updated_at
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      
      return data as ChatMessage;
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['all-conversations'] });
    },
  });
}
