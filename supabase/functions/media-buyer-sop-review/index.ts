/**
 * media-buyer-sop-review — Capital Raising SOP review for the EXISTING logical
 * Media Buyer agent. Read-only, one client per request.
 *
 * NOT DEPLOYED. This source is prepared for review only. Deploying it is an
 * explicit, separate step (see docs/ai-media-buyer-capital-raising.md).
 *
 * Guarantees enforced here:
 * - POST only; malformed JSON is rejected explicitly.
 * - Authorization is verified server-side BEFORE any privileged read. An
 *   unauthorized caller triggers zero database reads.
 * - No wildcard/portfolio sweep. `client_id` is required.
 * - Reads go through the shared adapter (_shared/mediaBuyerSopRead.ts) so the
 *   preview UI and this endpoint apply identical columns, ranges and blockers.
 * - No model call at all in this preview: the narrator prompt is exportable, and
 *   no runtime cap is claimed for a request that is never made.
 * - No Meta writes, no approval_queue writes, no gatekeeper call, no
 *   notifications, no schedule changes. Draft actions are inert JSON.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import { loadClientSopReport } from '../_shared/mediaBuyerSopRead.ts';
import { validateClientId, validateRequestShape } from '../_shared/mediaBuyerSopRequest.ts';
import { SOP_NARRATOR_SYSTEM_PROMPT, buildOperatingInstructions } from '../_shared/mediaBuyerSop.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dashboard-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  const raw = await req.text().catch(() => '');
  const shape = validateRequestShape(req.method, raw);
  if (!shape.ok) return json({ success: false, error: shape.error, code: shape.code }, shape.status);
  const body = shape.body;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---- Authorization BEFORE any privileged read ----------------------------
  const auth = await authorizeOperator(req, supabase, createClient, body);
  if (!auth.ok) return json({ success: false, error: auth.error, code: auth.code }, auth.status);

  if (body.action === 'operating_instructions') {
    return json({
      success: true,
      instructions: buildOperatingInstructions(),
      narrator_system_prompt: SOP_NARRATOR_SYSTEM_PROMPT,
      narration_runtime: 'disabled_in_preview',
    });
  }

  const idCheck = validateClientId(body.client_id);
  if (!idCheck.ok) return json({ success: false, error: idCheck.error, code: idCheck.code }, 400);
  const clientId = idCheck.clientId;
  // Client-scoped identities may only read their own client. Service/scheduler
  // callers must still authenticate explicitly (handled by authorizeOperator).
  const scopedClientId = typeof (auth as { clientId?: string }).clientId === 'string' ? (auth as { clientId?: string }).clientId : null;
  if (scopedClientId && scopedClientId !== clientId) {
    return json({ success: false, error: 'Forbidden: client scope mismatch', code: 'client_scope_mismatch' }, 403);
  }

  try {
    const loaded = await loadClientSopReport(supabase, clientId, new Date().toISOString());
    if (loaded.fatal === 'client_not_found') {
      return json({ success: false, error: 'client not found', code: 'not_found' }, 404);
    }
    if (loaded.fatal) {
      return json({ success: false, error: loaded.fatal, code: 'source_error' }, 502);
    }

    return json({
      success: true,
      mode: 'capital_raising_sop',
      review_only: true,
      executes_nothing: true,
      narration: 'disabled_in_preview',
      authorized_via: auth.via,
      runtime_ms: Date.now() - startedAt,
      timezone: loaded.timezone,
      windows: { current: loaded.expectedCurrent, prior: loaded.expectedPrior },
      month: loaded.month,
      source_blockers: loaded.source_blockers,
      connection_gaps: loaded.connection_gaps,
      report: loaded.report,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('media-buyer-sop-review failed:', message);
    return json({ success: false, error: message, code: 'internal_error' }, 500);
  }
});
