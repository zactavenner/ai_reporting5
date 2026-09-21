import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';
import { toast } from 'sonner';

/**
 * All Sendblue data lives in server-only tables, so every read and write goes
 * through the operator-gated edge functions. Credentials are never returned to
 * the browser — only a masked key hint.
 */

export interface SendblueLine {
  id: string;
  client_id: string | null;
  label: string;
  phone_e164: string;
  plan_type: 'inbound_only' | 'outbound';
  status: 'unverified' | 'connected' | 'credentials_rejected' | 'error' | 'disabled';
  active: boolean;
  provisioned_via: string;
  last_tested_at: string | null;
  last_error: string | null;
  notes: string | null;
  has_own_credentials: boolean;
  api_key_masked: string | null;
  account_id: string | null;
  first_inbound_at: string | null;
  last_delivered_at: string | null;
  created_at: string;
}

export interface SendblueAccount {
  id: string;
  client_id: string | null;
  label: string;
  active: boolean;
  status: 'unverified' | 'connected' | 'credentials_rejected' | 'error' | 'disabled';
  verified_at: string | null;
  verify_endpoint: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  notes: string | null;
  api_key_masked: string | null;
  created_at: string;
}

export interface SendblueCoverage {
  accounts_total: number;
  accounts_verified: number;
  clients_total: number;
  clients_with_account: number;
  clients_missing_account: number;
}

export interface SendblueDiscoveredLine {
  phone_e164: string;
  label: string | null;
  provider_line_id: string | null;
  already_imported: boolean;
}

export interface SendblueLineHealth {
  line_id: string;
  client_id: string | null;
  credentials_ok: boolean;
  webhook_receiving: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  message_count: number;
}

export interface SendblueOverview {
  ok: boolean;
  agency_credentials_configured: boolean;
  webhook_secret_configured: boolean;
  lines: SendblueLine[];
  health: SendblueLineHealth[];
  mirrors: { pending: number; mirrored: number; skipped: number; failed: number };
}

export interface SendblueConversation {
  id: string;
  line_id: string;
  client_id: string | null;
  contact_phone: string;
  contact_name: string | null;
  ghl_contact_id: string | null;
  match_state: 'matched' | 'unmatched' | 'ambiguous' | 'no_crm';
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  opted_out: boolean;
}

export interface SendblueMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  body: string | null;
  media_urls: string[];
  status: string;
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
}

export interface SendblueMirrorRow {
  message_id: string;
  status: string;
  skipped_reason: string | null;
  last_error: string | null;
}

async function callAdmin<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sendblue-admin', {
    body: payload,
    headers: dashboardAuthHeaders(),
  });
  if (error) throw await normalizeDashboardError(error);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useSendblueAccounts(clientId?: string) {
  return useQuery({
    queryKey: ['sendblue-accounts', clientId ?? 'all'],
    queryFn: async () => {
      const res = await callAdmin<{ accounts: SendblueAccount[] }>({
        action: 'accounts',
        client_id: clientId ?? null,
      });
      return res.accounts;
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function useSendblueOverview(clientId?: string) {
  return useQuery({
    queryKey: ['sendblue-overview', clientId ?? 'all'],
    queryFn: () => callAdmin<SendblueOverview>({ action: 'overview', client_id: clientId ?? null }),
    retry: false,
    staleTime: 30_000,
  });
}

export function useSendblueConversations(clientId?: string, lineId?: string) {
  return useQuery({
    queryKey: ['sendblue-conversations', clientId ?? 'all', lineId ?? 'all'],
    queryFn: async () => {
      const res = await callAdmin<{ conversations: SendblueConversation[] }>({
        action: 'conversations',
        client_id: clientId ?? null,
        line_id: lineId ?? null,
      });
      return res.conversations;
    },
    retry: false,
    refetchInterval: 30_000,
  });
}

export function useSendblueThread(conversationId?: string) {
  return useQuery({
    queryKey: ['sendblue-thread', conversationId],
    queryFn: async () => {
      const res = await callAdmin<{ messages: SendblueMessage[]; mirrors: SendblueMirrorRow[] }>({
        action: 'messages',
        conversation_id: conversationId,
      });
      return res;
    },
    enabled: Boolean(conversationId),
    retry: false,
    refetchInterval: 15_000,
  });
}

function useAdminMutation<TVars>(
  build: (vars: TVars) => Record<string, unknown>,
  successMessage: (res: any, vars: TVars) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => callAdmin<any>(build(vars)),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['sendblue-overview'] });
      qc.invalidateQueries({ queryKey: ['sendblue-conversations'] });
      const msg = successMessage(res, vars);
      if (msg) toast.success(msg);
    },
    onError: (err: any) => toast.error(err?.message || 'Request failed'),
  });
}

export function useRegisterSendblueLine() {
  return useAdminMutation<{
    client_id?: string | null;
    label: string;
    phone_e164: string;
    plan_type: 'inbound_only' | 'outbound';
    api_key_id?: string;
    api_secret?: string;
    notes?: string;
  }>(
    (vars) => ({ action: 'register_line', ...vars }),
    (res) =>
      res?.line?.status === 'connected'
        ? 'Line saved and connected'
        : 'Line saved — credentials still need to check out',
  );
}

export function useUpdateSendblueLine() {
  return useAdminMutation<Record<string, unknown> & { line_id: string }>(
    (vars) => ({ action: 'update_line', ...vars }),
    () => 'Line updated',
  );
}

export function useTestSendblueLine() {
  return useAdminMutation<{ line_id: string }>(
    (vars) => ({ action: 'test_line', ...vars }),
    (res) => (res?.ok ? 'Line is connected' : `Not connected: ${res?.detail || 'unknown reason'}`),
  );
}

export function useCreateSendblueLine() {
  return useAdminMutation<{ client_id?: string | null; label?: string; confirm?: boolean; provision_payload?: unknown }>(
    (vars) => ({ action: 'create_line', ...vars }),
    (res) => {
      if (res?.stage === 'created') return 'New line created and registered';
      if (res?.stage === 'preview') return 'Sendblue can create a line — confirm to continue';
      return res?.reason || 'Sendblue could not create a line';
    },
  );
}

export function useRunSendblueMirrors() {
  return useAdminMutation<{ limit?: number }>(
    (vars) => ({ action: 'run_mirrors', ...vars }),
    (res) => `Mirror pass done (${(res?.outcomes || []).length} handled)`,
  );
}

export function useSetSendblueOptout() {
  return useAdminMutation<{ line_id: string; phone_e164: string; opted_out: boolean }>(
    (vars) => ({ action: 'set_optout', ...vars }),
    (res) => (res?.opted_out ? 'Contact marked as opted out' : 'Opt-out removed'),
  );
}

export function useSendSendblueMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      line_id: string;
      message: string;
      kind: 'reply' | 'new_conversation' | 'campaign';
      phone?: string;
      contact_name?: string | null;
      recipients?: { phone: string; contact_name?: string | null }[];
      campaign_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('sendblue-send', {
        body: vars,
        headers: dashboardAuthHeaders(),
      });
      if (error) throw await normalizeDashboardError(error);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: boolean; sent: number; blocked: number; results: any[] };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sendblue-thread'] });
      qc.invalidateQueries({ queryKey: ['sendblue-conversations'] });
      if (res.sent > 0 && res.blocked === 0) toast.success(res.sent === 1 ? 'Message sent' : `${res.sent} messages sent`);
      else if (res.sent > 0) toast.warning(`${res.sent} sent, ${res.blocked} blocked`);
      else toast.error(res.results?.[0]?.detail || 'Message was not sent');
    },
    onError: (err: any) => toast.error(err?.message || 'Send failed'),
  });
}
