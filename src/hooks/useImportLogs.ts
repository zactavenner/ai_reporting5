import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ImportLog {
  id: string;
  client_id: string;
  import_type: string;
  file_name: string | null;
  records_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
}

export function useImportLogs(clientId?: string) {
  return useQuery({
    queryKey: ['import-logs', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('csv_import_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ImportLog[];
    },
    enabled: !!clientId,
  });
}

export function useCreateImportLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (log: {
      client_id: string;
      import_type: string;
      file_name?: string;
      records_count: number;
      success_count: number;
      failed_count: number;
    }) => {
      const { data, error } = await supabase
        .from('csv_import_logs')
        .insert(log)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['import-logs', variables.client_id] });
    },
  });
}

export function useDeleteImportWithRecords() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ logId, clientId, importType }: { logId: string; clientId: string; importType: string }) => {
      // Get the import log to know the timestamp range
      const { data: log, error: logError } = await supabase
        .from('csv_import_logs')
        .select('*')
        .eq('id', logId)
        .single();
      
      if (logError) throw logError;
      
      // Delete records based on import type that were created from CSV imports
      if (importType === 'leads') {
        await supabase
          .from('leads')
          .delete()
          .eq('client_id', clientId)
          .eq('source', 'csv-import');
      } else if (importType === 'calls') {
        await supabase
          .from('calls')
          .delete()
          .eq('client_id', clientId)
          .like('external_id', 'csv-import%');
      } else if (importType === 'funded_investors') {
        await supabase
          .from('funded_investors')
          .delete()
          .eq('client_id', clientId)
          .like('external_id', 'csv-import%');
      }
      
      // Delete the import log
      const { error } = await supabase
        .from('csv_import_logs')
        .delete()
        .eq('id', logId);
      
      if (error) throw error;
      return { clientId, importType };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['import-logs', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['leads', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['calls', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['funded-investors', result.clientId] });
      toast.success('Import and records deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });
}
