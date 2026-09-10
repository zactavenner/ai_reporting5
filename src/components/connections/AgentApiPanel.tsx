/**
 * "API copy for agents" panel — reference documentation an operator can copy
 * into an agent brief. Every example uses PLACEHOLDERS only; no real credential,
 * token or session value is ever rendered or copied from here.
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, Terminal } from 'lucide-react';
import { toast } from 'sonner';

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connections-api`;

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success('Copied');
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error('Could not copy — select the text manually');
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

function Block({ title, code }: { title: string; code: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">{title}</div>
        <CopyButton text={code} />
      </div>
      <pre className="text-[11px] bg-muted/50 border rounded-md p-2.5 overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

const ENDPOINTS: { method: string; path: string; purpose: string }[] = [
  { method: 'GET', path: '/clients?limit=50&offset=0&search=&status=active', purpose: 'Clients with connection summaries (paginated, filterable)' },
  { method: 'GET', path: '/ad-accounts?limit=50&offset=0&rollup_enabled=true', purpose: 'Agency-wide: every authorized client’s ad accounts' },
  { method: 'GET', path: '/clients/{client_id}/offers?include_archived=false', purpose: 'Offers for one client' },
  { method: 'POST', path: '/clients/{client_id}/offers', purpose: 'Create an offer' },
  { method: 'PATCH', path: '/clients/{client_id}/offers/{offer_id}', purpose: 'Edit / archive an offer (never hard-deleted)' },
  { method: 'GET', path: '/clients/{client_id}/ad-accounts', purpose: 'Ad-account connections + roll-up for one client' },
  { method: 'POST', path: '/clients/{client_id}/ad-accounts', purpose: 'Add/link an ad-account connection (accepts Idempotency-Key)' },
  { method: 'PATCH', path: '/clients/{client_id}/ad-accounts/{id}', purpose: 'Update label, primary, roll-up enabled, status' },
  { method: 'POST', path: '/clients/{client_id}/ad-accounts/{id}/sync', purpose: 'Queue the existing Meta sync for that account' },
  { method: 'POST', path: '/clients/{client_id}/integrations/{meta|ghl}/test', purpose: 'Test a connection' },
  { method: 'GET', path: '/clients/{client_id}/integrations', purpose: 'Safe metadata only: status, last four, timestamps' },
  { method: 'PUT', path: '/clients/{client_id}/integrations/{meta|ghl}/credential', purpose: 'Replace a credential server-side; never returned' },
];

export function AgentApiPanel() {
  const addExample = useMemo(
    () =>
      [
        `curl -X POST "${BASE_URL}/clients/{CLIENT_UUID}/ad-accounts" \\`,
        `  -H "Authorization: Bearer {OPERATOR_SESSION_JWT}" \\`,
        `  -H "x-dashboard-token: {DASHBOARD_SESSION_TOKEN}" \\`,
        `  -H "Idempotency-Key: {UNIQUE_RETRY_KEY}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{`,
        `        "provider": "meta",`,
        `        "provider_account_id": "act_{META_AD_ACCOUNT_ID}",`,
        `        "account_name": "Ad account v2",`,
        `        "is_primary": false,`,
        `        "rollup_enabled": true`,
        `      }'`,
      ].join('\n'),
    [],
  );

  const addResponse = `HTTP 201
{
  "data": {
    "id": "{AD_ACCOUNT_CONNECTION_UUID}",
    "client_id": "{CLIENT_UUID}",
    "provider": "meta",
    "provider_account_id": "{META_AD_ACCOUNT_ID}",
    "account_name": "Ad account v2",
    "status": "active",
    "is_primary": false,
    "rollup_enabled": true,
    "connection_state": "sync_running",
    "campaigns_count": 12,
    "adsets_count": 34,
    "ads_total": 88,
    "ads_active": 41,
    "ads_paused": 47,
    "last_verified_at": "2026-09-10T18:00:00.000Z"
  },
  "idempotent": false,
  "propagation": {
    "saved": true,
    "verified": true,
    "verification_error": null,
    "counts_available": true,
    "reporting_roster": { "primary": "{PRIMARY_ID}", "all": ["{PRIMARY_ID}", "{META_AD_ACCOUNT_ID}"] },
    "sync": "sync_running",
    "sync_error": null,
    "reporting_state": "partial"
  },
  "note": "Links an existing Meta ad account to this client for Reporting 5.0. No ad account is created in Meta Business Manager and no billing is changed."
}`;

  const schemas = `AdAccountConnection {
  id: uuid, client_id: uuid, provider: "meta",
  provider_account_id: string (digits, act_ prefix accepted on input),
  account_name: string|null, business_id: string|null,
  status: "active"|"paused"|"disconnected"|"unknown",
  is_primary: boolean, rollup_enabled: boolean,
  currency: string|null, timezone_name: string|null, token_source: string,
  connection_state: "saved"|"verification_pending"|"verified"|"sync_queued"
                  |"sync_running"|"reporting_current"|"partial"|"failed",
  last_verified_at, last_sync_at, last_sync_status, last_sync_error,
  campaigns_count|adsets_count|ads_total|ads_active|ads_paused: integer|null  // null = unknown, NOT zero
  counts_updated_at, created_at, updated_at, created_by, updated_by
}

Offer { id, client_id, title, offer_type, status: "active"|"paused"|"archived",
        is_primary, notes, created_at, updated_at, updated_by }

IntegrationMetadata { status, secret_present: boolean, last4: string|null,
                      scopes: string[]|null, location_id?, rollup }

Page { limit (1–200, default 50), offset, returned, total, has_more, next_offset }`;

  const errors = `401 unauthorized                                 no/invalid operator session
403 forbidden                                    signed in but not an agency operator
400 invalid_client_id | invalid_offer_id | invalid_ad_account_id
400 invalid_limit | invalid_offset | invalid_json | validation_failed
400 unsupported_integration                      only meta and ghl
404 route_not_found | client_not_found
405 method_not_allowed
409 ad_account_owned_by_other_client             never moved automatically
409 idempotency_key_reused_with_different_body
500 internal_error                               sanitized message, no credentials`;

  const listExample = `curl "${BASE_URL}/ad-accounts?limit=50&offset=0" \\
  -H "Authorization: Bearer {OPERATOR_SESSION_JWT}" \\
  -H "x-dashboard-token: {DASHBOARD_SESSION_TOKEN}"`;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4" /> API copy for agents
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Paste-ready reference for agents and internal automation. Placeholders only — no real credentials appear here.
          </p>
        </div>
        <CopyButton text={BASE_URL} label="Copy base URL" />
      </div>

      <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] font-mono break-all">{BASE_URL}</div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium">Endpoints</div>
          <CopyButton text={ENDPOINTS.map((e) => `${e.method} ${BASE_URL}${e.path}  — ${e.purpose}`).join('\n')} label="Copy all" />
        </div>
        <div className="space-y-1">
          {ENDPOINTS.map((e) => (
            <div key={`${e.method}${e.path}`} className="flex items-start gap-2 text-[11px] border-b last:border-0 pb-1">
              <Badge variant="outline" className="font-mono shrink-0">{e.method}</Badge>
              <span className="font-mono break-all">{e.path}</span>
              <span className="text-muted-foreground ml-auto text-right hidden sm:block">{e.purpose}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-amber-500/5 border-amber-500/30 p-2.5 text-[11px] space-y-1">
        <div className="font-medium">Roles &amp; scope</div>
        <div>
          Authorization reuses the existing operator boundary: an agency admin/owner dashboard session token, or a
          provisioned reporting operator, or a trusted server-side caller. Every list endpoint returns only clients and
          ad accounts authorized for the caller, and credential fields are never exposed — writes accept a credential,
          reads only ever return status, last four, scopes and timestamps.
        </div>
        <div>
          Naming: <span className="font-mono">POST /ad-accounts</span> creates/links a Reporting 5.0 ad-account
          connection. It does not create an ad account inside Meta Business Manager and never changes billing.
        </div>
      </div>

      <Block title="Canonical example — “Add Ad Account v2”" code={addExample} />
      <Block title="Returned propagation object (saved / verified / sync / reporting)" code={addResponse} />
      <Block title="Agency-wide listing with pagination" code={listExample} />
      <Block title="JSON schemas" code={schemas} />
      <Block title="Error codes" code={errors} />

      <div className="text-[11px] text-muted-foreground">
        Idempotency: send a unique <span className="font-mono">Idempotency-Key</span> header on
        <span className="font-mono"> POST /ad-accounts</span>. A retry with the same key and body replays the original
        response (<span className="font-mono">Idempotency-Replayed: true</span>); the same key with a different body is
        rejected. A saved connection is not the same as synced reporting — read{' '}
        <span className="font-mono">propagation.reporting_state</span> before treating numbers as live.
      </div>
    </Card>
  );
}
