import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncResult {
  success: boolean;
  contact?: {
    id: string;
    name: string;
    ghl_synced_at: string;
  };
  error?: string;
}

interface PipelineSyncResult {
  success: boolean;
  pipelinesSynced?: number;
  error?: string;
}

export function useSingleContactSync() {
  const queryClient = useQueryClient();
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [isSyncingPipelines, setIsSyncingPipelines] = useState(false);

  const syncContact = async (
    clientId: string, 
    externalId: string, 
    recordType: 'lead' | 'call'
  ): Promise<SyncResult> => {
    // Add to syncing set
    setSyncingIds(prev => new Set(prev).add(externalId));
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId, 
          contactId: externalId, 
          mode: 'single' 
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to sync contact');
      }
      
      if (!data?.success) {
        throw new Error(data?.error || 'Sync failed');
      }
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      
      toast.success('Contact synced from GHL');
      return { success: true, contact: data.contact };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Sync failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      // Remove from syncing set
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(externalId);
        return next;
      });
    }
  };

  // Sync all pipelines and opportunities for a client
  const syncAllPipelines = async (clientId: string): Promise<PipelineSyncResult> => {
    setIsSyncingPipelines(true);
    
    try {
      // First, get all tracked pipelines for this client
      const { data: pipelines, error: pipelineError } = await supabase
        .from('client_pipelines')
        .select('ghl_pipeline_id')
        .eq('client_id', clientId);
      
      if (pipelineError) {
        throw new Error('Failed to fetch pipelines');
      }
      
      if (!pipelines || pipelines.length === 0) {
        toast.info('No pipelines configured for this client');
        return { success: true, pipelinesSynced: 0 };
      }
      
      // Sync each pipeline
      let syncedCount = 0;
      for (const pipeline of pipelines) {
        const { data, error } = await supabase.functions.invoke('sync-ghl-pipelines', {
          body: { 
            client_id: clientId, 
            mode: 'sync',
            pipeline_id: pipeline.ghl_pipeline_id
          }
        });
        
        if (!error && data?.success) {
          syncedCount++;
        }
      }
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['client-pipelines', clientId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities', clientId] });
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['funded-investors', clientId] });
      
      toast.success(`Synced ${syncedCount} pipeline(s) with all opportunities`);
      return { success: true, pipelinesSynced: syncedCount };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Pipeline sync failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setIsSyncingPipelines(false);
    }
  };

  const isSyncing = (id: string) => syncingIds.has(id);

  return { syncContact, syncingIds, isSyncing, syncAllPipelines, isSyncingPipelines };
}
