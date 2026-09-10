import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizeGenerationCaller } from "../_shared/generationAuth.ts";

/**
 * Creative Library sync.
 *
 * 1. Pulls the latest Meta ads for every client that has an ad account (reusing
 *    the existing sync-meta-ads function — no new Meta plumbing).
 * 2. Auto-transcribes every synced video ad that has no transcript yet
 *    (bounded per run so a single invocation cannot run away).
 * 3. Best-effort links each ad back to the internal prompt that generated it,
 *    when the asset came out of one of our own generators.
 *
 * Auth: agency dashboard session, service role, or internal secret.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dashboard-token, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function basenames(url: string | null | undefined): string[] {
  if (!url) return [];
  try {
    const clean = url.split("?")[0];
    const last = clean.split("/").pop() || "";
    const noExt = last.replace(/\.[a-z0-9]{2,5}$/i, "");
    return [last, noExt].filter((s) => s.length >= 8);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "malformed_json" }, 400);
  }

  const auth = await authorizeGenerationCaller(req, body);
  if (!auth.ok) return json({ error: auth.error }, 401);

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);

  const requestedClients = Array.isArray(body.clientIds) ? (body.clientIds as string[]) : null;
  const transcribeLimit = Math.min(Number(body.transcribeLimit ?? 12) || 12, 40);
  const skipSync = body.skipSync === true;

  // ── 1. Pull ads per client ─────────────────────────────────────────────
  const { data: clients, error: clientErr } = await supa
    .from("clients")
    .select("id, name, meta_ad_account_id, status")
    .not("meta_ad_account_id", "is", null);
  if (clientErr) return json({ error: clientErr.message }, 500);

  const targets = (clients || []).filter(
    (c) => !requestedClients || requestedClients.includes(c.id),
  );

  const synced: Array<{ clientId: string; ads?: number; error?: string }> = [];
  if (!skipSync) {
    for (const client of targets) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-meta-ads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ clientId: client.id }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.error) {
          synced.push({ clientId: client.id, error: String(payload?.error || res.status) });
        } else {
          synced.push({ clientId: client.id, ads: payload?.ads ?? 0 });
        }
      } catch (e) {
        synced.push({ clientId: client.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // ── 2. Link internal generation prompts (best effort) ──────────────────
  let promptsLinked = 0;
  try {
    const { data: unlinked } = await supa
      .from("meta_ads")
      .select("id, client_id, name, video_source_url, full_image_url, image_url")
      .is("generation_prompt", null)
      .limit(300);

    if (unlinked?.length) {
      const clientIds = [...new Set(unlinked.map((a) => a.client_id))];
      const sources: Array<{ table: string; rows: any[] }> = [];
      for (const [table, cols] of [
        ["creative_video_jobs", "client_id, prompt, output_url, source_image_url"],
        ["h3_creatives", "client_id, prompt, final_asset_url, first_frame_asset_url"],
        ["ad_iterations", "client_id, prompt, image_url, video_url"],
      ] as const) {
        const { data } = await supa.from(table).select(cols).in("client_id", clientIds).limit(1000);
        if (data?.length) sources.push({ table, rows: data as any[] });
      }

      for (const ad of unlinked) {
        const adKeys = [
          ...basenames(ad.video_source_url),
          ...basenames(ad.full_image_url),
          ...basenames(ad.image_url),
        ];
        let match: { prompt: string; table: string } | null = null;
        for (const src of sources) {
          for (const row of src.rows) {
            if (row.client_id !== ad.client_id || !row.prompt) continue;
            const rowKeys = [
              ...basenames(row.output_url),
              ...basenames(row.final_asset_url),
              ...basenames(row.first_frame_asset_url),
              ...basenames(row.source_image_url),
              ...basenames(row.image_url),
              ...basenames(row.video_url),
            ];
            const hit =
              rowKeys.some((k) => adKeys.includes(k)) ||
              rowKeys.some((k) => (ad.name || "").includes(k));
            if (hit) {
              match = { prompt: String(row.prompt), table: src.table };
              break;
            }
          }
          if (match) break;
        }
        if (match) {
          await supa
            .from("meta_ads")
            .update({ generation_prompt: match.prompt, generation_source: match.table })
            .eq("id", ad.id);
          promptsLinked++;
        }
      }
    }
  } catch (e) {
    console.warn("prompt linking skipped:", e instanceof Error ? e.message : String(e));
  }

  // ── 3. Auto-transcribe video ads ───────────────────────────────────────
  const { data: pending } = await supa
    .from("meta_ads")
    .select("id, video_source_url, spend")
    .not("video_source_url", "is", null)
    .or("transcript_status.is.null,transcript_status.eq.pending")
    .order("spend", { ascending: false, nullsFirst: false })
    .limit(transcribeLimit);

  let transcribed = 0;
  let failed = 0;
  for (const ad of pending || []) {
    await supa
      .from("meta_ads")
      .update({ transcript_status: "running", transcript_error: null })
      .eq("id", ad.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ videoUrl: ad.video_source_url }),
      });
      const payload = await res.json().catch(() => ({}));
      const segments: any[] = payload?.captions || payload?.segments || [];
      const text = segments
        .map((s) => String(s?.text || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!res.ok || payload?.error || !text) {
        failed++;
        await supa
          .from("meta_ads")
          .update({
            transcript_status: "failed",
            transcript_error: String(payload?.error || "no speech detected").slice(0, 300),
            transcript_updated_at: new Date().toISOString(),
          })
          .eq("id", ad.id);
        continue;
      }
      await supa
        .from("meta_ads")
        .update({
          transcript: text,
          transcript_status: "done",
          transcript_error: null,
          transcript_updated_at: new Date().toISOString(),
        })
        .eq("id", ad.id);
      transcribed++;
    } catch (e) {
      failed++;
      await supa
        .from("meta_ads")
        .update({
          transcript_status: "failed",
          transcript_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          transcript_updated_at: new Date().toISOString(),
        })
        .eq("id", ad.id);
    }
  }

  return json({
    success: true,
    clients: targets.length,
    synced,
    promptsLinked,
    transcribed,
    transcriptionsFailed: failed,
    transcriptionsRemaining: Math.max((pending?.length || 0) - transcribed - failed, 0),
  });
});
