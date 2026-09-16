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
import {
  authorizeGeneration,
  modelSpec,
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

/** Model-specific wire payload, mirroring the verified contracts in `ai-studio`. */
function buildProviderBody(draft: MasterVideoDraft, prompt: string, frameUrl: string) {
  const spec = modelSpec(draft.model);
  const body: Record<string, unknown> = {
    model: spec.value,
    prompt: prompt.slice(0, 6000),
    aspect_ratio: draft.aspectRatio,
    duration: draft.durationSeconds,
    generate_audio: draft.audio !== false,
  };
  if (spec.value === "minimax/hailuo-3") {
    // H3 accepts the literal "2K" only, caps at 15s, and hard-rejects
    // frame_images together with input_references.
    body.resolution = "2K";
    body.duration = Math.max(5, Math.min(15, draft.durationSeconds));
  } else {
    // Wan 3.0 and both Seedance models take the lowercase resolution.
    body.resolution = draft.resolution;
  }
  body.frame_images = [{ type: "image_url", image_url: { url: frameUrl }, frame_type: "first_frame" }];
  return body;
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

  if (!OPENROUTER_API_KEY) return json({ error: "Video generation is not configured on the server." }, 503);

  const projectId = String(body.projectId || "");
  const echoedHash = body.scriptHash ? String(body.scriptHash) : null;
  if (!projectId) return json({ error: "projectId is required" }, 400);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: project, error: projectError } = await supa
    .from("ai_studio_video_projects")
    .select("id, user_id, client_id, conversation_id, draft, approvals")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return json({ error: projectError.message }, 500);
  if (!project) return json({ error: "This video project no longer exists." }, 404);

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
    await supa
      .from("ai_studio_video_generations")
      .update({ status: "failed", error: message, canvas_item_id: canvasItemId })
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
