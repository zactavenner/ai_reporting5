/**
 * Sendblue account onboarding helpers — pure and testable.
 *
 * Rules encoded here:
 *  - "Saved" is never "connected". A connection is only claimed after a real
 *    read-only Sendblue call returned 2xx, and we record which endpoint proved it.
 *  - Line discovery is read-only. If Sendblue exposes no line listing on the
 *    account's plan, we say so instead of inventing numbers.
 *  - Imports never create duplicates: a number already registered is reported
 *    as already imported, never inserted again.
 */

import { normalizeE164 } from './sendblue.ts';

/**
 * Read-only endpoints used to prove credentials, in order. All are documented in
 * the official Sendblue API v2 reference (https://docs.sendblue.com/api-v2):
 * assigned numbers live at GET /api/lines — not under /api/v2 — while messages
 * and contacts are the documented /api/v2 collections. Nothing here mutates.
 */
export const VERIFY_ENDPOINTS = [
  '/api/lines',
  '/api/v2/messages?limit=1',
  '/api/v2/contacts?limit=1',
] as const;

/** The documented endpoint that returns the account's assigned phone lines. */
export const LINE_ENDPOINTS = ['/api/lines'] as const;

export function isLineEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  return (LINE_ENDPOINTS as readonly string[]).includes(endpoint);
}

export type ProbeOutcome =
  | { ok: true; status: 'connected'; detail: null }
  | { ok: false; status: 'credentials_rejected' | 'error'; detail: string };

/**
 * Turns one HTTP response into a truthful verification outcome.
 *
 * A 2xx alone is NOT proof: Sendblue answers some failures with HTTP 200 and a
 * body-level `status: "ERROR"`, and a misrouted request can return HTML. So the
 * body must parse as JSON and must not carry an error status before we claim the
 * credentials are verified.
 */
export function classifyProbe(httpStatus: number, bodyText = ''): ProbeOutcome {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      status: 'credentials_rejected',
      detail: `Sendblue rejected these credentials (${httpStatus}).`,
    };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    const bodyError = bodyLevelError(bodyText);
    return {
      ok: false,
      status: 'error',
      detail: `Sendblue returned ${httpStatus}${bodyError ? `: ${bodyError}` : bodyText ? `: ${bodyText.slice(0, 160)}` : ''}`,
    };
  }

  const text = (bodyText || '').trim();
  if (!text) {
    return { ok: false, status: 'error', detail: 'Sendblue returned an empty response — not treated as verified.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: 'error',
      detail: `Sendblue returned a non-JSON response (${text.slice(0, 80)}) — not treated as verified.`,
    };
  }
  const bodyError = bodyLevelErrorFrom(parsed);
  if (bodyError) {
    // Body-level ERROR with a 2xx: authentication failures surface this way.
    const rejected = /api key|api secret|unauthor|forbidden|credential|authenticat/i.test(bodyError);
    return {
      ok: false,
      status: rejected ? 'credentials_rejected' : 'error',
      detail: `Sendblue reported an error: ${bodyError}`,
    };
  }
  return { ok: true, status: 'connected', detail: null };
}

/** Reads Sendblue's body-level error status, whatever wording it uses. */
export function bodyLevelErrorFrom(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const status = typeof obj.status === 'string' ? obj.status.trim().toUpperCase() : '';
  const message =
    pickString(obj, ['error_message', 'error', 'message', 'detail', 'errorMessage']) || '';
  const isError =
    status === 'ERROR' ||
    status === 'FAILED' ||
    status === 'FAILURE' ||
    obj.success === false ||
    Boolean(pickString(obj, ['error_message', 'errorMessage']));
  if (!isError) return null;
  return message || `status ${status || 'ERROR'}`;
}

function bodyLevelError(bodyText: string): string | null {
  try {
    return bodyLevelErrorFrom(JSON.parse(bodyText));
  } catch {
    return null;
  }
}

export interface DiscoveredLine {
  phone_e164: string;
  label: string | null;
  provider_line_id: string | null;
  raw: Record<string, unknown>;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Pulls phone lines out of whatever shape Sendblue returned. Accepts a bare
 * array, `{ data: [...] }`, `{ lines: [...] }` or `{ numbers: [...] }`.
 * Anything without a usable phone number is dropped.
 */
export function extractProviderLines(payload: unknown): DiscoveredLine[] {
  const container = payload as Record<string, unknown> | unknown[] | null;
  let rows: unknown[] = [];
  if (Array.isArray(container)) rows = container;
  else if (container && typeof container === 'object') {
    for (const key of ['data', 'lines', 'numbers', 'results', 'items']) {
      const value = (container as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        rows = value;
        break;
      }
    }
  }

  const seen = new Set<string>();
  const out: DiscoveredLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const phone = normalizeE164(
      pickString(obj, ['number', 'phone_number', 'phone', 'from_number', 'e164', 'line_number']),
    );
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      phone_e164: phone,
      label: pickString(obj, ['label', 'name', 'nickname', 'friendly_name', 'description']),
      provider_line_id: pickString(obj, ['id', 'line_id', 'number_id', 'subscription_id']),
      raw: obj,
    });
  }
  return out;
}

export interface ImportPlanEntry {
  phone_e164: string;
  label: string;
  provider_line_id: string | null;
  raw: Record<string, unknown>;
}

export interface ImportPlan {
  toInsert: ImportPlanEntry[];
  alreadyImported: string[];
  invalid: string[];
}

/**
 * Decides exactly which of the requested numbers get written. Numbers already
 * registered anywhere in the platform are reported, never duplicated.
 */
export function planLineImport(
  discovered: DiscoveredLine[],
  requestedPhones: unknown[],
  existingPhones: string[],
  fallbackLabel = 'Sendblue line',
): ImportPlan {
  const existing = new Set(existingPhones.filter(Boolean));
  const byPhone = new Map(discovered.map((d) => [d.phone_e164, d]));
  const plan: ImportPlan = { toInsert: [], alreadyImported: [], invalid: [] };
  const handled = new Set<string>();

  for (const raw of requestedPhones) {
    const phone = normalizeE164(raw);
    if (!phone || !byPhone.has(phone)) {
      plan.invalid.push(typeof raw === 'string' ? raw : String(raw));
      continue;
    }
    if (handled.has(phone)) continue;
    handled.add(phone);
    if (existing.has(phone)) {
      plan.alreadyImported.push(phone);
      continue;
    }
    const found = byPhone.get(phone)!;
    plan.toInsert.push({
      phone_e164: phone,
      label: found.label || `${fallbackLabel} ${phone}`,
      provider_line_id: found.provider_line_id,
      raw: found.raw,
    });
  }
  return plan;
}

export interface ConnectionSignalInput {
  credentialsVerifiedAt: string | null;
  webhookSecretConfigured: boolean;
  firstInboundAt: string | null;
  lastDeliveredAt: string | null;
}

export interface ConnectionSignals {
  credentials_verified: boolean;
  credentials_verified_at: string | null;
  webhook_configured: boolean;
  first_inbound_received: boolean;
  first_inbound_at: string | null;
  outbound_delivery_confirmed: boolean;
  last_delivered_at: string | null;
  fully_proven: boolean;
}

/**
 * The four independent proofs, never collapsed into one "connected" claim.
 * Saving credentials alone proves nothing.
 */
export function connectionSignals(input: ConnectionSignalInput): ConnectionSignals {
  const credentials = Boolean(input.credentialsVerifiedAt);
  const inbound = Boolean(input.firstInboundAt);
  const delivered = Boolean(input.lastDeliveredAt);
  return {
    credentials_verified: credentials,
    credentials_verified_at: input.credentialsVerifiedAt,
    webhook_configured: Boolean(input.webhookSecretConfigured),
    first_inbound_received: inbound,
    first_inbound_at: input.firstInboundAt,
    outbound_delivery_confirmed: delivered,
    last_delivered_at: input.lastDeliveredAt,
    fully_proven: credentials && Boolean(input.webhookSecretConfigured) && inbound && delivered,
  };
}

/* ---------------- webhook registration (append-only) ---------------- */

/**
 * Sendblue's webhook API: GET /api/account/webhooks lists them, POST **appends**
 * one, PUT **replaces every** webhook. We therefore only ever POST, and only for
 * the hooks that are genuinely missing — existing hooks and the account-level
 * global secret are never touched.
 */
export const WEBHOOKS_ENDPOINT = '/api/account/webhooks';

export type WebhookType = 'receive' | 'outbound';

export interface ProviderWebhook {
  url: string;
  type: WebhookType | string;
  has_secret: boolean;
  raw: Record<string, unknown>;
}

/** Compares webhook URLs the way a provider would: case/trailing-slash tolerant. */
export function canonicalWebhookUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** Reads the webhook list out of whatever wrapper Sendblue returns. */
export function parseProviderWebhooks(payload: unknown): ProviderWebhook[] {
  const container = payload as Record<string, unknown> | unknown[] | null;
  let rows: unknown[] = [];
  if (Array.isArray(container)) rows = container;
  else if (container && typeof container === 'object') {
    for (const key of ['webhooks', 'data', 'results', 'items', 'hooks']) {
      const value = (container as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        rows = value;
        break;
      }
    }
  }

  const out: ProviderWebhook[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const url = pickString(obj, ['url', 'webhook_url', 'endpoint', 'target_url']);
    if (!url) continue;
    const type = pickString(obj, ['type', 'event', 'webhook_type', 'kind']) || '';
    out.push({
      url,
      type: type.toLowerCase(),
      has_secret: Boolean(pickString(obj, ['secret', 'signing_secret', 'webhook_secret'])),
      raw: obj,
    });
  }
  return out;
}

export interface WebhookPlanEntry {
  url: string;
  type: WebhookType;
}

export interface WebhookPlan {
  toAppend: WebhookPlanEntry[];
  alreadyPresent: WebhookPlanEntry[];
  /** Hooks belonging to anything else — must survive untouched. */
  preserved: ProviderWebhook[];
}

/**
 * Decides which Reporting hooks still need appending. Any hook we do not own is
 * listed under `preserved` so callers can prove nothing was removed.
 */
export function planWebhookRegistration(
  existing: ProviderWebhook[],
  desired: WebhookPlanEntry[],
): WebhookPlan {
  const plan: WebhookPlan = { toAppend: [], alreadyPresent: [], preserved: [] };
  const desiredKeys = new Set<string>();

  for (const want of desired) {
    const key = `${canonicalWebhookUrl(want.url)}|${want.type}`;
    if (desiredKeys.has(key)) continue;
    desiredKeys.add(key);
    const match = existing.find(
      (e) => canonicalWebhookUrl(e.url) === canonicalWebhookUrl(want.url) && e.type === want.type,
    );
    if (match) plan.alreadyPresent.push(want);
    else plan.toAppend.push(want);
  }

  for (const hook of existing) {
    const key = `${canonicalWebhookUrl(hook.url)}|${hook.type}`;
    if (!desiredKeys.has(key)) plan.preserved.push(hook);
  }
  return plan;
}

/** Confirms, from a fresh readback, that every desired hook is really there. */
export function verifyWebhookReadback(
  after: ProviderWebhook[],
  desired: WebhookPlanEntry[],
): { ok: boolean; missing: WebhookPlanEntry[]; registered: WebhookPlanEntry[] } {
  const missing: WebhookPlanEntry[] = [];
  const registered: WebhookPlanEntry[] = [];
  for (const want of desired) {
    const found = after.some(
      (e) => canonicalWebhookUrl(e.url) === canonicalWebhookUrl(want.url) && e.type === want.type,
    );
    (found ? registered : missing).push(want);
  }
  return { ok: missing.length === 0, missing, registered };
}

export interface WebhookHealthInput {
  receiveRegisteredAt: string | null;
  outboundRegisteredAt: string | null;
  firstInboundAt: string | null;
  lastDeliveredAt: string | null;
}

export interface WebhookHealth {
  receive_hook_registered: boolean;
  outbound_hook_registered: boolean;
  /** Registration is a setting; these two are real observed traffic. */
  inbound_observed: boolean;
  delivery_observed: boolean;
  status: 'not_configured' | 'registered_no_traffic' | 'partially_registered' | 'live';
}

/**
 * Keeps "the hook is registered with Sendblue" strictly separate from "a real
 * message actually arrived" — a registered hook is never reported as live.
 */
export function webhookHealth(input: WebhookHealthInput): WebhookHealth {
  const receive = Boolean(input.receiveRegisteredAt);
  const outbound = Boolean(input.outboundRegisteredAt);
  const inbound = Boolean(input.firstInboundAt);
  const delivered = Boolean(input.lastDeliveredAt);
  let status: WebhookHealth['status'] = 'not_configured';
  if (receive && outbound) status = inbound || delivered ? 'live' : 'registered_no_traffic';
  else if (receive || outbound) status = 'partially_registered';
  return {
    receive_hook_registered: receive,
    outbound_hook_registered: outbound,
    inbound_observed: inbound,
    delivery_observed: delivered,
    status,
  };
}
