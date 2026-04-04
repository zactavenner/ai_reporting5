import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface QuizQuestion {
  question: string;
  subtext?: string;
  options: string[];
}

export interface QuizFunnel {
  id: string;
  client_id: string;
  name: string;
  title: string;
  subtitle: string | null;
  hero_heading: string | null;
  hero_description: string | null;
  hero_stats: Array<{ value: string; label: string }>;
  bottom_stats: Array<{ icon: string; value: string; label: string }>;
  badge_text: string | null;
  cta_text: string | null;
  brand_name: string | null;
  brand_logo_url: string | null;
  questions: QuizQuestion[];
  collect_contact: boolean;
  show_calendar: boolean;
  calendar_url: string | null;
  thank_you_heading: string | null;
  thank_you_message: string | null;
  disclaimer_text: string | null;
  is_active: boolean;
  slug: string | null;
  meta_pixel_id: string | null;
  primary_color: string | null;
  created_at: string;
  updated_at: string;
}

export function useQuizFunnels(clientId?: string) {
  return useQuery({
    queryKey: ['quiz-funnels', clientId],
    queryFn: async () => {
      let query = (supabase as any).from('quiz_funnels').select('*').order('created_at', { ascending: false });
      if (clientId) query = query.eq('client_id', clientId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as QuizFunnel[];
    },
  });
}

export function useCreateQuizFunnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (funnel: Partial<QuizFunnel> & { client_id: string }) => {
      const { data, error } = await (supabase as any).from('quiz_funnels').insert(funnel).select().single();
      if (error) throw error;
      return data as QuizFunnel;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quiz-funnels'] }); },
  });
}

export function useDeleteQuizFunnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('quiz_funnels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quiz-funnels'] }); },
  });
}
