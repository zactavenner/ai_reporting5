// Upload an image or video creative asset to a client's Meta ad account.
// Phase 2 building block. Returns image_hash (for images) or video_id (for videos).
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
    const { clientId, fileUrl, fileType, fileName } = await req.json();
    if (!clientId || !fileUrl || !fileType) {
      return new Response(JSON.stringify({ success: false, error: "clientId, fileUrl, fileType required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    if (!client?.meta_ad_account_id) {
      throw new Error("Client missing Meta ad account");
    }

    const accessToken = client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!accessToken) throw new Error("No Meta access token available");

    const adAccountId = client.meta_ad_account_id.startsWith("act_")
      ? client.meta_ad_account_id
      : `act_${client.meta_ad_account_id}`;

    // Download the asset
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to download asset: ${fileRes.status}`);
    const blob = await fileRes.blob();
    const safeName = fileName || `upload-${Date.now()}`;

    if (fileType === "image") {
      const fd = new FormData();
      fd.append("filename", new File([blob], safeName, { type: blob.type || "image/jpeg" }));
      fd.append("access_token", accessToken);

      const uploadRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/adimages`, {
        method: "POST", body: fd,
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(`Meta image upload failed: ${JSON.stringify(data)}`);

      // Response shape: { images: { "<filename>": { hash, url } } }
      const firstKey = Object.keys(data.images || {})[0];
      const imageHash = firstKey ? data.images[firstKey].hash : null;
      const imageUrl = firstKey ? data.images[firstKey].url : null;

      return new Response(JSON.stringify({ success: true, imageHash, imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fileType === "video") {
      const fd = new FormData();
      fd.append("source", new File([blob], safeName, { type: blob.type || "video/mp4" }));
      fd.append("access_token", accessToken);
      if (fileName) fd.append("name", fileName);

      const uploadRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/advideos`, {
        method: "POST", body: fd,
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(`Meta video upload failed: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({ success: true, videoId: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unsupported fileType: ${fileType}`);
  } catch (e) {
    console.error("upload-meta-creative error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
