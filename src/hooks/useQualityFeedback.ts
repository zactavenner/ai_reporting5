import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { setterInvoke } from '@/hooks/useAiSetter';

export const qfInvoke = <T = any>(body: Record<string, unknown>) => setterInvoke<T>('quality-feedback-api', body);

export function useQualityOverview() {
  return useQuery({ queryKey: ['quality-feedback', 'overview'], queryFn: () => qfInvoke({ action: 'overview' }), retry: false });
}

export function useQualityClient(clientId: string) {
  return useQuery({ queryKey: ['quality-feedback', 'client', clientId], queryFn: () => qfInvoke({ action: 'client', client_id: clientId }), retry: false });
}

export function useQualityAction(clientId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => qfInvoke({ ...(clientId ? { client_id: clientId } : {}), ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality-feedback'] }),
    onError: (e: any) => {
      const blockers = e?.payload?.blockers as string[] | undefined;
      toast.error(blockers?.length ? `Not ready: ${blockers.join(' · ')}` : e?.message || 'Request failed');
    },
  });
}
