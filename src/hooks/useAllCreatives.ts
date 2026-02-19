import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Creative, CreativeComment } from './useCreatives';
import { fetchAllRows } from '@/lib/fetchAllRows';

export function useAllCreatives() {
  return useQuery({
    queryKey: ['all-creatives'],
    queryFn: async () => {
      const data = await fetchAllRows((sb) =>
        sb.from('creatives')
          .select('*')
          .order('created_at', { ascending: false })
      );
      
      return (data || []).map((item) => ({
        ...item,
        type: item.type as 'image' | 'video' | 'copy',
        platform: (item.platform as 'meta' | 'tiktok' | 'youtube' | 'google') || 'meta',
        status: item.status as 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched',
        comments: (item.comments as unknown as CreativeComment[]) || [],
        aspect_ratio: (item as any).aspect_ratio || null,
      })) as Creative[];
    },
  });
}
