import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';
import { toast } from 'sonner';

export async function setterInvoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body, headers: dashboardAuthHeaders() });
  if (error) throw await normalizeDashboardError(error);
  if ((data as any)?.error) {
    const e = new Error(String((data as any).error));
    (e as any).payload = data;
    throw e;
  }
  return data as T;
}

export interface SetterOverview {
  client: { id: string; name: string };
  settings: any | null;
  readiness: {
    openai: string; sip: string; bridge: string; webhook_secret: string;
    outbound_sip_enabled: boolean | null;
    models: { realtime: string; live: string; responses: string };
  };
  campaigns: any[];
  queue: any[];
  slots: any[];
  holds: any[];
  bookings: any[];
  sessions: any[];
}

export function useAiSetterOverview(clientId: string) {
  return useQuery({
    queryKey: ['ai-setter', clientId],
    queryFn: () => setterInvoke<SetterOverview>('ai-setter-api', { action: 'overview', client_id: clientId }),
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useAiSetterAction(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => setterInvoke('ai-setter-api', { ...body, client_id: clientId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-setter', clientId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
