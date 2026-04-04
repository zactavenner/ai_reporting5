import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
  topic: string;
}

export function useSlackChannels() {
  return useQuery({
    queryKey: ['slack-channels'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('slack-list-channels');
      if (error) throw error;
      return (data?.channels || []) as SlackChannel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
