import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { legacyChain, resolveClientMetaToken, type MetaTokenHandle } from "../_shared/metaSystemToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_GRAPH_API_VERSION = "v21.0";
const META_GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

async function fetchMetaApi(url: string, tk: MetaTokenHandle): Promise<any> {
  const separator = url.includes("?") ? "&" : "?";
  const res = await tk.fetch((t) => `${url}${separator}access_token=${t}`, () => ({
    signal: AbortSignal.timeout(30000),
  }));
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Meta API ${res.status}: ${errBody.substring(0, 300)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, adId } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ success: false, error: "clientId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get client credentials
    const { data: client } = await supabase
      .from("clients")
      .select("meta_access_token, meta_ad_account_id")
      .eq("id", clientId)
      .single();

    if (!client?.meta_ad_account_id) {
      return new Response(JSON.stringify({ success: false, error: "No Meta ad account configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tk = await resolveClientMetaToken(supabase, clientId, "fetch-ad-media-hd", {
      legacy: legacyChain([["client", client.meta_access_token], ["master", Deno.env.get("META_SHARED_ACCESS_TOKEN")]]),
    });
    const accessToken = tk.token;
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: "No Meta access token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ads to process
    let query = supabase
      .from("meta_ads")
      .select("id, creative_id, media_type, meta_ad_id, video_source_url, full_image_url")
      .eq("client_id", clientId);

    if (adId) {
      query = query.eq("id", adId);
    } else {
      // Batch: only ads missing HD media
      query = query.or("video_source_url.is.null,full_image_url.is.null");
    }

    const { data: ads, error: adsErr } = await query.limit(50);
    if (adsErr || !ads?.length) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No ads to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let errors = 0;

    for (const ad of ads) {
      try {
        if (!ad.creative_id) continue;

        // Fetch creative details
        const creative = await fetchMetaApi(
          `${META_GRAPH_API_URL}/${ad.creative_id}?fields=object_story_spec,image_url,thumbnail_url`,
          tk
        );

        const storySpec = creative.object_story_spec || {};
        const videoData = storySpec.video_data;
        const updates: Record<string, string> = {};

        if (videoData?.video_id && !ad.video_source_url) {
          // Fetch HD video source URL
          try {
            const video = await fetchMetaApi(
              `${META_GRAPH_API_URL}/${videoData.video_id}?fields=source,picture`,
              tk
            );
            if (video.source) updates.video_source_url = video.source;
            if (video.picture && !ad.full_image_url) updates.full_image_url = video.picture;
          } catch (videoErr) {
            console.error(`Video fetch error for ad ${ad.id}:`, videoErr);
          }
        } else if (!ad.full_image_url) {
          // Image ad — creative.image_url is full-res
          if (creative.image_url) {
            updates.full_image_url = creative.image_url;
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("meta_ads").update(updates).eq("id", ad.id);
          processed++;
        }
      } catch (adErr) {
        console.error(`Error processing ad ${ad.id}:`, adErr);
        errors++;
      }
    }

    return new Response(JSON.stringify({ success: true, processed, errors, total: ads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-ad-media-hd error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
