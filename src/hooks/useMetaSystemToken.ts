/**
 * Client Meta System User Token — status + actions via the `meta-system-token`
 * function. Only metadata is cached. The pasted token is sent once through
 * `submitMetaSystemToken` (a plain call, NOT a React Query mutation, so it is
 * never kept in the mutation cache) and is never stored in the browser.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';
import type { MetaSystemTokenStatus } from '@/lib/metaSystemTokenDisplay';

export const metaSystemTokenKey = (clientId?: string) => ['meta-system-token', clientId];

type Reply = MetaSystemTokenStatus & { saved?: boolean; error?: string; message?: string };

async function call(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke('meta-system-token', {
    body,
    headers: dashboardAuthHeaders(),
  });
  if (error) throw await normalizeDashboardError(error);
  const d = data as Reply;
  if (d?.error && d.saved !== false) throw new Error(d.message || d.error);
  return d;
}

/** Strip reply-only fields so the cache holds the plain status payload. */
function toStatus(r: Reply): MetaSystemTokenStatus {
  const { saved: _s, error: _e, message: _m, ...status } = r;
  return status;
}

export function useMetaSystemTokenStatus(clientId?: string) {
  return useQuery({
    queryKey: metaSystemTokenKey(clientId),
    queryFn: async () => toStatus(await call({ action: 'status', client_id: clientId })),
    enabled: !!clientId,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Validates with Meta, then stores only if valid. Returns the outcome message. */
export async function submitMetaSystemToken(
  clientId: string,
  token: string,
): Promise<{ saved: boolean; status: MetaSystemTokenStatus; message: string | null }> {
  const r = await call({ action: 'set', client_id: clientId, token });
  return { saved: r.saved === true, status: toStatus(r), message: r.message ?? null };
}

export function useMetaSystemTokenAction(clientId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'delete' | 'revalidate') => toStatus(await call({ action, client_id: clientId })),
    onSuccess: (status, action) => {
      qc.setQueryData(metaSystemTokenKey(clientId), status);
      qc.invalidateQueries({ queryKey: ['connection-audit', clientId] });
      if (action === 'delete') toast.success('System user token removed — pulls use the user token again');
      else if (status.status === 'active') toast.success('System user token re-checked — active');
      else toast.warning(status.last_error || 'System user token needs attention');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
