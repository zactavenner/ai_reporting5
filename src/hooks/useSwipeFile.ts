import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// DB columns: id, scraped_ad_id, client_id, title, notes, image_url, video_url, tags, category, added_by, created_at
export interface SwipeFileItem {
  id: string;
  scraped_ad_id: string | null;
  client_id: string | null;
  title: string;
  notes: string | null;
  image_url: string | null;
  video_url: string | null;
  tags: string[];
  category: string | null;
  added_by: string | null;
  created_at: string;
  // Aliases for component compatibility
  ad_id: string | null;
  viral_video_id: string | null;
  // Joined data
  scraped_ads?: any;
  viral_videos?: any;
}

function mapSwipeItem(row: any): SwipeFileItem {
  return {
    ...row,
    ad_id: row.scraped_ad_id || null,
    viral_video_id: null,
    viral_videos: null,
  };
}

export function useSwipeFile() {
  return useQuery({
    queryKey: ['swipe-file'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('swipe_file')
        .select('*, scraped_ads(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapSwipeItem);
    },
  });
}

export function useAddToSwipeFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scraped_ad_id, ad_id, viral_video_id, tags, notes, client_id, title, image_url, video_url }: {
      scraped_ad_id?: string;
      ad_id?: string;
      viral_video_id?: string;
      tags?: string[];
      notes?: string;
      client_id?: string;
      title?: string;
      image_url?: string;
      video_url?: string;
    }) => {
      const { error } = await supabase.from('swipe_file').insert({
        scraped_ad_id: scraped_ad_id || ad_id || null,
        tags: tags || [],
        notes: notes || null,
        client_id: client_id || null,
        title: title || 'Untitled',
        image_url: image_url || null,
        video_url: video_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['swipe-file'] });
    },
  });
}

export function useUpdateSwipeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tags, notes, client_id }: {
      id: string;
      tags?: string[];
      notes?: string;
      client_id?: string | null;
    }) => {
      const updates: any = {};
      if (tags !== undefined) updates.tags = tags;
      if (notes !== undefined) updates.notes = notes;
      if (client_id !== undefined) updates.client_id = client_id;
      const { error } = await supabase.from('swipe_file').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['swipe-file'] });
    },
  });
}

export function useRemoveFromSwipeFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('swipe_file').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['swipe-file'] });
    },
  });
}

export function useSwipeFileIds() {
  const { data: items = [] } = useSwipeFile();
  const adIds = new Set(items.filter(i => i.scraped_ad_id).map(i => i.scraped_ad_id!));
  const videoIds = new Set(items.filter(i => i.viral_video_id).map(i => i.viral_video_id!));
  return { adIds, videoIds, items };
}
