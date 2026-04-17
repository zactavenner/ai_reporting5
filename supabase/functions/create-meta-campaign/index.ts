// Phase 3: Create a Meta campaign + ad set (full builder).
// Requires ads_management scope (verified Meta app).
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
      // Campaign
      campaignName,
      objective = "OUTCOME_LEADS", // Meta v21 ODAX objective
      buyingType = "AUCTION",
      campaignStatus = "PAUSED",
      specialAdCategories = [], // [] | ["HOUSING"] | ["EMPLOYMENT"] | ["CREDIT"] | ["ISSUES_ELECTIONS_POLITICS"]
      // Ad Set
      adSetName,
      dailyBudgetCents,           // dollars * 100, integer
      lifetimeBudgetCents,        // alternative to daily
      bidStrategy = "LOWEST_COST_WITHOUT_CAP",
      optimizationGoal = "LEAD_GENERATION",
      billingEvent = "IMPRESSIONS",
      startTime,                  // ISO
      endTime,                    // ISO (required if lifetime_budget)
      pageId,                     // promoted_object page_id (for engagement etc)
      pixelId,                    // for conversion-based optimization
      customEventType,            // e.g. LEAD, PURCHASE
      targeting = { geo_locations: { countries: ["US"] } },
    } = await req.json();

    if (!clientId || !campaignName || !adSetName) {
      throw new Error("clientId, campaignName, adSetName required");
    }
    if (!dailyBudgetCents && !lifetimeBudgetCents) {
      throw new Error("dailyBudgetCents or lifetimeBudgetCents required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: client } = await supabase
      .from("clients")
      .select("meta_access_token, meta_ad_account_id, name")
      .eq("id", clientId).single();
    if (!client?.meta_ad_account_id) throw new Error("Client missing Meta ad account");

    const accessToken = client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!accessToken) throw new Error("No Meta access token");

    const adAccountId = client.meta_ad_account_id.startsWith("act_")
      ? client.meta_ad_account_id : `act_${client.meta_ad_account_id}`;

    // Step 1: Campaign
    const campaignPayload = new URLSearchParams({
      name: campaignName,
      objective,
      buying_type: buyingType,
      status: campaignStatus,
      special_ad_categories: JSON.stringify(specialAdCategories),
      access_token: accessToken,
    });
    const campRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: campaignPayload,
    });
    const campData = await campRes.json();
    if (!campRes.ok) throw new Error(`Create campaign failed: ${JSON.stringify(campData)}`);
    const campaignId = campData.id;

    // Step 2: Ad Set
    const promotedObject: Record<string, any> = {};
    if (pageId) promotedObject.page_id = pageId;
    if (pixelId) promotedObject.pixel_id = pixelId;
    if (customEventType) promotedObject.custom_event_type = customEventType;

    const adSetPayloadObj: Record<string, any> = {
      name: adSetName,
      campaign_id: campaignId,
      bid_strategy: bidStrategy,
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      status: "PAUSED",
      targeting: JSON.stringify(targeting),
      start_time: startTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      access_token: accessToken,
    };
    if (dailyBudgetCents) adSetPayloadObj.daily_budget = String(dailyBudgetCents);
    if (lifetimeBudgetCents) {
      adSetPayloadObj.lifetime_budget = String(lifetimeBudgetCents);
      if (!endTime) throw new Error("endTime required for lifetime budget");
      adSetPayloadObj.end_time = endTime;
    }
    if (Object.keys(promotedObject).length > 0) {
      adSetPayloadObj.promoted_object = JSON.stringify(promotedObject);
    }

    const adSetPayload = new URLSearchParams(adSetPayloadObj);
    const asRes = await fetch(`${META_GRAPH_API_URL}/${adAccountId}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adSetPayload,
    });
    const asData = await asRes.json();
    if (!asRes.ok) {
      // Roll back campaign on adset failure
      await fetch(`${META_GRAPH_API_URL}/${campaignId}?access_token=${accessToken}`, { method: "DELETE" }).catch(() => {});
      throw new Error(`Create ad set failed: ${JSON.stringify(asData)}`);
    }

    // Cache locally so the user can immediately add ads to this set
    await supabase.from("meta_campaigns").upsert({
      client_id: clientId,
      meta_campaign_id: campaignId,
      name: campaignName,
      status: campaignStatus,
      objective,
      buying_type: buyingType,
      synced_at: new Date().toISOString(),
    }, { onConflict: "client_id,meta_campaign_id" });

    const { data: localCamp } = await supabase
      .from("meta_campaigns").select("id")
      .eq("client_id", clientId).eq("meta_campaign_id", campaignId).single();

    await supabase.from("meta_ad_sets").upsert({
      client_id: clientId,
      campaign_id: localCamp?.id,
      meta_adset_id: asData.id,
      meta_campaign_id: campaignId,
      name: adSetName,
      status: "PAUSED",
      daily_budget: dailyBudgetCents ? Number(dailyBudgetCents) / 100 : null,
      lifetime_budget: lifetimeBudgetCents ? Number(lifetimeBudgetCents) / 100 : null,
      optimization_goal: optimizationGoal,
      billing_event: billingEvent,
      bid_strategy: bidStrategy,
      targeting,
      synced_at: new Date().toISOString(),
    }, { onConflict: "client_id,meta_adset_id" });

    return new Response(JSON.stringify({
      success: true,
      campaignId,
      adSetId: asData.id,
      message: `Campaign "${campaignName}" + ad set "${adSetName}" created (PAUSED). Add ads to launch.`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("create-meta-campaign error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
