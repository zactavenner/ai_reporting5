import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Matches actual DB columns for viral_videos
export interface ViralVideo {
  id: string;
  client_id: string | null;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number | null;
  creator_handle: string | null;
  creator_followers: number | null;
  is_tracked: boolean;
  scraped_at: string | null;
  created_at: string;
}

// Matches actual DB columns for viral_tracking_targets
export interface ViralTrackingTarget {
  id: string;
  client_id: string | null;
  platform: string;
  handle: string;
  display_name: string | null;
  followers: number | null;
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string;
}

export function useViralVideos() {
  return useQuery({
    queryKey: ['viral-videos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viral_videos')
        .select('*')
        .order('views', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ViralVideo[];
    },
  });
}

export function useViralTrackingTargets() {
  return useQuery({
    queryKey: ['viral-tracking-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viral_tracking_targets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ViralTrackingTarget[];
    },
  });
}

export function useStartViralTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      handle,
      platform,
      displayName,
    }: {
      handle: string;
      platform: string;
      displayName?: string;
    }) => {
      const { data: target, error: targetError } = await supabase
        .from('viral_tracking_targets')
        .insert({
          handle,
          platform,
          display_name: displayName || handle,
        })
        .select()
        .single();
      if (targetError) throw targetError;

      // Scrape viral videos
      const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke('scrape-viral-videos', {
        body: { targetId: target.id, handle, platform },
      });
      if (scrapeError) throw scrapeError;
      if (!scrapeResult?.success) throw new Error(scrapeResult?.error || 'Scraping failed');

      const videos = scrapeResult.videos || [];
      if (videos.length > 0) {
        const { error: insertError } = await supabase.from('viral_videos').insert(videos);
        if (insertError) throw insertError;
      }

      await supabase
        .from('viral_tracking_targets')
        .update({ last_scraped_at: new Date().toISOString() })
        .eq('id', target.id);

      return { target, videosCount: videos.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viral-videos'] });
      queryClient.invalidateQueries({ queryKey: ['viral-tracking-targets'] });
    },
  });
}

export function useDeleteViralTrackingTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viral_tracking_targets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viral-tracking-targets'] });
      queryClient.invalidateQueries({ queryKey: ['viral-videos'] });
    },
  });
}

export function useDeleteViralVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viral_videos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viral-videos'] });
    },
  });
}
