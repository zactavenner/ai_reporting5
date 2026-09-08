/**
 * Request-shape validation for media-buyer-sop-review. Pure and side-effect
 * free so it can be unit tested without booting the function.
 */
export type RequestShape =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; code: string };

export function validateRequestShape(method: string, rawBody: string): RequestShape {
  if (method === 'OPTIONS') return { ok: false, status: 204, error: 'preflight', code: 'preflight' };
  if (method !== 'POST') return { ok: false, status: 405, error: 'Method not allowed — POST only', code: 'method_not_allowed' };
  if (!rawBody.trim()) return { ok: false, status: 400, error: 'Request body required', code: 'missing_body' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: 'Malformed JSON body', code: 'malformed_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'Body must be a JSON object', code: 'malformed_json' };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateClientId(v: unknown): { ok: true; clientId: string } | { ok: false; error: string; code: string } {
  const clientId = typeof v === 'string' ? v.trim() : '';
  if (!clientId || !UUID_RE.test(clientId)) {
    return { ok: false, error: 'client_id (uuid) is required — this endpoint has no portfolio mode', code: 'client_id_required' };
  }
  return { ok: true, clientId };
}
