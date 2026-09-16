/**
 * Master AI Video — the only route that may grant a paid render.
 *
 * Design rules this function exists to enforce:
 *
 *  1. The SERVER decides, not the browser. The stored draft and stored
 *     approvals are re-read and re-hashed here through the shared contract
 *     (`_shared/masterVideoContract.ts`). A disabled button is a courtesy; this
 *     is the check that protects spend.
 *  2. One approved version = one charge. The idempotency key is derived from the
 *     approved content hash and carries a UNIQUE index, so a double click, a
 *     retried fetch or a second browser tab returns the FIRST job instead of
 *     paying twice.
 *  3. Submit only, never wait. The provider job id and polling url are persisted
 *     immediately on a `scene_video` canvas card, and the existing
 *     `ai-studio-video-poll` cron reaper finishes it — a reload, a recycled
 *     instance or a request timeout can never lose or re-submit a render.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizeGenerationCaller } from "../_shared/generationAuth.ts";
import { readDashboardToken, verifyDashboardToken } from "../_shared/dashboardToken.ts";
import {
  authorizeGeneration,
  buildProviderBody,
  classifySubmitFailure,
  isTerminalFailure,
  modelSpec,
  normalizeStoredDraft,
  scriptApprovalHash,
  selectedFrame,
  type MasterVideoApprovals,
  type MasterVideoDraft,
} from "../_shared/masterVideoContract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dashboard-token, x-internal-secret",
};

const OPENROUTER_API_KEY = ((Deno.env.get("OPENROUTER_API_KEY") || "")
  .trim()
  .replace(/^['"]+|['"]+$/g, "")
  .replace(/\s+/g, "")) || undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Whose draft is this?
 *
 * Reporting's operator UI signs in through the password portal, which mints an
 * HMAC dashboard token and an `agency_members` row — there is often NO Supabase
 * auth user at all. `ai-studio` resolves identity exactly this way (auth uid
 * first, then the verified dashboard member), and the Master Video routes must
 * match it or the portal sees an endless spinner.
 */
async function resolveOwnerId(req: Request, body: any, supa: any): Promise<string | null> {
  const dashboardToken = readDashboardToken(req, body);
  if (dashboardToken) {
    const member = await verifyDashboardToken(dashboardToken);
    if (member?.id) return member.id;
  }
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await userClient.auth.getUser();
      if (data.user?.id) return data.user.id;
    } catch { /* not a user JWT — fall through */ }
  }
  // Internal server-to-server pipelines act for an explicit owner.
  if (typeof body?.internalUserId === "string" && body.internalUserId) return body.internalUserId;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  // Spend boundary FIRST — before any provider key is read.
  const caller = await authorizeGenerationCaller(req, body);
  if (!caller.ok) return json({ error: caller.error }, 401);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const ownerId = await resolveOwnerId(req, body, supa);
  if (!ownerId) {
    return json({ error: "We could not identify your dashboard session. Please sign in again." }, 401);
  }

  const action = String(body.action || "generate");
  const scopeClientId = body.clientId ? String(body.clientId) : null;
  const scopeConversationId = body.conversationId ? String(body.conversationId) : null;

  /* ------------------------------------------------- load / save the draft --- */
  // Reads and writes go through the service role behind this identity check, so
  // the tables stay closed to the anon/authenticated roles: the portal never
  // needs a Supabase auth user, and nobody can read another operator's draft.
  if (action === "load" || action === "save") {
    let q = supa
      .from("ai_studio_video_projects")
      .select("id, draft, approvals")
      .eq("user_id", ownerId)
      .limit(1);
    q = scopeClientId ? q.eq("client_id", scopeClientId) : q.is("client_id", null);
    q = scopeConversationId ? q.eq("conversation_id", scopeConversationId) : q.is("conversation_id", null);
    const { data: existing, error: loadError } = await q.maybeSingle();
    if (loadError) return json({ error: loadError.message }, 500);

    // Echoed back on every reply so the browser can throw away an answer that
    // belongs to a client or thread it has already navigated away from.
    const scope = { clientId: scopeClientId, conversationId: scopeConversationId };

    if (action === "save") {
      const row = {
        user_id: ownerId,
        client_id: scopeClientId,
        conversation_id: scopeConversationId,
        draft: body.draft ?? {},
        approvals: body.approvals ?? {},
      };
      if (existing?.id) {
        const { error } = await supa.from("ai_studio_video_projects").update(row).eq("id", existing.id);
        if (error) return json({ error: error.message, scope }, 500);
        return json({ ok: true, scope, project: { id: existing.id, draft: row.draft, approvals: row.approvals } });
      }
      const { data: created, error } = await supa
        .from("ai_studio_video_projects")
        .insert(row)
        .select("id, draft, approvals")
        .single();
      if (error) {
        // Two tabs (or two queued autosaves) racing the first insert: the unique
        // scope index makes one of them lose, and it must update instead of
        // creating a second draft for the same client and thread.
        if ((error as any).code === "23505") {
          let q2 = supa.from("ai_studio_video_projects").select("id").eq("user_id", ownerId).limit(1);
          q2 = scopeClientId ? q2.eq("client_id", scopeClientId) : q2.is("client_id", null);
          q2 = scopeConversationId ? q2.eq("conversation_id", scopeConversationId) : q2.is("conversation_id", null);
          const { data: winner } = await q2.maybeSingle();
          if (winner?.id) {
            const { error: upErr } = await supa.from("ai_studio_video_projects").update(row).eq("id", winner.id);
            if (upErr) return json({ error: upErr.message, scope }, 500);
            return json({ ok: true, scope, project: { id: winner.id, draft: row.draft, approvals: row.approvals } });
          }
        }
        return json({ error: error.message, scope }, 500);
      }
      return json({ ok: true, scope, project: created });
    }

    let generations: unknown[] = [];
    if (existing?.id) {
      const { data: gens, error: genErr } = await supa
        .from("ai_studio_video_generations")
        .select("id, status, model, resolution, aspect_ratio, duration_seconds, provider_job_id, canvas_item_id, video_url, error, created_at")
        .eq("project_id", existing.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (genErr) return json({ error: genErr.message, scope }, 500);
      generations = gens || [];
    }
    return json({ ok: true, scope, project: existing || null, generations });
  }

  if (!OPENROUTER_API_KEY) return json({ error: "Video generation is not configured on the server." }, 503);

  const projectId = String(body.projectId || "");
  const echoedHash = body.scriptHash ? String(body.scriptHash) : null;
  const retryOf = body.retryOfGenerationId ? String(body.retryOfGenerationId) : null;
  if (!projectId) return json({ error: "projectId is required" }, 400);


  const { data: project, error: projectError } = await supa
    .from("ai_studio_video_projects")
    .select("id, user_id, client_id, conversation_id, draft, approvals")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return json({ error: projectError.message }, 500);
  if (!project) return json({ error: "This video project no longer exists." }, 404);
  // Only the operator who owns the draft (or an internal pipeline acting for
  // them) may spend on it.
  if (project.user_id && project.user_id !== ownerId && caller.via === "dashboard") {
    return json({ error: "This video project belongs to another operator." }, 403);
  }
  // The screen must be pointed at the same client and thread as the stored
  // draft, so a scope switch mid-flight can never spend against the wrong one.
  if (scopeClientId && (project.client_id || null) !== scopeClientId) {
    return json({ error: "This screen is on a different client than the saved video. Reload and try again." }, 409);
  }
  if (scopeConversationId && (project.conversation_id || null) !== scopeConversationId) {
    return json({ error: "This screen is on a different thread than the saved video. Reload and try again." }, 409);
  }

  let draft = normalizeStoredDraft(project.draft);
  let approvals = (project.approvals || {}) as MasterVideoApprovals;
  let retriedRow: any = null;

  // An explicit retry renders the EXACT snapshot that failed, never whatever the
  // draft has been edited into since.
  if (retryOf) {
    const { data: prior, error: priorErr } = await supa
      .from("ai_studio_video_generations")
      .select("id, project_id, status, snapshot, idempotency_key")
      .eq("id", retryOf)
      .maybeSingle();
    if (priorErr) return json({ error: priorErr.message }, 500);
    if (!prior || prior.project_id !== projectId) {
      return json({ error: "That earlier render does not belong to this video." }, 404);
    }
    if (!isTerminalFailure(prior.status)) {
      return json(
        {
          error:
            prior.status === "submission_unknown"
              ? "That render's outcome is still unknown, so a new paid attempt is not allowed until it is checked."
              : `That render is ${prior.status}, so there is nothing to retry.`,
        },
        409,
      );
    }
    const snap = (prior.snapshot || {}) as any;
    draft = normalizeStoredDraft(snap.draft);
    approvals = (snap.approvals || {}) as MasterVideoApprovals;
    retriedRow = prior;
  }

  // The gate: approvals must exist, match the CURRENT stored content, and the
  // client's echoed hash must agree with the server's.
  const gate = authorizeGeneration(projectId, draft, approvals, echoedHash);
  if (!gate.ok) return json({ error: gate.error }, gate.status);

  if (!project.conversation_id) {
    return json({ error: "Open an AI Studio thread before generating, so the render has somewhere to land." }, 400);
  }

  const spec = modelSpec(draft.model);
  const frame = selectedFrame(draft)!;

  // Build the exact provider request BEFORE claiming or charging anything. An
  // unsupported setting or an over-long approved prompt stops here, with a plain
  // reason, rather than being silently trimmed or coerced.
  const built = buildProviderBody(draft, gate.prompt, gate.frameUrl);
  if (!built.ok) return json({ error: built.error }, 400);
  const providerBody = built.body;

  // A retry of a confirmed refusal gets its own key so the original failure stays
  // on the record and the retry itself is still double-click proof.
  const idempotencyKey = retriedRow ? `${gate.idempotencyKey}:retry:${retriedRow.id}` : gate.idempotencyKey;

  // Atomic claim. The UNIQUE idempotency key is what makes duplicate spend
  // impossible: a second identical request loses the insert race and returns
  // the first job untouched.
  const { data: claimed, error: claimError } = await supa
    .from("ai_studio_video_generations")
    .insert({
      project_id: projectId,
      user_id: project.user_id,
      client_id: project.client_id,
      conversation_id: project.conversation_id,
      idempotency_key: idempotencyKey,
      status: "queued",
      model: spec.value,
      resolution: draft.resolution,
      aspect_ratio: draft.aspectRatio,
      duration_seconds: draft.durationSeconds,
      first_frame_url: frame.url,
      spoken_script: draft.script,
      video_prompt: gate.prompt,
      snapshot: {
        draft,
        approvals,
        approved_hash: scriptApprovalHash(draft),
        retry_of: retriedRow?.id ?? null,
      },
    })
    .select("id")
    .single();

  if (claimError) {
    if ((claimError as any).code === "23505") {
      const { data: existing } = await supa
        .from("ai_studio_video_generations")
        .select("id, status, provider_job_id, canvas_item_id, video_url, error")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      return json({
        ok: true,
        duplicate: true,
        message: "This exact version is already rendering — no second render was charged.",
        generation: existing || null,
      });
    }
    return json({ error: claimError.message }, 500);
  }

  const generationId = claimed.id as string;

  /** Marks the claim so a lost outcome can never authorise a second charge. */
  const holdForReview = async (message: string, status: string) => {
    await supa.from("ai_studio_video_generations").update({ status, error: message }).eq("id", generationId);
  };

  // Placeholder card first, so the render is visible and recoverable even if the
  // submit response is lost in flight. If we cannot record it, we do NOT submit:
  // an invisible paid render is worse than no render.
  const { data: card, error: cardError } = await supa
    .from("ai_studio_canvas_items")
    .insert({
      conversation_id: project.conversation_id,
      user_id: project.user_id,
      kind: "scene_video",
      placeholder_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      payload: {
        status: "processing",
        source: "master_video",
        generation_id: generationId,
        client_id: project.client_id,
        model: spec.value,
        requested_model: spec.value,
        prompt: gate.prompt,
        first_frame_url: frame.url,
        resolution: draft.resolution,
        aspect_ratio: draft.aspectRatio,
        duration: draft.durationSeconds,
      },
    })
    .select("id")
    .single();

  if (cardError || !card?.id) {
    const message = `We could not open a place for this render, so nothing was sent or charged (${cardError?.message || "no card returned"}).`;
    await supa
      .from("ai_studio_video_generations")
      .update({ status: "failed", error: message, idempotency_key: `${idempotencyKey}:failed:${generationId}` })
      .eq("id", generationId);
    console.error("master-video placeholder insert failed", cardError?.message);
    return json({ ok: false, error: message, generation: { id: generationId, status: "failed" } }, 500);
  }
  const canvasItemId = card.id as string;

  let submitStatus: number | null = null;
  let bodyReadable = true;
  let networkError = false;
  try {
    let submit: Response;
    try {
      submit = await fetch("https://openrouter.ai/api/v1/videos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://reporting.highperformanceads.com",
          "X-Title": "AI Studio Master Video",
        },
        body: JSON.stringify(providerBody),
      });
    } catch (netErr) {
      networkError = true;
      throw new Error(String((netErr as any)?.message || netErr));
    }
    submitStatus = submit.status;
    if (!submit.ok) {
      const submitText = (await submit.text().catch(() => "")).slice(0, 500);
      throw new Error(`${spec.label} refused it [${submitStatus}]: ${submitText}`);
    }
    let sj: any;
    try {
      sj = await submit.json();
    } catch {
      bodyReadable = false;
      throw new Error(`${spec.label} accepted it but the reply could not be read.`);
    }
    const pollingUrl: string | undefined = sj.polling_url;
    const jobId: string = sj.id || "";
    if (!pollingUrl || !jobId) {
      bodyReadable = false;
      throw new Error(`${spec.label} accepted it but returned no job handle.`);
    }

    // The job handle must survive. Losing it would leave a paid render with no
    // way to finish, so a failed write is reported instead of ignored.
    const { error: handleError } = await supa
      .from("ai_studio_video_generations")
      .update({ status: "running", provider_job_id: jobId, polling_url: pollingUrl, canvas_item_id: canvasItemId })
      .eq("id", generationId);
    if (handleError) {
      const retryWrite = await supa
        .from("ai_studio_video_generations")
        .update({ status: "running", provider_job_id: jobId, polling_url: pollingUrl, canvas_item_id: canvasItemId })
        .eq("id", generationId);
      if (retryWrite.error) {
        console.error("master-video job handle not saved", retryWrite.error.message, jobId);
        return json(
          {
            ok: false,
            error:
              "This render started but we could not save its tracking details. It is being held for review — do not start another one yet.",
            generation: { id: generationId, status: "submission_unknown", provider_job_id: jobId },
          },
          500,
        );
      }
    }

    const { data: cur } = await supa.from("ai_studio_canvas_items").select("payload").eq("id", canvasItemId).single();
    const { error: cardUpdErr } = await supa
      .from("ai_studio_canvas_items")
      .update({ payload: { ...((cur?.payload as any) || {}), provider_job_id: jobId, polling_url: pollingUrl } })
      .eq("id", canvasItemId);
    if (cardUpdErr) console.error("master-video card handle write failed", cardUpdErr.message);

    // Deliberately no in-request polling: the `ai-studio-video-poll` cron reaper
    // owns completion, rehosting and terminal failure from here.
    return json({
      ok: true,
      duplicate: false,
      generation: { id: generationId, status: "running", provider_job_id: jobId, canvas_item_id: canvasItemId },
    });
  } catch (e) {
    const detail = String((e as any)?.message || e).slice(0, 500);
    const verdict = classifySubmitFailure({
      responseStatus: submitStatus,
      responseBodyReadable: bodyReadable,
      networkError,
    });
    const message = `${verdict.message} ${detail}`.slice(0, 900);

    if (verdict.outcome === "rejected") {
      // The renderer answered and refused, so nothing is running: retire the key
      // so an explicit retry of the SAME approved version can claim again.
      await supa
        .from("ai_studio_video_generations")
        .update({
          status: "failed",
          error: message,
          canvas_item_id: canvasItemId,
          idempotency_key: `${idempotencyKey}:failed:${generationId}`,
        })
        .eq("id", generationId);
    } else {
      // Outcome unknown — a render may already be running and paid for. Keep the
      // claim so no fresh charge can be authorised for this version.
      await holdForReview(message, verdict.status);
      await supa.from("ai_studio_video_generations").update({ canvas_item_id: canvasItemId }).eq("id", generationId);
    }

    const { data: cur } = await supa.from("ai_studio_canvas_items").select("payload").eq("id", canvasItemId).single();
    await supa
      .from("ai_studio_canvas_items")
      .update({
        placeholder_until: verdict.outcome === "rejected" ? null : (cur?.payload as any)?.placeholder_until ?? null,
        payload: {
          ...((cur?.payload as any) || {}),
          status: verdict.outcome === "rejected" ? "failed" : "processing",
          error: message,
        },
      })
      .eq("id", canvasItemId);

    console.error("master-video submit outcome", verdict.status, detail);
    return json(
      { ok: false, error: message, generation: { id: generationId, status: verdict.status } },
      verdict.outcome === "rejected" ? 502 : 202,
    );
  }
});
