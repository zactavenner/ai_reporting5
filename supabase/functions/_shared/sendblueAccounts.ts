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
 * Read-only endpoints used to prove credentials, in order. The first 2xx wins
 * and is recorded as the proof. All are GETs and none mutate anything.
 */
export const VERIFY_ENDPOINTS = [
  '/api/v2/lines',
  '/api/v2/numbers',
  '/api/v2/accounts/lines',
  '/api/v2/contacts?limit=1',
  '/api/v2/messages?limit=1',
] as const;

/** Subset of the above that can actually return phone lines. */
export const LINE_ENDPOINTS = ['/api/v2/lines', '/api/v2/numbers', '/api/v2/accounts/lines'] as const;

export function isLineEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  return (LINE_ENDPOINTS as readonly string[]).includes(endpoint);
}

export type ProbeOutcome =
  | { ok: true; status: 'connected'; detail: null }
  | { ok: false; status: 'credentials_rejected' | 'error'; detail: string };

/** Turns one HTTP response into a truthful verification outcome. */
export function classifyProbe(httpStatus: number, bodyText = ''): ProbeOutcome {
  if (httpStatus >= 200 && httpStatus < 300) return { ok: true, status: 'connected', detail: null };
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      status: 'credentials_rejected',
      detail: `Sendblue rejected these credentials (${httpStatus}).`,
    };
  }
  return {
    ok: false,
    status: 'error',
    detail: `Sendblue returned ${httpStatus}${bodyText ? `: ${bodyText.slice(0, 160)}` : ''}`,
  };
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
