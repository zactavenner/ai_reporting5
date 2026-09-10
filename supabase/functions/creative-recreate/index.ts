import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizeGenerationCaller } from "../_shared/generationAuth.ts";
import { callOpenRouterJSON } from "../_shared/openrouter.ts";
import { getAgencyDefaults } from "../_shared/defaults.ts";

/**
 * Copy & recreate a winning ad for another client.
 *
 * Reads the source ad (headline / body / transcript / originating prompt) and
 * rewrites it for the target client's offer, then generates a matching opening
 * image through the existing generate-static-ad function. Every run is recorded
 * in public.creative_recreations.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dashboard-token, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_PASSWORD") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "malformed_json" }, 400);
  }

  const auth = await authorizeGenerationCaller(req, body);
  if (!auth.ok) return json({ error: auth.error }, 401);

  const adId = String(body.adId || "").trim();
  const targetClientId = String(body.targetClientId || "").trim();
  const aspectRatio = String(body.aspectRatio || "1:1");
  const notes = String(body.notes || "").trim();
  const generateImage = body.generateImage !== false;
  if (!adId || !targetClientId) return json({ error: "adId and targetClientId are required" }, 400);

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: ad, error: adErr } = await supa
    .from("meta_ads")
    .select(
      "id, client_id, name, headline, body, media_type, transcript, generation_prompt, spend, cost_per_lead, attributed_leads, ctr, full_image_url, image_url, video_thumbnail_url",
    )
    .eq("id", adId)
    .maybeSingle();
  if (adErr) return json({ error: adErr.message }, 500);
  if (!ad) return json({ error: "ad_not_found" }, 404);

  const { data: target } = await supa
    .from("clients")
    .select("id, name, industry, description")
    .eq("id", targetClientId)
    .maybeSingle();
  if (!target) return json({ error: "target_client_not_found" }, 404);

  const { data: offers } = await supa
    .from("client_offers")
    .select("title, description, fund_type, targeted_returns, target_investor, industry_focus, additional_notes")
    .eq("client_id", targetClientId)
    .limit(3);

  const { data: sourceClient } = await supa
    .from("clients")
    .select("name")
    .eq("id", ad.client_id)
    .maybeSingle();

  const offerContext = (offers || [])
    .map((o: any) =>
      [o?.title, o?.description, o?.fund_type, o?.targeted_returns ? `targeted returns: ${o.targeted_returns}` : "", o?.target_investor, o?.industry_focus, o?.additional_notes]
        .filter(Boolean)
        .join(" — "),
    )
    .filter(Boolean)
    .join("\n");

  const { data: recreation, error: insErr } = await supa
    .from("creative_recreations")
    .insert({
      source_meta_ad_id: ad.id,
      source_client_id: ad.client_id,
      target_client_id: targetClientId,
      source_ad_name: ad.name,
      angle_notes: notes || null,
      status: "running",
      created_by: auth.actor,
    })
    .select("id")
    .single();
  if (insErr) return json({ error: insErr.message }, 500);

  const fail = async (message: string, status = 502) => {
    await supa
      .from("creative_recreations")
      .update({ status: "failed", error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", recreation.id);
    return json({ error: message, recreationId: recreation.id }, status);
  };

  try {
    const defaults = await getAgencyDefaults();

    const sourceMaterial = [
      `Source client: ${sourceClient?.name || "unknown"}`,
      `Ad name: ${ad.name}`,
      ad.headline ? `Headline: ${ad.headline}` : "",
      ad.body ? `Primary text: ${ad.body}` : "",
      ad.transcript ? `Video transcript: ${ad.transcript}` : "",
      ad.generation_prompt ? `Original generation prompt: ${ad.generation_prompt}` : "",
      `Performance: spend $${ad.spend ?? 0}, ${ad.attributed_leads ?? 0} leads, CPL $${ad.cost_per_lead ?? "n/a"}, CTR ${ad.ctr ?? "n/a"}%`,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: result, model: usedModel } = await callOpenRouterJSON<{
      angle: string;
      script: string;
      headline: string;
      primary_text: string;
      image_prompt: string;
    }>(
      [
        {
          role: "system",
          content:
            "You are a senior direct-response creative strategist for a capital-raising marketing agency. " +
            "You adapt proven winning ads to a different client's offer without copying their brand, claims or specifics. " +
            "Compliance is mandatory: never promise or imply guaranteed returns — use 'targeted returns' — and keep claims defensible. " +
            "Return strict JSON only.",
        },
        {
          role: "user",
          content:
            `Recreate this proven ad for a new client.\n\nWINNING AD:\n${sourceMaterial}\n\n` +
            `TARGET CLIENT: ${target.name}${target.industry ? ` (${target.industry})` : ""}\n` +
            `TARGET OFFER CONTEXT:\n${offerContext || "No offer details on record — stay generic and investor-appropriate."}\n` +
            (notes ? `OPERATOR NOTES: ${notes}\n` : "") +
            `\nReturn JSON with keys: angle (1 sentence on why this works and what carries over), ` +
            `script (spoken video script, hook first, 30-45 seconds, plain lines with no stage directions), ` +
            `headline (max 60 chars), primary_text (Meta primary text, 2-4 short paragraphs), ` +
            `image_prompt (a single hyperreal photograph-grade prompt for the opening frame: real presenter or scene, ` +
            `natural lighting, believable skin texture and imperfections, documentary realism, no AI gloss, no text overlays).`,
        },
      ],
      { models: [defaults.chat], temperature: 0.7, max_tokens: 1600 },
    );

    const script = [result?.headline, result?.primary_text, result?.script]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const imagePrompt = String(result?.image_prompt || "").trim();
    if (!script) return await fail("AI returned no usable script");

    let imageUrl: string | null = null;
    let imageError: string | null = null;
    if (generateImage && imagePrompt) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-static-ad`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            ...(INTERNAL_SECRET ? { "x-internal-secret": INTERNAL_SECRET } : {}),
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            aspectRatio,
            clientId: targetClientId,
            imageModel: body.imageModel || undefined,
            productDescription: offerContext || undefined,
            referenceImages: [ad.full_image_url || ad.image_url || ad.video_thumbnail_url].filter(
              Boolean,
            ),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.error) {
          imageError = String(payload?.error || `image generation failed (${res.status})`);
        } else {
          imageUrl = payload?.imageUrl || null;
        }
      } catch (e) {
        imageError = e instanceof Error ? e.message : String(e);
      }
    }

    await supa
      .from("creative_recreations")
      .update({
        angle_notes: [notes, result?.angle].filter(Boolean).join(" | ") || null,
        script,
        image_prompt: imagePrompt || null,
        image_url: imageUrl,
        model: usedModel,
        status: imageUrl || !generateImage ? "done" : "partial",
        error: imageError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recreation.id);

    return json({
      success: true,
      recreationId: recreation.id,
      angle: result?.angle || null,
      headline: result?.headline || null,
      primaryText: result?.primary_text || null,
      script,
      imagePrompt,
      imageUrl,
      imageError,
      model: usedModel,
    });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
