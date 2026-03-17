import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CreativeBrief {
  id: string;
  client_id: string;
  title: string;
  status: 'pending' | 'in_production' | 'completed' | 'archived';
  brief_type: 'performance' | 'new_angle' | 'fatigue_refresh' | 'competitor' | 'seasonal' | 'manual';
  source_ad_ids: string[];
  performance_snapshot: Record<string, unknown>;
  target_audience: string | null;
  key_message: string | null;
  tone_and_style: string | null;
  winning_hooks: string[] | null;
  angles_to_test: string[] | null;
  visual_direction: string | null;
  cta_recommendations: string[] | null;
  platform_specs: Record<string, unknown>;
  additional_notes: string | null;
  generated_by: string;
  model_used: string | null;
  scripts_generated: number;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  scripts?: AdScript[];
  client?: { id: string; name: string; logo_url?: string };
}

export interface AdScript {
  id: string;
  brief_id: string;
  client_id: string;
  title: string;
  status: 'draft' | 'approved' | 'in_production' | 'completed' | 'rejected';
  script_type: string;
  platform: string;
  variant_number: number;
  hook: string | null;
  body_copy: string | null;
  cta: string | null;
  visual_notes: string | null;
  audio_notes: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revision_count: number;
  performance_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useCreativeBriefs(clientId?: string) {
  return useQuery({
    queryKey: ['creative-briefs', clientId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('creative_briefs')
        .select('*, scripts:ad_scripts(id, title, status, variant_number)')
        .order('created_at', { ascending: false });

      if (clientId) query = query.eq('client_id', clientId);

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return (data || []) as CreativeBrief[];
    },
  });
}

export function useCreativeBrief(briefId: string | null) {
  return useQuery({
    queryKey: ['creative-brief', briefId],
    queryFn: async () => {
      if (!briefId) return null;
      const { data, error } = await (supabase as any)
        .from('creative_briefs')
        .select('*, scripts:ad_scripts(*), client:clients(id, name, logo_url)')
        .eq('id', briefId)
        .single();
      if (error) throw error;
      return data as CreativeBrief;
    },
    enabled: !!briefId,
  });
}

export function useAdScripts(briefId?: string) {
  return useQuery({
    queryKey: ['ad-scripts', briefId],
    queryFn: async () => {
      if (!briefId) return [];
      const { data, error } = await (supabase as any)
        .from('ad_scripts')
        .select('*')
        .eq('brief_id', briefId)
        .order('variant_number');
      if (error) throw error;
      return (data || []) as AdScript[];
    },
    enabled: !!briefId,
  });
}

export function useGenerateBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      client_id: string;
      brief_type?: string;
      top_n?: number;
      date_range_days?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-creative-brief', {
        body: { action: 'analyze_and_generate', ...params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['creative-briefs'] });
      toast.success(`Brief generated: ${data.brief?.title || 'New brief'}`);
    },
    onError: (error: Error) => {
      toast.error('Failed to generate brief: ' + error.message);
    },
  });
}

export function useGenerateScripts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      brief_id: string;
      num_scripts?: number;
      script_type?: string;
      platform?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-creative-brief', {
        body: { action: 'generate_scripts', ...params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['creative-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['ad-scripts'] });
      toast.success(`${data.scripts?.length || 0} scripts generated`);
    },
    onError: (error: Error) => {
      toast.error('Failed to generate scripts: ' + error.message);
    },
  });
}

export function useUpdateScriptStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      script_id: string;
      status: AdScript['status'];
      review_notes?: string;
      reviewed_by?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-creative-brief', {
        body: { action: 'update_script_status', ...params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['ad-scripts'] });
      toast.success('Script status updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update script: ' + error.message);
    },
  });
}
