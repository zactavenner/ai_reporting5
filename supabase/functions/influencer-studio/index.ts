/**
 * AI Influencer Studio API (Content → AI Influencers).
 *
 * Every read/write of `influencer_projects` (service-only) and the client
 * character roster goes through here, behind the same dashboard/internal auth
 * as the other generators. Paid actions (image + video) only run on models that
 * are on the agency's active price allowlist, and a render is refused unless
 * the shared readiness check passes and the script lock still matches.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeGenerationCaller } from "../_shared/generationAuth.ts";
import {
  buildExactImageRequest,
  buildExactVideoRequest,
  loadActiveModelAllowlist,
  resolveExactModel,
} from "../_shared/exactModel.ts";
import {
  buildRenderInput,
  renderBlockers,
  scriptLockHash,
  type StudioCharacter,
  type StudioProject,
} from "../_shared/influencerStudio/core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dashboard-token, x-internal-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v) ? v.slice(0, 2000) : null);

const PROJECT_FIELDS = [
  "name", "reference_video_id", "reference_url", "reference_poster_url", "clip_start_s", "clip_end_s",
  "clip_url", "pacing", "character_id", "hook", "mechanism", "cta", "script", "render_mode", "model",
  "resolution", "aspect_ratio",
] as const;

// deno-lint-ignore no-explicit-any
type Db = any;

async function loadCharacter(db: Db, id: string | null, clientId: string): Promise<StudioCharacter | null> {
  if (!id) return null;
  const { data } = await db.from("avatars").select("id, name, client_id, image_url, metadata").eq("id", id).maybeSingle();
  if (!data || data.client_id !== clientId) return null;
  const meta = (data.metadata || {}) as Record<string, unknown>;
  return {
    id: data.id,
    name: data.name,
    portrait_url: data.image_url || null,
    sheet_url: (meta.sheet_url as string) || null,
    builder: (meta.builder as Record<string, string>) || {},
  };
}

function toStudio(row: Record<string, unknown>): StudioProject {
  return {
    clip_url: (row.clip_url as string) || null,
    clip_start_s: Number(row.clip_start_s) || 0,
    clip_end_s: Number(row.clip_end_s) || 0,
    pacing: (row.pacing as Record<string, unknown>) || {},
    character_id: (row.character_id as string) || null,
    script: String(row.script || ""),
    script_locked: !!row.script_locked,
    script_lock_hash: (row.script_lock_hash as string) || null,
    render_mode: row.render_mode === "character_only" ? "character_only" : "motion_swap",
    status: String(row.status || "draft"),
  };
}

async function persistFromProvider(db: Db, url: string, key: string, clientId: string): Promise<string> {
  if (!url.startsWith("https://openrouter.ai/")) return url;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Could not download finished video (${r.status})`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const path = `influencer-studio/${clientId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.mp4`;
  const { error } = await db.storage.from("assets").upload(path, bytes, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(`Could not store finished video: ${error.message}`);
  return db.storage.from("assets").getPublicUrl(path).data.publicUrl;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${r.headers.get("content-type") || "image/png"};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const caller = await authorizeGenerationCaller(req, body);
  if (!caller.ok) return json({ error: caller.error }, caller.status);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const OPENROUTER = Deno.env.get("OPENROUTER_API_KEY") || "";
  const action = str(body.action, 40);

  try {
    /* ------------------------------------------------------------ config */
    if (action === "config") {
      const [video, image] = await Promise.all([
        loadActiveModelAllowlist(db, "video"),
        loadActiveModelAllowlist(db, "static_image"),
      ]);
      return json({ enabledVideoModels: video, enabledImageModels: image });
    }

    const clientId = body.clientId;

    /* ------------------------------------------------------- characters */
    if (action === "characters") {
      if (!isUuid(clientId)) return json({ error: "clientId required" }, 400);
      const { data, error } = await db
        .from("avatars")
        .select("id, name, description, gender, age_range, ethnicity, image_url, metadata, created_at")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data || []).filter((a: Record<string, unknown>) =>
        ((a.metadata || {}) as Record<string, unknown>).kind === "influencer"
      );
      return json({ characters: rows });
    }

    if (action === "save_character") {
      if (!isUuid(clientId)) return json({ error: "clientId required" }, 400);
      const name = str(body.name, 80).trim();
      if (!name) return json({ error: "Name the character" }, 400);
      const portrait = httpsUrl(body.portraitUrl);
      const sheet = httpsUrl(body.sheetUrl);
      const builder = (typeof body.builder === "object" && body.builder) ? body.builder as Record<string, unknown> : {};
      const metadata = {
        kind: "influencer",
        builder,
        portrait_prompt: str(body.portraitPrompt, 4000),
        sheet_url: sheet,
        sheet_prompt: str(body.sheetPrompt, 4000),
        saved_by: caller.actor,
      };
      const fields = {
        client_id: clientId,
        name,
        description: str(builder.look, 500) || null,
        gender: str(builder.gender, 40) || null,
        age_range: str(builder.age, 40) || null,
        ethnicity: str(builder.ethnicity, 60) || null,
        style: "raw_iphone",
        image_url: portrait,
        base_image_url: portrait,
        is_active: true,
        is_stock: false,
        metadata,
      };
      let id = isUuid(body.id) ? body.id : null;
      if (id) {
        const { data: existing } = await db.from("avatars").select("client_id").eq("id", id).maybeSingle();
        if (!existing || existing.client_id !== clientId) return json({ error: "Character not found for this client" }, 404);
        const { error } = await db.from("avatars").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("avatars").insert(fields).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      // Keep the looks gallery in step (front portrait + turnaround sheet).
      await db.from("avatar_looks").delete().eq("avatar_id", id).in("angle", ["front", "turnaround"]);
      const looks: Array<Record<string, unknown>> = [];
      if (portrait) looks.push({ avatar_id: id, name: "Portrait", image_url: portrait, angle: "front", is_primary: true, is_default: true, prompt: metadata.portrait_prompt });
      if (sheet) looks.push({ avatar_id: id, name: "Turnaround sheet", image_url: sheet, angle: "turnaround", is_primary: false, is_default: false, prompt: metadata.sheet_prompt });
      if (looks.length) await db.from("avatar_looks").insert(looks);
      return json({ id });
    }

    if (action === "archive_character") {
      if (!isUuid(clientId) || !isUuid(body.id)) return json({ error: "clientId and id required" }, 400);
      const { error } = await db.from("avatars").update({ is_active: false }).eq("id", body.id).eq("client_id", clientId);
      if (error) throw error;
      return json({ ok: true });
    }

    /* ------------------------------------------------------- image gen */
    if (action === "generate_image") {
      if (!isUuid(clientId)) return json({ error: "clientId required" }, 400);
      if (!OPENROUTER) return json({ error: "Image generation is not configured" }, 500);
      const prompt = str(body.prompt, 4000).trim();
      if (!prompt) return json({ error: "Prompt required" }, 400);
      let model: string;
      try {
        model = await resolveExactModel(db, "static_image", body.model || "openai/gpt-image-2");
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
      const parts: unknown[] = [{ type: "text", text: prompt }];
      const ref = httpsUrl(body.referenceUrl);
      if (ref) {
        const data = await toDataUrl(ref);
        if (!data) return json({ error: "Could not read the reference image" }, 400);
        parts.push({ type: "image_url", image_url: { url: data } });
      }
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildExactImageRequest({ exactModel: model, contentParts: parts })),
      });
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 429) return json({ error: "Rate limited — try again in a minute" }, 429);
        if (r.status === 402) return json({ error: "Image credits exhausted" }, 402);
        return json({ error: `Image request failed (${r.status})`, details: t.slice(0, 300) }, 502);
      }
      const ai = await r.json();
      const ran = String(ai?.model ?? "").trim();
      if (ran && ran !== model) return json({ error: `Provider ran ${ran} but ${model} was requested` }, 502);
      const dataUrl: string | undefined = ai?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const m = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return json({ error: "No image came back — adjust the prompt and retry" }, 502);
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const ext = m[1].split("/")[1] || "png";
      const path = `influencer-studio/${clientId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await db.storage.from("assets").upload(path, bytes, { contentType: m[1], upsert: false });
      if (upErr) throw upErr;
      return json({ imageUrl: db.storage.from("assets").getPublicUrl(path).data.publicUrl, model });
    }

    /* --------------------------------------------------------- projects */
    if (action === "list") {
      if (!isUuid(clientId)) return json({ error: "clientId required" }, 400);
      const { data, error } = await db
        .from("influencer_projects")
        .select("*")
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ projects: data || [] });
    }

    if (action === "create") {
      if (!isUuid(clientId)) return json({ error: "clientId required" }, 400);
      const { data, error } = await db
        .from("influencer_projects")
        .insert({ client_id: clientId, name: str(body.name, 120).trim() || "Untitled influencer ad", created_by: caller.actor })
        .select("*")
        .single();
      if (error) throw error;
      return json({ project: data });
    }

    const id = body.id;
    if (!isUuid(id)) return json({ error: "id required" }, 400);
    const { data: row, error: rowErr } = await db.from("influencer_projects").select("*").eq("id", id).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return json({ error: "Project not found" }, 404);
    if (isUuid(clientId) && row.client_id !== clientId) return json({ error: "Project not found" }, 404);

    // A claim with no job after 3 minutes means the submit never finished.
    if (row.status === "rendering" && !row.job_url) {
      const started = Date.parse(String(row.render_started_at || "")) || 0;
      if (Date.now() - started > 3 * 60_000) {
        await db.from("influencer_projects").update({ status: "failed", error: "Render submit never completed" }).eq("id", id);
        row.status = "failed";
        row.error = "Render submit never completed";
      }
    }

    if (action === "update") {
      if (row.status === "rendering") return json({ error: "Wait for the render to finish before editing" }, 409);
      const patch = (typeof body.patch === "object" && body.patch) ? body.patch as Record<string, unknown> : {};
      const out: Record<string, unknown> = {};
      for (const k of PROJECT_FIELDS) if (k in patch) out[k] = patch[k];
      for (const k of ["reference_url", "reference_poster_url", "clip_url"]) {
        if (k in out) out[k] = out[k] == null ? null : httpsUrl(out[k]);
      }
      for (const k of ["reference_video_id", "character_id"]) {
        if (k in out && out[k] != null && !isUuid(out[k])) return json({ error: `Bad ${k}` }, 400);
      }
      if ("character_id" in out && out.character_id) {
        const ch = await loadCharacter(db, out.character_id as string, row.client_id);
        if (!ch) return json({ error: "Character belongs to another client" }, 400);
      }
      if ("render_mode" in out && !["motion_swap", "character_only"].includes(String(out.render_mode))) {
        return json({ error: "Bad render mode" }, 400);
      }
      for (const k of ["name", "hook", "mechanism", "cta", "script"]) if (k in out) out[k] = str(out[k], 4000);
      // Any change to the words drops the lock — the operator must re-confirm.
      if ("script" in out && scriptLockHash(String(out.script)) !== row.script_lock_hash) {
        out.script_locked = false;
        out.script_lock_hash = null;
        out.script_locked_at = null;
        out.script_locked_by = null;
      }
      // A new clip invalidates a finished render's provenance.
      if ("clip_url" in out && out.clip_url !== row.clip_url && row.status === "failed") out.status = "draft";
      const { data, error } = await db.from("influencer_projects").update(out).eq("id", id).select("*").single();
      if (error) throw error;
      return json({ project: data });
    }

    if (action === "lock_script") {
      if (row.status === "rendering") return json({ error: "Render in progress" }, 409);
      const script = String(row.script || "").trim();
      if (!script) return json({ error: "Write the script first" }, 400);
      if (typeof body.confirmHash === "string" && body.confirmHash !== scriptLockHash(script)) {
        return json({ error: "The script changed since you read it back — review it again" }, 409);
      }
      const { data, error } = await db.from("influencer_projects").update({
        script_locked: true,
        script_lock_hash: scriptLockHash(script),
        script_locked_at: new Date().toISOString(),
        script_locked_by: caller.actor,
      }).eq("id", id).select("*").single();
      if (error) throw error;
      return json({ project: data });
    }

    if (action === "unlock_script") {
      const { data, error } = await db.from("influencer_projects").update({
        script_locked: false, script_lock_hash: null, script_locked_at: null, script_locked_by: null,
      }).eq("id", id).select("*").single();
      if (error) throw error;
      return json({ project: data });
    }

    if (action === "render") {
      if (!OPENROUTER) return json({ error: "Video generation is not configured" }, 500);
      // Idempotent: a project already rendering returns its job instead of paying twice.
      if (row.status === "rendering" && row.job_url) return json({ status: "pending", project: row });
      const opts = {
        model: str(body.model, 80) || String(row.model || ""),
        resolution: str(body.resolution, 10) || String(row.resolution || "720p"),
        aspectRatio: str(body.aspectRatio, 10) || String(row.aspect_ratio || "9:16"),
      };
      const studio = toStudio(row);
      const character = await loadCharacter(db, studio.character_id, row.client_id);
      const blockers = renderBlockers(studio, character, opts);
      if (blockers.length) return json({ error: "Not ready to render", blockers }, 409);
      let exact: string;
      try {
        exact = await resolveExactModel(db, "video", opts.model);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e), notEnabled: true }, 400);
      }
      const input = buildRenderInput(studio, character!, { ...opts, model: exact });
      const providerBody = buildExactVideoRequest(input);
      // Claim the row first so a double click can't submit twice.
      const { data: claimed } = await db.from("influencer_projects")
        .update({ status: "rendering", error: null, render_started_at: new Date().toISOString() })
        .eq("id", id).neq("status", "rendering").select("id");
      if (!claimed?.length) return json({ error: "A render is already in progress" }, 409);
      let submit: Response;
      try {
        submit = await fetch("https://openrouter.ai/api/v1/videos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://reporting.highperformanceads.com",
            "X-Title": "AI Influencer Studio",
          },
          body: JSON.stringify(providerBody),
        });
      } catch (e) {
        // Outcome unknown: the provider may have started a job. Say so rather than
        // pretending nothing happened, so nobody blindly pays for a second one.
        await db.from("influencer_projects").update({
          status: "failed",
          error: `Connection dropped while submitting — the provider may still have started a render. ${String(e).slice(0, 200)}`,
        }).eq("id", id);
        return json({ error: "Connection dropped while submitting — check before re-rendering" }, 502);
      }
      if (!submit.ok) {
        const t = await submit.text();
        await db.from("influencer_projects").update({ status: "failed", error: `Submit ${submit.status}: ${t.slice(0, 300)}` }).eq("id", id);
        return json({ error: `The video provider refused the request (${submit.status})`, details: t.slice(0, 300) }, 502);
      }
      const sj = await submit.json();
      const reported = String(sj?.model ?? "").trim();
      if (reported && reported !== exact) {
        await db.from("influencer_projects").update({ status: "failed", error: `Provider accepted ${reported}, not ${exact}` }).eq("id", id);
        return json({ error: `Provider accepted ${reported} but ${exact} was requested` }, 502);
      }
      if (!sj?.polling_url) {
        await db.from("influencer_projects").update({ status: "failed", error: "No job reference returned" }).eq("id", id);
        return json({ error: "The provider returned no job reference" }, 502);
      }
      const { data, error } = await db.from("influencer_projects").update({
        job_url: sj.polling_url,
        model: exact,
        resolution: opts.resolution,
        aspect_ratio: opts.aspectRatio,
        duration_seconds: input.durationSeconds,
        render_request: { ...providerBody, prompt: String(providerBody.prompt).slice(0, 4000), submitted_by: caller.actor },
        video_url: null,
        creative_id: null,
      }).eq("id", id).select("*").single();
      if (error) throw error;
      return json({ status: "pending", project: data });
    }

    if (action === "poll") {
      if (row.status !== "rendering" || !row.job_url) return json({ status: row.status, project: row });
      if (!String(row.job_url).startsWith("https://openrouter.ai/")) return json({ error: "Bad job reference" }, 400);
      const p = await fetch(row.job_url, { headers: { Authorization: `Bearer ${OPENROUTER}` } });
      if (!p.ok) return json({ status: "rendering", project: row });
      const pj = await p.json();
      if (pj.status === "completed") {
        const urls: string[] = pj.unsigned_urls || pj.urls || (pj.video?.url ? [pj.video.url] : []);
        if (!urls[0]) {
          const { data } = await db.from("influencer_projects").update({ status: "failed", error: "Finished with no video" }).eq("id", id).select("*").single();
          return json({ status: "failed", project: data });
        }
        const videoUrl = await persistFromProvider(db, urls[0], OPENROUTER, row.client_id);
        const { data } = await db.from("influencer_projects").update({ status: "ready", video_url: videoUrl, error: null }).eq("id", id).select("*").single();
        return json({ status: "ready", project: data });
      }
      if (pj.status === "failed" || pj.status === "cancelled" || pj.status === "expired") {
        const { data } = await db.from("influencer_projects")
          .update({ status: "failed", error: String(pj.error || pj.status).slice(0, 400) }).eq("id", id).select("*").single();
        return json({ status: "failed", project: data });
      }
      return json({ status: "rendering", project: row });
    }

    if (action === "send_to_creatives") {
      if (row.status !== "ready" || !row.video_url) return json({ error: "Render the video first" }, 400);
      if (row.creative_id) return json({ project: row, creativeId: row.creative_id });
      const character = await loadCharacter(db, row.character_id, row.client_id);
      const { data: creative, error } = await db.from("creatives").insert({
        client_id: row.client_id,
        title: `${row.name}${character ? ` — ${character.name}` : ""}`,
        type: "video",
        file_url: row.video_url,
        status: "pending",
        aspect_ratio: row.aspect_ratio,
        source: "influencer-studio",
        body_copy: row.script || null,
      }).select("id").single();
      if (error) throw error;
      const { data } = await db.from("influencer_projects").update({ creative_id: creative.id }).eq("id", id).select("*").single();
      return json({ project: data, creativeId: creative.id });
    }

    if (action === "duplicate") {
      const copy: Record<string, unknown> = { client_id: row.client_id, created_by: caller.actor, name: `${row.name} (copy)` };
      for (const k of PROJECT_FIELDS) if (k !== "name") copy[k] = row[k];
      const { data, error } = await db.from("influencer_projects").insert(copy).select("*").single();
      if (error) throw error;
      return json({ project: data });
    }

    if (action === "delete") {
      if (row.status === "rendering") return json({ error: "Wait for the render to finish" }, 409);
      const { error } = await db.from("influencer_projects").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[influencer-studio]", action, e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
