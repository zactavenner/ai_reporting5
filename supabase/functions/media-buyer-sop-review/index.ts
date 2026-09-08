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
import { handleSopReview } from '../_shared/mediaBuyerSopReview.ts';

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
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const result = await handleSopReview({
      method: req.method,
      rawBody: raw,
      nowIso: new Date().toISOString(),
      startedAtMs: startedAt,
      elapsedMs: () => Date.now() - startedAt,
      // The Supabase client is created lazily INSIDE authorize, so an invalid
      // request shape never even constructs a privileged client.
      authorize: async (body) => {
        supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        return await authorizeOperator(req, supabase, createClient, body) as never;
      },
      load: async (clientId) => {
        if (!supabase) throw new Error('authorization did not run before the privileged read');
        return await loadClientSopReport(supabase, clientId, new Date().toISOString());
      },
    });
    if (result.preflight) return new Response(null, { headers: corsHeaders });
    return json(result.body, result.status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('media-buyer-sop-review failed:', message);
    return json({ success: false, error: message, code: 'internal_error' }, 500);
  }
});
