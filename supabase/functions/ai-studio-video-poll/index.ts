// Standalone AI Studio video reaper. Keeps ambiguous Master render outcomes held.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ledgerPatchForOutcome, type PollOutcome } from "../_shared/masterVideoLedger.ts";
const OPENROUTER_API_KEY =
  (Deno.env.get("OPENROUTER_API_KEY") || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, "") || undefined;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_AGE_MS = 75 * 60 * 1000;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const result = { scanned: 0, completed: 0, failed: 0, in_flight: 0 };
  try {
    if (!OPENROUTER_API_KEY)
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const probeBody = await req
      .clone()
      .json()
      .catch(() => ({}) as any);
    if (probeBody?.action === "diagnose_key") {
      const r = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      });
      const j: any = await r.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          accepted: r.ok,
          status: r.status,
          key_prefix_ok: OPENROUTER_API_KEY.startsWith("sk-or-"),
          key_length: OPENROUTER_API_KEY.length,
          limit_remaining: j?.data?.limit_remaining ?? null,
          usage: j?.data?.usage ?? null,
          provider_message: r.ok ? null : String(j?.error?.message ?? "").slice(0, 200),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: rows, error } = await supa
      .from("ai_studio_canvas_items")
      .select("id, payload, created_at, conversation_id, user_id")
      .eq("kind", "scene_video")
      .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const syncLedger = async (payload: unknown, outcome: PollOutcome) => {
      const link = ledgerPatchForOutcome(payload, outcome);
      if (!link) return;
      const { error: ledgerErr } = await supa
        .from("ai_studio_video_generations")
        .update(link.patch)
        .eq("id", link.generationId);
      if (ledgerErr) console.error("master video ledger update failed", link.generationId, ledgerErr.message);
    };
    for (const row of rows || []) {
      const p: any = row.payload || {};
      const isMaster = p.source === "master_video" && typeof p.generation_id === "string";
      if (isMaster && p.status === "completed" && p.video_url) {
        await syncLedger(p, { kind: "completed", videoUrl: p.video_url, storagePath: p.storage_path });
        continue;
      }
      if (p?.status !== "processing" || p?.video_url) continue;
      let pollingUrl: string | undefined =
        p.polling_url || (p.provider_job_id ? `https://openrouter.ai/api/v1/videos/${p.provider_job_id}` : undefined);
      if (isMaster && !pollingUrl) {
        const { data: recorded } = await supa
          .from("ai_studio_video_generations")
          .select("provider_job_id, polling_url")
          .eq("id", p.generation_id)
          .eq("canvas_item_id", row.id)
          .maybeSingle();
        pollingUrl =
          recorded?.polling_url ||
          (recorded?.provider_job_id ? `https://openrouter.ai/api/v1/videos/${recorded.provider_job_id}` : undefined);
        if (pollingUrl) {
          p.provider_job_id = recorded?.provider_job_id;
          p.polling_url = pollingUrl;
        }
      }
      const ageMs = Date.now() - new Date(row.created_at as string).getTime();
      result.scanned++;
      const holdMasterRender = async (message: string) => {
        await supa
          .from("ai_studio_canvas_items")
          .update({
            placeholder_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
            payload: {
              ...p,
              status: "processing",
              held_for_review: true,
              error: message,
              last_polled_at: new Date().toISOString(),
            },
          })
          .eq("id", row.id);
        await syncLedger(p, { kind: "unresolved", error: message });
        result.in_flight++;
      };
      if (!pollingUrl) {
        if (ageMs > MAX_AGE_MS) {
          if (isMaster) {
            await holdMasterRender(
              "The renderer job handle is missing. This attempt may already have started and is held for reconciliation; a new paid attempt is not allowed.",
            );
            continue;
          }
          const lost = `${p.requested_model || p.model || "Video"} render was submitted without a provider handle and cannot be recovered. Re-submit to retry.`;
          await supa
            .from("ai_studio_canvas_items")
            .update({
              placeholder_until: null,
              payload: { ...p, status: "failed", failed_at: new Date().toISOString(), reaper: true, error: lost },
            })
            .eq("id", row.id);
          await syncLedger(p, { kind: "failed", error: lost });
          result.failed++;
        }
        continue;
      }
      let pj: any = null;
      try {
        const r = await fetch(pollingUrl, { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` } });
        if (r.ok) pj = await r.json();
        else console.warn(`poll ${row.id} -> ${r.status}`);
      } catch (e) {
        console.warn(`poll ${row.id} threw`, String(e));
      }
      const status = String(pj?.status || "").toLowerCase();
      if (status === "completed") {
        const urls: string[] = pj.unsigned_urls || pj.signed_urls || pj.urls || (pj.video?.url ? [pj.video.url] : []);
        const providerUrl = urls.find((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u));
        if (!providerUrl) {
          if (isMaster) {
            await holdMasterRender(
              "The provider reports completion but has not supplied a video file. Recover this existing render before starting another paid attempt.",
            );
            continue;
          }
          const noFile = "Provider reported completed but returned no video URL. Re-submit to retry.";
          await supa
            .from("ai_studio_canvas_items")
            .update({
              placeholder_until: null,
              payload: { ...p, status: "failed", failed_at: new Date().toISOString(), reaper: true, error: noFile },
            })
            .eq("id", row.id);
          await syncLedger(p, { kind: "failed", error: noFile });
          result.failed++;
          continue;
        }
        let storedUrl = providerUrl;
        let storagePath: string | null = null;
        try {
          const dl = await fetch(providerUrl, { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` } });
          if (!dl.ok) throw new Error(`download ${dl.status}`);
          const bytes = new Uint8Array(await dl.arrayBuffer());
          if (bytes.byteLength < 1024) throw new Error("file too small");
          const jobId = p.provider_job_id || p.job_id || row.id;
          const folder = String(p.model || "").includes("hailuo") ? "hailuo" : "seedance";
          const path = `ai-studio/${p.client_id || "shared"}/${folder}/${jobId}-${Date.now()}.mp4`;
          const up = await supa.storage
            .from("creatives")
            .upload(path, bytes, { contentType: "video/mp4", upsert: false });
          if (up.error) throw new Error(up.error.message);
          const { data: pub } = supa.storage.from("creatives").getPublicUrl(path);
          storedUrl = pub.publicUrl;
          storagePath = path;
        } catch (e) {
          console.warn(`rehost failed for ${row.id}, keeping provider url`, String(e));
        }
        if (isMaster && !storagePath) {
          await holdMasterRender(
            "The provider finished the video, but its permanent copy could not be saved. Recovery will retry the download, not create another paid video.",
          );
          continue;
        }
        await supa
          .from("ai_studio_canvas_items")
          .update({
            placeholder_until: null,
            payload: {
              ...p,
              status: "completed",
              video_url: storedUrl,
              storage_path: storagePath ?? p.storage_path ?? null,
              completed_at: new Date().toISOString(),
              completed_by: "cron_reaper",
            },
          })
          .eq("id", row.id);
        await syncLedger(p, { kind: "completed", videoUrl: storedUrl, storagePath });
        result.completed++;
        continue;
      }
      if (status === "failed" || status === "cancelled") {
        const msg = pj?.error?.message || pj?.error || `Provider reported ${status}`;
        const failure = `${p.requested_model || p.model || "Video"}: ${String(msg).slice(0, 300)}`;
        await supa
          .from("ai_studio_canvas_items")
          .update({
            placeholder_until: null,
            payload: { ...p, status: "failed", failed_at: new Date().toISOString(), reaper: true, error: failure },
          })
          .eq("id", row.id);
        await syncLedger(p, { kind: "failed", error: failure });
        result.failed++;
        continue;
      }
      if (ageMs > MAX_AGE_MS) {
        if (isMaster) {
          await holdMasterRender(
            `The provider has not confirmed a terminal outcome (${status || "unavailable"}). The existing render remains held for review; do not start another paid attempt.`,
          );
          continue;
        }
        const stalled = `${p.requested_model || p.model || "Video"} render is still ${status || "queued"} at the provider after 75 minutes. Re-submit to retry.`;
        await supa
          .from("ai_studio_canvas_items")
          .update({
            placeholder_until: null,
            payload: { ...p, status: "failed", failed_at: new Date().toISOString(), reaper: true, error: stalled },
          })
          .eq("id", row.id);
        await syncLedger(p, { kind: "failed", error: stalled });
        result.failed++;
        continue;
      }
      await supa
        .from("ai_studio_canvas_items")
        .update({
          placeholder_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          payload: {
            ...p,
            provider_status: status || "in_progress",
            last_polled_at: new Date().toISOString(),
            progress: pj?.progress ?? p.progress ?? null,
          },
        })
        .eq("id", row.id);
      result.in_flight++;
    }
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-studio-video-poll error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e), ...result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
