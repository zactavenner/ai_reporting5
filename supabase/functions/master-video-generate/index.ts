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
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, project: { id: existing.id, draft: row.draft, approvals: row.approvals } });
      }
      const { data: created, error } = await supa
        .from("ai_studio_video_projects")
        .insert(row)
        .select("id, draft, approvals")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, project: created });
    }

    let generations: unknown[] = [];
    if (existing?.id) {
      const { data: gens } = await supa
        .from("ai_studio_video_generations")
        .select("id, status, model, resolution, aspect_ratio, duration_seconds, provider_job_id, canvas_item_id, video_url, error, created_at")
        .eq("project_id", existing.id)
        .order("created_at", { ascending: false })
        .limit(20);
      generations = gens || [];
    }
    return json({ ok: true, project: existing || null, generations });
  }

  if (!OPENROUTER_API_KEY) return json({ error: "Video generation is not configured on the server." }, 503);

  const projectId = String(body.projectId || "");
  const echoedHash = body.scriptHash ? String(body.scriptHash) : null;
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

  const draft = (project.draft || {}) as MasterVideoDraft;
  const approvals = (project.approvals || {}) as MasterVideoApprovals;

  // The gate: approvals must exist, match the CURRENT stored content, and the
  // client's echoed hash must agree with the server's.
  const gate = authorizeGeneration(projectId, draft, approvals, echoedHash);
  if (!gate.ok) return json({ error: gate.error }, gate.status);

  if (!project.conversation_id) {
    return json({ error: "Open an AI Studio thread before generating, so the render has somewhere to land." }, 400);
  }

  const spec = modelSpec(draft.model);
  const frame = selectedFrame(draft)!;

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
      idempotency_key: gate.idempotencyKey,
      status: "queued",
      model: spec.value,
      resolution: draft.resolution,
      aspect_ratio: draft.aspectRatio,
      duration_seconds: draft.durationSeconds,
      first_frame_url: frame.url,
      spoken_script: draft.script,
      video_prompt: gate.prompt,
      snapshot: { draft, approvals, approved_hash: gate.idempotencyKey.split(":")[1] },
    })
    .select("id")
    .single();

  if (claimError) {
    if ((claimError as any).code === "23505") {
      const { data: existing } = await supa
        .from("ai_studio_video_generations")
        .select("id, status, provider_job_id, canvas_item_id, video_url, error")
        .eq("idempotency_key", gate.idempotencyKey)
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

  // Placeholder card first, so the render is visible and recoverable even if the
  // submit response is lost in flight.
  let canvasItemId: string | null = null;
  try {
    const { data: card } = await supa
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
    canvasItemId = card?.id ?? null;
  } catch (e) {
    console.warn("master-video canvas placeholder insert failed (non-fatal)", String(e));
  }

  const providerBody = buildProviderBody(draft, gate.prompt, gate.frameUrl);
  let submitStatus = 0;
  let submitText = "";
  try {
    const submit = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporting.highperformanceads.com",
        "X-Title": "AI Studio Master Video",
      },
      body: JSON.stringify(providerBody),
    });
    submitStatus = submit.status;
    if (!submit.ok) {
      submitText = (await submit.text()).slice(0, 500);
      throw new Error(`${spec.label} submit [${submitStatus}]: ${submitText}`);
    }
    const sj = await submit.json();
    const pollingUrl: string | undefined = sj.polling_url;
    const jobId: string = sj.id || "";
    if (!pollingUrl || !jobId) throw new Error(`${spec.label} returned no provider job handle.`);

    await supa
      .from("ai_studio_video_generations")
      .update({ status: "running", provider_job_id: jobId, polling_url: pollingUrl, canvas_item_id: canvasItemId })
      .eq("id", generationId);

    if (canvasItemId) {
      const { data: cur } = await supa.from("ai_studio_canvas_items").select("payload").eq("id", canvasItemId).single();
      await supa
        .from("ai_studio_canvas_items")
        .update({ payload: { ...((cur?.payload as any) || {}), provider_job_id: jobId, polling_url: pollingUrl } })
        .eq("id", canvasItemId);
    }

    // Deliberately no in-request polling: the `ai-studio-video-poll` cron reaper
    // owns completion, rehosting and terminal failure from here.
    return json({
      ok: true,
      duplicate: false,
      generation: { id: generationId, status: "running", provider_job_id: jobId, canvas_item_id: canvasItemId },
    });
  } catch (e) {
    const message = String((e as any)?.message || e).slice(0, 500);
    // Retire the idempotency key on failure. Nothing was charged, so an explicit
    // operator retry of the SAME approved version must be able to claim again —
    // while the failed attempt stays on the record.
    await supa
      .from("ai_studio_video_generations")
      .update({
        status: "failed",
        error: message,
        canvas_item_id: canvasItemId,
        idempotency_key: `${gate.idempotencyKey}:failed:${generationId}`,
      })
      .eq("id", generationId);
    if (canvasItemId) {
      const { data: cur } = await supa.from("ai_studio_canvas_items").select("payload").eq("id", canvasItemId).single();
      await supa
        .from("ai_studio_canvas_items")
        .update({
          placeholder_until: null,
          payload: { ...((cur?.payload as any) || {}), status: "failed", error: message },
        })
        .eq("id", canvasItemId);
    }
    console.error("master-video submit failed", message);
    return json({ ok: false, error: message, generation: { id: generationId, status: "failed" } }, 502);
  }
});
