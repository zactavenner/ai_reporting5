/**
 * Pure, injectable request handler for media-buyer-sop-review.
 *
 * Extracted so the ordering guarantee that MATTERS can actually be tested
 * without a database or a deployed function: authorization runs BEFORE any
 * privileged read, and an unauthorized caller triggers ZERO loads. The edge
 * function is a thin wrapper that supplies the real Supabase-backed deps.
 */
import { SOP_NARRATOR_SYSTEM_PROMPT, buildOperatingInstructions } from './mediaBuyerSop.ts';
import { validateClientId, validateRequestShape } from './mediaBuyerSopRequest.ts';
import type { LoadedClientSop } from './mediaBuyerSopRead.ts';

export interface SopAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  code?: string;
  via?: string;
  clientId?: string;
}

export interface SopReviewDeps {
  method: string;
  rawBody: string;
  /** Must be the FIRST thing that can touch privileged data. */
  authorize: (body: Record<string, unknown>) => Promise<SopAuthResult>;
  /** Privileged read. Never called before authorize resolves ok. */
  load: (clientId: string) => Promise<LoadedClientSop>;
  nowIso: string;
  startedAtMs: number;
  elapsedMs: () => number;
}

export interface SopReviewResult {
  status: number;
  body: Record<string, unknown>;
  /** null for the CORS preflight, which returns no JSON body. */
  preflight?: boolean;
}

export async function handleSopReview(deps: SopReviewDeps): Promise<SopReviewResult> {
  const shape = validateRequestShape(deps.method, deps.rawBody);
  if (shape.ok !== true) {
    if (shape.status === 204) return { status: 204, body: {}, preflight: true };
    return { status: shape.status, body: { success: false, error: shape.error, code: shape.code } };
  }
  const body = shape.body as Record<string, unknown>;

  const auth = await deps.authorize(body);
  if (!auth.ok) {
    return { status: auth.status ?? 401, body: { success: false, error: auth.error, code: auth.code } };
  }

  if (body.action === 'operating_instructions') {
    return {
      status: 200,
      body: {
        success: true,
        instructions: buildOperatingInstructions(),
        narrator_system_prompt: SOP_NARRATOR_SYSTEM_PROMPT,
        narration_runtime: 'disabled_in_preview',
      },
    };
  }

  const idCheck = validateClientId(body.client_id);
  if (idCheck.ok !== true) {
    return { status: 400, body: { success: false, error: idCheck.error, code: idCheck.code } };
  }
  const clientId = idCheck.clientId;

  if (typeof auth.clientId === 'string' && auth.clientId !== clientId) {
    return { status: 403, body: { success: false, error: 'Forbidden: client scope mismatch', code: 'client_scope_mismatch' } };
  }


  const loaded = await deps.load(clientId);
  if (loaded.fatal === 'client_not_found') {
    return { status: 404, body: { success: false, error: 'client not found', code: 'not_found' } };
  }
  if (loaded.fatal) {
    return { status: 502, body: { success: false, error: loaded.fatal, code: 'source_error' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      mode: 'capital_raising_sop',
      review_only: true,
      executes_nothing: true,
      narration: 'disabled_in_preview',
      numeric_budget_proposals: 'disabled_in_preview',
      authorized_via: auth.via,
      runtime_ms: deps.elapsedMs(),
      timezone: loaded.timezone,
      windows: { current: loaded.expectedCurrent, prior: loaded.expectedPrior },
      month: loaded.month,
      source_blockers: loaded.source_blockers,
      connection_gaps: loaded.connection_gaps,
      report: loaded.report,
    },
  };
}
