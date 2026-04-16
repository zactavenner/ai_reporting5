import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SyncProgress {
  isLoading: boolean;
  type: 'leads' | 'calls' | 'single' | null;
  message: string | null;
}

export interface SyncResult {
  success: boolean;
  created?: number;
  updated?: number;
  error?: string;
}

export function useSyncClient(clientId: string | undefined) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgress>({
    isLoading: false,
    type: null,
    message: null,
  });
  const [syncingContactIds, setSyncingContactIds] = useState<Set<string>>(new Set());

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['calls'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['sync-health', clientId] });
    queryClient.invalidateQueries({ queryKey: ['gap-leads'] });
    queryClient.invalidateQueries({ queryKey: ['data-discrepancies'] });
    // Refresh dashboard-critical queries so CRM leads, booked/show calls update immediately
    queryClient.invalidateQueries({ queryKey: ['client-source-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['yesterday-metrics'] });
  }, [queryClient, clientId]);

  const syncLeads = useCallback(async (): Promise<SyncResult> => {
    if (!clientId) return { success: false, error: 'No client ID' };

    setProgress({ isLoading: true, type: 'leads', message: 'Syncing leads from GHL...' });
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { client_id: clientId }
      });

      if (error) throw new Error(error.message);
      if (!data?.success && !data?.results) throw new Error(data?.error || 'Sync failed');

      const created = data?.results?.[0]?.contacts?.created || 0;
      const updated = data?.results?.[0]?.contacts?.updated || 0;

      invalidateQueries();
      toast.success(`Leads synced: ${created} created, ${updated} updated`);
      
      return { success: true, created, updated };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Lead sync failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setProgress({ isLoading: false, type: null, message: null });
    }
  }, [clientId, invalidateQueries]);

  const syncCalls = useCallback(async (): Promise<SyncResult> => {
    if (!clientId) return { success: false, error: 'No client ID' };

    setProgress({ isLoading: true, type: 'calls', message: 'Syncing calls from GHL...' });
    
    try {
      // Use dedicated calls mode to link orphaned calls and sync appointments
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { client_id: clientId, mode: 'calls' }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Sync failed');

      const linked = data?.linked || 0;
      const created = data?.calls_created || 0;
      const updated = data?.calls_updated || 0;

      invalidateQueries();
      toast.success(`Calls synced: ${linked} linked, ${created} created, ${updated} updated`);
      
      return { success: true, created, updated };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Call sync failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setProgress({ isLoading: false, type: null, message: null });
    }
  }, [clientId, invalidateQueries]);

  const syncSingleRecord = useCallback(async (externalId: string): Promise<SyncResult> => {
    if (!clientId) return { success: false, error: 'No client ID' };

    setSyncingContactIds(prev => new Set(prev).add(externalId));
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId, 
          contactId: externalId, 
          mode: 'single' 
        }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Sync failed');

      invalidateQueries();
      toast.success('Record synced from GHL');
      
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Sync failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setSyncingContactIds(prev => {
        const next = new Set(prev);
        next.delete(externalId);
        return next;
      });
    }
  }, [clientId, invalidateQueries]);

  const syncBulkRecords = useCallback(async (externalIds: string[]): Promise<SyncResult> => {
    if (!clientId) return { success: false, error: 'No client ID' };
    if (externalIds.length === 0) return { success: false, error: 'No records selected' };

    setProgress({ 
      isLoading: true, 
      type: 'single', 
      message: `Syncing ${externalIds.length} records...` 
    });
    
    let successCount = 0;
    let errorCount = 0;

    for (const externalId of externalIds) {
      setSyncingContactIds(prev => new Set(prev).add(externalId));
      
      try {
        const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
          body: { 
            client_id: clientId, 
            contactId: externalId, 
            mode: 'single' 
          }
        });

        if (error || !data?.success) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      } finally {
        setSyncingContactIds(prev => {
          const next = new Set(prev);
          next.delete(externalId);
          return next;
        });
      }
    }

    invalidateQueries();
    
    if (errorCount === 0) {
      toast.success(`Successfully synced ${successCount} records`);
      return { success: true, updated: successCount };
    } else {
      toast.warning(`Synced ${successCount} records, ${errorCount} failed`);
      return { success: true, updated: successCount, error: `${errorCount} failed` };
    }
  }, [clientId, invalidateQueries]);

  const isSyncingContact = useCallback((id: string) => syncingContactIds.has(id), [syncingContactIds]);

  return {
    progress,
    syncLeads,
    syncCalls,
    syncSingleRecord,
    syncBulkRecords,
    isSyncingContact,
    syncingContactIds,
  };
}
