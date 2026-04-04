import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export interface AvatarLook {
  id: string;
  avatar_id: string;
  name: string;
  image_url: string;
  prompt: string | null;
  is_default: boolean;
  angle: string | null;
  background: string | null;
  outfit: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useAvatarLooks(avatarId?: string | null) {
  return useQuery({
    queryKey: ['avatar-looks', avatarId],
    queryFn: async () => {
      if (!avatarId) return [];
      const { data, error } = await supabase
        .from('avatar_looks')
        .select('*')
        .eq('avatar_id', avatarId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as AvatarLook[];
    },
    enabled: !!avatarId,
  });
}

export function useCreateAvatarLook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (look: {
      avatar_id: string;
      name?: string;
      image_url: string;
      angle?: string;
      background?: string;
      outfit?: string;
      is_primary?: boolean;
      is_default?: boolean;
      metadata?: Json;
    }) => {
      const insertData = {
        ...look,
        name: look.name || 'Look',
      };
      const { data, error } = await supabase
        .from('avatar_looks')
        .insert([insertData])
        .select()
        .single();
      if (error) throw error;
      return data as AvatarLook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['avatar-looks', data.avatar_id] });
    },
  });
}

export function useDeleteAvatarLook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, avatarId, imageUrl }: { id: string; avatarId: string; imageUrl: string }) => {
      // Try to delete from storage if it's in our bucket
      try {
        const url = new URL(imageUrl);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/(.+)/);
        if (pathMatch) {
          await supabase.storage.from('avatars').remove([pathMatch[1]]);
        }
      } catch {
        // Ignore storage deletion errors
      }
      
      const { error } = await supabase
        .from('avatar_looks')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { avatarId };
    },
    onSuccess: ({ avatarId }) => {
      queryClient.invalidateQueries({ queryKey: ['avatar-looks', avatarId] });
    },
  });
}

export function useSetPrimaryLook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lookId, avatarId, imageUrl }: { lookId: string; avatarId: string; imageUrl: string }) => {
      // Unset all primary looks for this avatar
      await supabase
        .from('avatar_looks')
        .update({ is_default: false, is_primary: false } as any)
        .eq('avatar_id', avatarId);
      
      // Set the new primary
      await supabase
        .from('avatar_looks')
        .update({ is_default: true, is_primary: true } as any)
        .eq('id', lookId);
      
      // Update the avatar's main image_url
      await supabase
        .from('avatars')
        .update({ image_url: imageUrl })
        .eq('id', avatarId);
      
      return { avatarId };
    },
    onSuccess: ({ avatarId }) => {
      queryClient.invalidateQueries({ queryKey: ['avatar-looks', avatarId] });
      queryClient.invalidateQueries({ queryKey: ['avatars'] });
      toast.success('Primary look updated');
    },
  });
}
