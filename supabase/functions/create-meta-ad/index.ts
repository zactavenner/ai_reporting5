// Create a Meta ad inside an existing ad set using a previously uploaded creative.
// Phase 2: ads_management scope required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_GRAPH_API_VERSION = "v21.0";
const META_GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      clientId,
      adSetId,        // local meta_ad_sets.id
      pageId,         // facebook page id (required for object_story_spec)
      instagramActorId, // optional ig actor id
      name,           // ad name
      message,        // primary text
      headline,       // headline / title
      description,    // body / description
      linkUrl,        // destination URL
      callToActionType = "LEARN_MORE",
      imageHash,      // for image ads
      videoId,        // for video ads
      videoThumbnailUrl, // optional
      status = "PAUSED",
    } = await req.json();

    if (!clientId || !adSetId || !pageId || !name) {
      throw new Error("clientId, adSetId, pageId, name required");
    }
    if (!imageHash && !videoId) {
      throw new Error("Must provide imageHash or videoId");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: client } = await supabase
      .from("clients")
      .select("meta_access_token, meta_ad_account_id, name")
      .eq("id", clientId)
      .single();
    if (!client?.meta_ad_account_id) throw new Error("Client missing Meta ad account");

    const accessToken = client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!accessToken) throw new Error("No Meta access token");

    const adAccountId = client.meta_ad_account_id.startsWith("act_")
      ? client.meta_ad_account_id : `act_${client.meta_ad_account_id}`;

    // Resolve local ad set -> meta_adset_id
    const { data: adSet } = await supabase
      .from("meta_ad_sets")
      .select("meta_adset_id, meta_campaign_id, name")
      .eq("id", adSetId).eq("client_id", clientId).single();
    if (!adSet?.meta_adset_id) throw new Error("Ad set not found");

    // Build object_story_spec
    const linkData: Record<string, any> = {
      link: linkUrl || "https://facebook.com",
      message: message || "",
      name: headline || name,
      description: description || "",
      call_to_action: { type: callToActionType, value: { link: linkUrl || "https://facebook.com" } },
    };
    if (imageHash) linkData.image_hash = imageHash;

    const objectStorySpec: Record<string, any> = {
      page_id: pageId,
    };
    if (instagramActorId) objectStorySpec.instagram_actor_id = instagramActorId;

    if (videoId) {
      objectStorySpec.video_data = {
        video_id: videoId,
        title: headline || name,
        message: message || "",
        call_to_action: { type: callToActionType, value: { link: linkUrl || "https://facebook.com" } },
        ...(videoThumbnailUrl ? { image_url: videoThumbnailUrl } : {}),
      };
    } else {
      objectStorySpec.link_data = linkData;
    }

    // Step 1: Create the ad creative
    const creativePayload = new URLSearchParams({
      name: `${name} creative`,
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: accessToken,
    });

    const creativeRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: creativePayload,
    });
    const creativeData = await creativeRes.json();
    if (!creativeRes.ok) throw new Error(`Create creative failed: ${JSON.stringify(creativeData)}`);

    const creativeId = creativeData.id;

    // Step 2: Create the ad
    const adPayload = new URLSearchParams({
      name,
      adset_id: adSet.meta_adset_id,
      creative: JSON.stringify({ creative_id: creativeId }),
      status,
      access_token: accessToken,
    });

    const adRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adPayload,
    });
    const adData = await adRes.json();
    if (!adRes.ok) throw new Error(`Create ad failed: ${JSON.stringify(adData)}`);

    return new Response(JSON.stringify({
      success: true,
      adId: adData.id,
      creativeId,
      message: `Ad "${name}" created in ${status} state`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("create-meta-ad error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
