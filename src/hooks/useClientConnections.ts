/**
 * Single canonical data layer for Client Connections & Settings.
 *
 * The Huddle client card and the client dashboard Settings tab both use these
 * hooks, so there is exactly ONE store: `client_offers`, `client_ad_accounts`,
 * `client_settings_audit` (read directly) and the `client-connections` edge
 * function (every write). Saving in either surface invalidates the same query
 * keys, so the other surface shows the change immediately.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';
import { toast } from 'sonner';
import {
  computeRollup,
  type RollupSummary,
} from '../../supabase/functions/_shared/clientConnections';
import { CONNECTION_TIMEOUT_MS, countVisibleOffers, withTimeout } from '@/lib/connectionsDisplay';

export type SettingsSource = 'huddle' | 'client_settings' | 'agent_api';

export interface ClientAdAccount {
  id: string;
  client_id: string;
  provider: string;
  provider_account_id: string;
  account_name: string | null;
  business_id: string | null;
  status: 'active' | 'paused' | 'disconnected' | 'unknown';
  is_primary: boolean;
  rollup_enabled: boolean;
  currency: string | null;
  timezone_name: string | null;
  token_source: string | null;
  connection_state: string;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  campaigns_count: number | null;
  adsets_count: number | null;
  ads_total: number | null;
  ads_active: number | null;
  ads_paused: number | null;
  counts_updated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ConnectionOffer {
  id: string;
  client_id: string;
  title: string;
  offer_type: string | null;
  status: 'active' | 'paused' | 'archived';
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface IntegrationMetadata {
  client: { id: string; name: string };
  meta: {
    status: string;
    token_source: string;
    secret_present: boolean;
    last4: string | null;
    token_label: string | null;
    scopes: string[] | null;
    last_verified_at: string | null;
  };
  ghl: {
    status: string;
    location_id: string | null;
    secret_present: boolean;
    last4: string | null;
    scopes: string[] | null;
    last_verified_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
  };
  rollup: RollupSummary;
}

export interface AuditEntry {
  id: string;
  client_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  source: SettingsSource;
  actor_label: string | null;
  changes: Record<string, unknown>;
  created_at: string;
}

async function callConnections<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('client-connections', {
    body: payload,
    headers: dashboardAuthHeaders(),
  });
  if (error) throw await normalizeDashboardError(error);
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as T;
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

export function useClientAdAccounts(clientId?: string) {
  return useQuery({
    queryKey: ['client-ad-accounts', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_ad_accounts' as any)
        .select('*')
        .eq('client_id', clientId!)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ClientAdAccount[];
    },
    enabled: !!clientId,
  });
}

export function useConnectionOffers(clientId?: string) {
  return useQuery({
    queryKey: ['connection-offers', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_offers' as any)
        .select('id, client_id, title, offer_type, status, is_primary, notes, created_at, updated_at, updated_by')
        .eq('client_id', clientId!)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ConnectionOffer[];
    },
    enabled: !!clientId,
  });
}

export function useClientIntegrations(clientId?: string, enabled = true) {
  return useQuery({
    queryKey: ['client-integrations', clientId],
    // Hard timeout: a hung edge call must surface as an error state, never as
    // an indefinite "Loading connection status…" spinner.
    queryFn: () =>
      withTimeout(
        callConnections<IntegrationMetadata>({ action: 'get_integrations', client_id: clientId }),
        CONNECTION_TIMEOUT_MS,
      ),
    enabled: !!clientId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useConnectionAudit(clientId?: string, limit = 20) {
  return useQuery({
    queryKey: ['connection-audit', clientId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_settings_audit' as any)
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as AuditEntry[];
    },
    enabled: !!clientId,
  });
}

/** Header chips shared by both surfaces. Missing counts stay null, never zero. */
export function useConnectionsSummary(clientId?: string) {
  const accounts = useClientAdAccounts(clientId);
  const offers = useConnectionOffers(clientId);
  const rollup = computeRollup((accounts.data || []) as any);
  return {
    isLoading: accounts.isLoading || offers.isLoading,
    // Same records the Offers panel renders: everything not archived, legacy
    // rows with no status included.
    offersActive: countVisibleOffers(offers.data || []),
    rollup,
    accounts: accounts.data || [],
    offers: offers.data || [],
  };
}

/* ────────────────────────────── Mutations ───────────────────────────────── */

function useInvalidate(clientId?: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      ['client-ad-accounts', clientId],
      ['connection-offers', clientId],
      ['client-integrations', clientId],
      ['client-offers', clientId],
      ['client', clientId],
      ['clients'],
    ]) {
      qc.invalidateQueries({ queryKey: key as any });
    }
    qc.invalidateQueries({ queryKey: ['connection-audit', clientId] });
  };
}

export function useSaveOffer(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: async (input: {
      offer_id?: string;
      title?: string;
      offer_type?: string;
      status?: string;
      notes?: string | null;
      is_primary?: boolean;
    }) => {
      const { offer_id, ...offer } = input;
      return callConnections({
        action: offer_id ? 'update_offer' : 'create_offer',
        client_id: clientId,
        offer_id,
        offer,
        source,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success('Offer saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddAdAccount(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (input: {
      provider_account_id: string;
      account_name?: string;
      is_primary?: boolean;
      rollup_enabled?: boolean;
    }) => callConnections<any>({ action: 'add_ad_account', client_id: clientId, source, ...input }),
    onSuccess: (res: any) => {
      invalidate();
      if (res?.idempotent) toast.info('That ad account was already linked to this client');
      else if (res?.propagation?.verified) toast.success('Ad account linked — initial sync started');
      else toast.warning('Ad account saved, but Meta verification did not pass yet');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePatchAdAccount(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (input: { ad_account_id: string; updates: Record<string, unknown> }) =>
      callConnections({ action: 'patch_ad_account', client_id: clientId, source, ...input }),
    onSuccess: () => {
      invalidate();
      toast.success('Ad account updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDisconnectAdAccount(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (adAccountId: string) =>
      callConnections({ action: 'disconnect_ad_account', client_id: clientId, ad_account_id: adAccountId, source }),
    onSuccess: () => {
      invalidate();
      toast.success('Ad account disconnected');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTestConnection(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (input: { integration: 'meta' | 'ghl'; ad_account_id?: string }) =>
      callConnections<any>({ action: 'test_connection', client_id: clientId, source, ...input }),
    onSuccess: (res: any) => {
      invalidate();
      if (res?.ok) toast.success('Connection verified');
      else toast.error(res?.error || res?.results?.find((r: any) => !r.ok)?.error || 'Connection test failed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSyncAdAccount(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (providerAccountId: string) =>
      callConnections<any>({ action: 'sync_ad_account', client_id: clientId, provider_account_id: providerAccountId, source }),
    onSuccess: (res: any) => {
      invalidate();
      if (res?.ok) toast.success('Sync started for this ad account');
      else toast.error(res?.error || 'Could not start the sync');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReplaceCredential(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (input: { integration: 'meta' | 'ghl'; value: string; location_id?: string }) =>
      callConnections({ action: 'replace_credential', client_id: clientId, source, ...input }),
    onSuccess: () => {
      invalidate();
      toast.success('Credential saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeCredential(clientId?: string, source: SettingsSource = 'client_settings') {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (integration: 'meta' | 'ghl') =>
      callConnections({ action: 'revoke_credential', client_id: clientId, integration, source }),
    onSuccess: () => {
      invalidate();
      toast.success('Credential removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export { computeRollup };
export type { RollupSummary };
