import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Pipeline {
  id: string;
  client_id: string;
  ghl_pipeline_id: string;
  name: string;
  sort_order: number;
  last_synced_at: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  ghl_stage_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface PipelineOpportunity {
  id: string;
  pipeline_id: string;
  stage_id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  monetary_value: number;
  source: string | null;
  status: string;
  last_stage_change_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

// Fetch client pipelines
export function useClientPipelines(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-pipelines', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('client_pipelines')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order');

      if (error) throw error;
      return data as Pipeline[];
    },
    enabled: !!clientId,
  });
}

// Fetch pipeline stages
export function usePipelineStages(pipelineId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('sort_order');

      if (error) throw error;
      return data as PipelineStage[];
    },
    enabled: !!pipelineId,
  });
}

// Fetch pipeline opportunities
export function usePipelineOpportunities(pipelineId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-opportunities', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      
      const { data, error } = await supabase
        .from('pipeline_opportunities')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('monetary_value', { ascending: false });

      if (error) throw error;
      return data as PipelineOpportunity[];
    },
    enabled: !!pipelineId,
  });
}

// Fetch available GHL pipelines
export function useAvailableGHLPipelines(clientId: string | undefined) {
  return useQuery({
    queryKey: ['available-ghl-pipelines', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines', {
        body: { client_id: clientId, mode: 'list' },
      });

      if (error) throw error;
      return (data?.pipelines || []) as GHLPipeline[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Sync a pipeline from GHL
export function useSyncPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, pipelineId }: { clientId: string; pipelineId: string }) => {
      const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines', {
        body: { client_id: clientId, mode: 'sync', pipeline_id: pipelineId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success(`Pipeline synced: ${data.stages_count} stages, ${data.opportunities_count} opportunities`);
      queryClient.invalidateQueries({ queryKey: ['client-pipelines', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-opportunities'] });
    },
    onError: (error: Error) => {
      const errorMsg = error.message || 'Unknown error';
      if (errorMsg.includes('401') || errorMsg.includes('expired') || errorMsg.includes('Invalid JWT')) {
        toast.error('GHL credentials expired. Please update your API key in Client Settings → Integrations.');
      } else {
        toast.error(`Failed to sync pipeline: ${errorMsg}`);
      }
    },
  });
}

// Remove a pipeline
export function useRemovePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, pipelineId }: { clientId: string; pipelineId: string }) => {
      const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines', {
        body: { client_id: clientId, mode: 'remove', pipeline_id: pipelineId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success('Pipeline removed');
      queryClient.invalidateQueries({ queryKey: ['client-pipelines', variables.clientId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove pipeline: ${error.message}`);
    },
  });
}
