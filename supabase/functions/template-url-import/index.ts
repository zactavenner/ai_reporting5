/**
 * template-url-import
 *
 * Downloads a video or image from a user-supplied URL server-side and adds
 * it to the shared AI Studio template library (ai_studio_reference_videos /
 * ai_studio_reference_images), so both humans and AI agents can browse and
 * model from it. Browser-side fetch is impossible for most ad URLs due to
 * CORS, so the download happens here.
 *
 * POST { url: string, kind: 'video' | 'image', name?: string, client_id?: string }
 * Auth: requires a signed-in user (anon key + user JWT).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;  // 25MB
const FETCH_TIMEOUT_MS = 30_000;

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Sign in required" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is a real signed-in user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "Sign in required" });
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const url = String(body?.url || "").trim();
    const kind = body?.kind === "video" ? "video" : body?.kind === "image" ? "image" : null;
    const name = String(body?.name || "").trim().slice(0, 80) || null;
    const clientId = body?.client_id ? String(body.client_id) : null;

    if (!kind) return json(400, { error: "kind must be 'video' or 'image'" });
    if (!url) return json(400, { error: "url is required" });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return json(400, { error: "That is not a valid URL" });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return json(400, { error: "Only http/https URLs are supported" });
    }

    // Download server-side with a timeout and size cap.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "HPA-Template-Importer/1.0" },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error && e.name === "AbortError"
        ? "Download timed out (30s)"
        : "Could not download from that URL";
      return json(422, { error: msg });
    }
    clearTimeout(timer);

    if (!resp.ok) return json(422, { error: `Download failed (HTTP ${resp.status})` });

    const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const allowed = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const ext = allowed[contentType];
    if (!ext) {
      return json(422, {
        error: `That URL did not return a ${kind} (got "${contentType || "unknown"}"). Use a direct link to the file.`,
      });
    }

    const cap = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const declared = Number(resp.headers.get("content-length") || 0);
    if (declared > cap) {
      return json(422, { error: `File is too large (max ${Math.round(cap / 1024 / 1024)}MB)` });
    }

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0) return json(422, { error: "Downloaded file was empty" });
    if (bytes.byteLength > cap) {
      return json(422, { error: `File is too large (max ${Math.round(cap / 1024 / 1024)}MB)` });
    }

    // Store in the shared creatives bucket alongside other references.
    const admin = createClient(supabaseUrl, serviceKey);
    const path = `ai-studio/references/url-import/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("creatives")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) return json(500, { error: `Storage upload failed: ${upErr.message}` });

    const { data: pub } = admin.storage.from("creatives").getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const displayName = name || (parsed.pathname.split("/").pop() || "URL import").replace(/\.[^.]+$/, "").slice(0, 80) || "URL import";

    const table = kind === "video" ? "ai_studio_reference_videos" : "ai_studio_reference_images";
    const row: Record<string, unknown> = {
      name: displayName,
      tags: ["url-import"],
      storage_path: path,
      created_by: userId,
      client_id: clientId,
      source: "url_import",
    };
    if (kind === "video") row.video_url = publicUrl;
    else row.image_url = publicUrl;

    const { data: inserted, error: insErr } = await admin.from(table).insert(row).select("id").single();
    if (insErr) {
      try { await admin.storage.from("creatives").remove([path]); } catch {}
      return json(500, { error: `Library insert failed: ${insErr.message}` });
    }

    return json(200, { ok: true, id: inserted.id, url: publicUrl, name: displayName });
  } catch (e) {
    console.error("[template-url-import] unexpected error:", e);
    return json(500, { error: "Unexpected error importing from URL" });
  }
});
