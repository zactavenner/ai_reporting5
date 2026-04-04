import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// DB columns: id, client_id, platform, video_url, thumbnail_url, caption, views, likes, comments, shares, engagement_rate, creator_handle, creator_followers, is_tracked, scraped_at, created_at
// We map DB columns to a richer interface for component compatibility
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
  // Computed aliases for component compatibility
  title: string;
  description: string | null;
  source_url: string | null;
  creator_name: string | null;
  hashtags: string[];
  category: string | null;
}

// DB columns: id, client_id, platform, handle, display_name, followers, is_active, last_scraped_at, created_at
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
  // Computed aliases for component compatibility
  type: string;
  value: string;
  platforms: string[];
  min_views: number;
}

function mapViralVideo(row: any): ViralVideo {
  return {
    ...row,
    title: row.caption || 'Untitled',
    description: row.caption || null,
    source_url: row.video_url || null,
    creator_name: row.creator_handle || null,
    hashtags: [],
    category: null,
  };
}

function mapTrackingTarget(row: any): ViralTrackingTarget {
  return {
    ...row,
    type: 'profile',
    value: row.handle,
    platforms: [row.platform],
    min_views: 1000000,
  };
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
      return (data || []).map(mapViralVideo);
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
      return (data || []).map(mapTrackingTarget);
    },
  });
}

export function useStartViralTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      value,
      handle,
      platform,
      displayName,
      platforms,
      minViews,
    }: {
      type?: string;
      value?: string;
      handle?: string;
      platform?: string;
      displayName?: string;
      platforms?: string[];
      minViews?: number;
    }) => {
      const resolvedHandle = handle || value || '';
      const resolvedPlatform = platform || (platforms && platforms[0]) || 'TikTok';

      const { data: target, error: targetError } = await supabase
        .from('viral_tracking_targets')
        .insert({
          handle: resolvedHandle,
          platform: resolvedPlatform,
          display_name: displayName || resolvedHandle,
        })
        .select()
        .single();
      if (targetError) throw targetError;

      const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke('scrape-viral-videos', {
        body: { targetId: target.id, handle: resolvedHandle, platform: resolvedPlatform },
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

      return { target: mapTrackingTarget(target), videosCount: videos.length };
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
