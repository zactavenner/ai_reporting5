import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const {
      clientId, leadId, email, phone,
      touchpointType,
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
      metaCampaignId, metaAdsetId, metaAdId,
      landingPageUrl, referrerUrl,
      timestamp,
      metadata,
    } = body;

    if (!clientId || !touchpointType) {
      return new Response(JSON.stringify({ success: false, error: "clientId and touchpointType required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resolvedLeadId = leadId;
    if (!resolvedLeadId && (email || phone)) {
      let query = supabase.from("leads").select("id").eq("client_id", clientId);
      if (email) { query = query.eq("email", email.trim().toLowerCase()); }
      else if (phone) { query = query.eq("phone", phone.replace(/\D/g, "")); }
      const { data: matchedLead } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      resolvedLeadId = matchedLead?.id || null;
    }

    let campaignId = metaCampaignId || null;
    let adsetId = metaAdsetId || null;
    let adId = metaAdId || null;

    if (!campaignId && utmCampaign) {
      const { data: campaign } = await supabase
        .from("meta_campaigns").select("meta_campaign_id").eq("client_id", clientId)
        .or(`name.eq.${utmCampaign},meta_campaign_id.eq.${utmCampaign}`)
        .limit(1).maybeSingle();
      campaignId = campaign?.meta_campaign_id || null;
    }

    const { data: touchpoint, error } = await supabase
      .from("lead_touchpoints")
      .insert({
        lead_id: resolvedLeadId,
        client_id: clientId,
        touchpoint_type: touchpointType,
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId,
        meta_ad_id: adId,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        utm_content: utmContent || null,
        utm_term: utmTerm || null,
        landing_page_url: landingPageUrl || null,
        referrer_url: referrerUrl || null,
        timestamp: timestamp || new Date().toISOString(),
        metadata: metadata || {},
      })
      .select().single();

    if (error) throw error;

    console.log(`[record-touchpoint] Created ${touchpointType} touchpoint for client ${clientId}, lead ${resolvedLeadId || "unmatched"}`);

    return new Response(JSON.stringify({
      success: true, touchpointId: touchpoint.id, leadId: resolvedLeadId, matched: !!resolvedLeadId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[record-touchpoint] Error:", error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
