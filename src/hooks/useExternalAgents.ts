import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { setterInvoke } from '@/hooks/useAiSetter';

export const eaInvoke = <T = any>(body: Record<string, unknown>) => setterInvoke<T>('external-agents-api', body);

export type ExternalAgentState = 'missing_connection' | 'pull_only' | 'ready' | 'test_failed' | 'not_tested';
export type ExternalAgent = {
  id: string; slug: string; display_name: string; provider_label: string; member_id: string | null;
  transport: 'none' | 'push_webhook' | 'pull_mcp' | 'local_worker' | 'remote_mcp';
  runtime: 'codex_cli' | 'claude_code' | 'service' | null; mcp_tool_name: string | null;
  worker_last_seen_at: string | null; worker_info: { host?: string; runtime?: string; version?: string; cli_authenticated?: boolean } | null; test_pending: boolean; endpoint: string | null; supports_idempotency: boolean;
  oauth_linked: boolean; enabled: boolean; last_test_at: string | null; last_test_ok: boolean | null; last_test_detail: string | null;
  signing_secret_set: boolean; outbound_token_set: boolean; state: ExternalAgentState;
  recent: { id: string; kind: string; status: string; task_id: string | null; attempts: number; last_error: string | null; created_at: string }[];
};

export function useExternalAgents() {
  return useQuery({
    queryKey: ['external-agents'],
    queryFn: () => eaInvoke<{ agents: ExternalAgent[]; members: { id: string; name: string; email: string | null }[]; callback_url: string }>({ action: 'list' }),
    retry: false,
  });
}

export function useExternalAgentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => eaInvoke<any>(body),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['external-agents'] }); if (r?.note) toast.message(r.note); },
    onError: (e: any) => toast.error(e?.message || 'Request failed'),
  });
}

export type TeamMessage = {
  id: string; role: string; kind: string; body: string | null; task_id: string | null; sender_name: string | null;
  from_external_agent_id: string | null; hop: number; payload: any; created_at: string;
};

export function useAgentsTeamMessages() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['agents-team'],
    queryFn: () => eaInvoke<{ channel_id: string; messages: TeamMessage[] }>({ action: 'messages' }),
    retry: false,
  });
  const channelId = q.data?.channel_id;
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`agents-team:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_messages', filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey: ['agents-team'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);
  return q;
}
