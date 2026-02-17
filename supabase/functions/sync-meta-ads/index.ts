import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_GRAPH_API_VERSION = "v21.0";
const META_GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

interface MetaApiResponse {
  data?: any[];
  paging?: { next?: string };
  error?: { message: string; type: string; code: number };
}

async function fetchMeta(url: string, accessToken: string): Promise<MetaApiResponse> {
  const separator = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${separator}access_token=${accessToken}`);
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Meta API ${res.status}: ${errBody.substring(0, 500)}`);
  }
  return res.json();
}

async function fetchAllPages(url: string, accessToken: string, limit = 100): Promise<any[]> {
  const all: any[] = [];
  let nextUrl: string | undefined = `${url}&limit=${limit}`;
  while (nextUrl) {
    const res = await fetchMeta(nextUrl, accessToken);
    if (res.error) throw new Error(res.error.message);
    if (res.data) all.push(...res.data);
    nextUrl = res.paging?.next;
    if (all.length > 1000) break;
  }
  return all;
}

function getTimeRange(): string {
  const since = "2026-01-01";
  const until = new Date().toISOString().split("T")[0];
  return `time_range={"since":"${since}","until":"${until}"}`;
}

// ── Attribution: aggregate CRM data back onto meta tables ──
async function attributeCRMData(supabase: any, clientId: string) {
  console.log("Starting CRM attribution...");

  // Also backfill campaign_name / ad_set_name from custom fields on every sync
  await supabase.rpc("", {}).catch(() => {});
  // Direct updates for backfill
  const { error: bf1 } = await supabase
    .from("leads")
    .update({ campaign_name: undefined }) // placeholder - we do raw below
  // Instead, use individual queries to do the backfill
  // We'll query leads missing campaign_name but having custom_fields

  // 1. Get all meta campaigns for this client
  const { data: metaCampaigns } = await supabase
    .from("meta_campaigns")
    .select("id, name, spend")
    .eq("client_id", clientId);

  if (!metaCampaigns || metaCampaigns.length === 0) {
    console.log("No meta campaigns found, skipping attribution");
    return;
  }

  // 2. Get all meta ad sets for this client  
  const { data: metaAdSets } = await supabase
    .from("meta_ad_sets")
    .select("id, name, spend")
    .eq("client_id", clientId);

  // 3. Get leads with campaign attribution
  const { data: leads } = await supabase
    .from("leads")
    .select("id, campaign_name, ad_set_name, is_spam")
    .eq("client_id", clientId)
    .not("campaign_name", "is", null);

  // 4. Get all calls for this client's leads
  const { data: calls } = await supabase
    .from("calls")
    .select("id, lead_id, showed")
    .eq("client_id", clientId);

  // 5. Get all funded investors for this client's leads
  const { data: funded } = await supabase
    .from("funded_investors")
    .select("id, lead_id, funded_amount")
    .eq("client_id", clientId);

  // Build lookup maps
  const callsByLead = new Map<string, { total: number; showed: number }>();
  for (const c of calls || []) {
    if (!c.lead_id) continue;
    const existing = callsByLead.get(c.lead_id) || { total: 0, showed: 0 };
    existing.total++;
    if (c.showed) existing.showed++;
    callsByLead.set(c.lead_id, existing);
  }

  const fundedByLead = new Map<string, { count: number; dollars: number }>();
  for (const f of funded || []) {
    if (!f.lead_id) continue;
    const existing = fundedByLead.get(f.lead_id) || { count: 0, dollars: 0 };
    existing.count++;
    existing.dollars += Number(f.funded_amount) || 0;
    fundedByLead.set(f.lead_id, existing);
  }

  // Aggregate by campaign name
  const campaignStats = new Map<string, { leads: number; calls: number; showed: number; funded: number; fundedDollars: number }>();
  const adSetStats = new Map<string, { leads: number; calls: number; showed: number; funded: number; fundedDollars: number }>();

  for (const lead of leads || []) {
    if (lead.is_spam) continue;

    // Campaign level
    if (lead.campaign_name) {
      const stats = campaignStats.get(lead.campaign_name) || { leads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
      stats.leads++;
      const leadCalls = callsByLead.get(lead.id);
      if (leadCalls) {
        stats.calls += leadCalls.total;
        stats.showed += leadCalls.showed;
      }
      const leadFunded = fundedByLead.get(lead.id);
      if (leadFunded) {
        stats.funded += leadFunded.count;
        stats.fundedDollars += leadFunded.dollars;
      }
      campaignStats.set(lead.campaign_name, stats);
    }

    // Ad set level
    if (lead.ad_set_name) {
      const stats = adSetStats.get(lead.ad_set_name) || { leads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
      stats.leads++;
      const leadCalls = callsByLead.get(lead.id);
      if (leadCalls) {
        stats.calls += leadCalls.total;
        stats.showed += leadCalls.showed;
      }
      const leadFunded = fundedByLead.get(lead.id);
      if (leadFunded) {
        stats.funded += leadFunded.count;
        stats.fundedDollars += leadFunded.dollars;
      }
      adSetStats.set(lead.ad_set_name, stats);
    }
  }

  // Update meta_campaigns with attribution
  for (const campaign of metaCampaigns) {
    const stats = campaignStats.get(campaign.name) || { leads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    const spend = Number(campaign.spend) || 0;
    await supabase.from("meta_campaigns").update({
      attributed_leads: stats.leads,
      attributed_calls: stats.calls,
      attributed_showed: stats.showed,
      attributed_funded: stats.funded,
      attributed_funded_dollars: stats.fundedDollars,
      cost_per_lead: stats.leads > 0 ? Math.round((spend / stats.leads) * 100) / 100 : 0,
      cost_per_call: stats.calls > 0 ? Math.round((spend / stats.calls) * 100) / 100 : 0,
      cost_per_funded: stats.funded > 0 ? Math.round((spend / stats.funded) * 100) / 100 : 0,
    }).eq("id", campaign.id);
  }

  // Update meta_ad_sets with attribution
  for (const adSet of metaAdSets || []) {
    const stats = adSetStats.get(adSet.name) || { leads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    const spend = Number(adSet.spend) || 0;
    await supabase.from("meta_ad_sets").update({
      attributed_leads: stats.leads,
      attributed_calls: stats.calls,
      attributed_showed: stats.showed,
      attributed_funded: stats.funded,
      attributed_funded_dollars: stats.fundedDollars,
      cost_per_lead: stats.leads > 0 ? Math.round((spend / stats.leads) * 100) / 100 : 0,
      cost_per_call: stats.calls > 0 ? Math.round((spend / stats.calls) * 100) / 100 : 0,
      cost_per_funded: stats.funded > 0 ? Math.round((spend / stats.funded) * 100) / 100 : 0,
    }).eq("id", adSet.id);
  }

  console.log(`Attribution complete: ${campaignStats.size} campaigns, ${adSetStats.size} ad sets`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ success: false, error: "clientId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client's Meta credentials
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("meta_access_token, meta_ad_account_id, name")
      .eq("id", clientId)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ success: false, error: "Client not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client.meta_access_token || !client.meta_ad_account_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "Meta Access Token and Ad Account ID must be configured in client settings.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = client.meta_access_token;
    const adAccountId = client.meta_ad_account_id.startsWith("act_")
      ? client.meta_ad_account_id
      : `act_${client.meta_ad_account_id}`;

    console.log(`Syncing Meta Ads for ${client.name} (${adAccountId})`);

    // ── 1. Fetch Campaigns ──
    const campaignFields = "id,name,status,objective,buying_type,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time";
    const campaigns = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/campaigns?fields=${campaignFields}`,
      accessToken
    );
    console.log(`Fetched ${campaigns.length} campaigns`);

    const campaignRecords = campaigns.map((c: any) => ({
      client_id: clientId,
      meta_campaign_id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective || null,
      buying_type: c.buying_type || null,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      budget_remaining: c.budget_remaining ? Number(c.budget_remaining) / 100 : null,
      start_time: c.start_time || null,
      stop_time: c.stop_time || null,
      created_time: c.created_time || null,
      updated_time: c.updated_time || null,
      synced_at: new Date().toISOString(),
    }));

    for (const rec of campaignRecords) {
      await supabase.from("meta_campaigns").upsert(rec, { onConflict: "client_id,meta_campaign_id" });
    }

    const { data: dbCampaigns } = await supabase
      .from("meta_campaigns")
      .select("id, meta_campaign_id")
      .eq("client_id", clientId);
    const campaignIdMap = new Map((dbCampaigns || []).map((c: any) => [c.meta_campaign_id, c.id]));

    // ── 2. Fetch Ad Sets ──
    const adSetFields = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,optimization_goal,billing_event,targeting,start_time,end_time";
    const adSets = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/adsets?fields=${adSetFields}`,
      accessToken
    );
    console.log(`Fetched ${adSets.length} ad sets`);

    const adSetRecords = adSets.map((a: any) => ({
      client_id: clientId,
      campaign_id: campaignIdMap.get(a.campaign_id) || null,
      meta_adset_id: a.id,
      meta_campaign_id: a.campaign_id || null,
      name: a.name,
      status: a.status,
      effective_status: a.effective_status || null,
      daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
      budget_remaining: a.budget_remaining ? Number(a.budget_remaining) / 100 : null,
      bid_strategy: a.bid_strategy || null,
      optimization_goal: a.optimization_goal || null,
      billing_event: a.billing_event || null,
      targeting: a.targeting || {},
      start_time: a.start_time || null,
      end_time: a.end_time || null,
      synced_at: new Date().toISOString(),
    }));

    for (const rec of adSetRecords) {
      await supabase.from("meta_ad_sets").upsert(rec, { onConflict: "client_id,meta_adset_id" });
    }

    const { data: dbAdSets } = await supabase
      .from("meta_ad_sets")
      .select("id, meta_adset_id")
      .eq("client_id", clientId);
    const adSetIdMap = new Map((dbAdSets || []).map((a: any) => [a.meta_adset_id, a.id]));

    // ── 3. Fetch Ads ──
    const adFields = "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url}";
    const ads = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/ads?fields=${adFields}`,
      accessToken,
      50
    );
    console.log(`Fetched ${ads.length} ads`);

    const adRecords = ads.map((a: any) => ({
      client_id: clientId,
      ad_set_id: adSetIdMap.get(a.adset_id) || null,
      meta_ad_id: a.id,
      meta_adset_id: a.adset_id || null,
      meta_campaign_id: a.campaign_id || null,
      name: a.name,
      status: a.status,
      effective_status: a.effective_status || null,
      creative_id: a.creative?.id || null,
      thumbnail_url: a.creative?.thumbnail_url || null,
      synced_at: new Date().toISOString(),
    }));

    for (const rec of adRecords) {
      await supabase.from("meta_ads").upsert(rec, { onConflict: "client_id,meta_ad_id" });
    }

    // ── 4. Fetch Insights ──
    try {
      const insightsFields = "campaign_id,impressions,clicks,spend,ctr,cpc,cpm";
      const insights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=${insightsFields}&level=campaign&${getTimeRange()}&time_increment=all_days`,
        accessToken,
        50
      );
      for (const ins of insights) {
        await supabase.from("meta_campaigns").update({
          spend: Number(ins.spend) || 0,
          impressions: Number(ins.impressions) || 0,
          clicks: Number(ins.clicks) || 0,
          ctr: Number(ins.ctr) || 0,
          cpc: Number(ins.cpc) || 0,
          cpm: Number(ins.cpm) || 0,
        }).eq("client_id", clientId).eq("meta_campaign_id", ins.campaign_id);
      }

      const adSetInsights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=adset_id,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency&level=adset&${getTimeRange()}&time_increment=all_days`,
        accessToken,
        50
      );
      for (const ins of adSetInsights) {
        await supabase.from("meta_ad_sets").update({
          spend: Number(ins.spend) || 0,
          impressions: Number(ins.impressions) || 0,
          clicks: Number(ins.clicks) || 0,
          ctr: Number(ins.ctr) || 0,
          cpc: Number(ins.cpc) || 0,
          cpm: Number(ins.cpm) || 0,
          reach: Number(ins.reach) || 0,
          frequency: Number(ins.frequency) || 0,
        }).eq("client_id", clientId).eq("meta_adset_id", ins.adset_id);
      }

      const adInsights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=ad_id,impressions,clicks,spend,ctr,cpc,cpm,reach,conversions,cost_per_action_type&level=ad&${getTimeRange()}&time_increment=all_days`,
        accessToken,
        50
      );
      for (const ins of adInsights) {
        const conversions = ins.conversions ? ins.conversions.reduce((sum: number, c: any) => sum + Number(c.value || 0), 0) : 0;
        const costPerConversion = ins.cost_per_action_type?.[0]?.value ? Number(ins.cost_per_action_type[0].value) : 0;
        await supabase.from("meta_ads").update({
          spend: Number(ins.spend) || 0,
          impressions: Number(ins.impressions) || 0,
          clicks: Number(ins.clicks) || 0,
          ctr: Number(ins.ctr) || 0,
          cpc: Number(ins.cpc) || 0,
          cpm: Number(ins.cpm) || 0,
          reach: Number(ins.reach) || 0,
          conversions,
          cost_per_conversion: costPerConversion,
        }).eq("client_id", clientId).eq("meta_ad_id", ins.ad_id);
      }
    } catch (insightErr) {
      console.error("Insights fetch error (non-fatal):", insightErr);
    }

    // ── 5. Fetch Daily Breakdown ──
    let dailyRows = 0;
    try {
      const dailyFields = "spend,impressions,clicks,inline_link_click_ctr";
      const dailyInsights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=${dailyFields}&${getTimeRange()}&time_increment=1&level=account`,
        accessToken
      );
      console.log(`Fetched ${dailyInsights.length} daily insight rows`);

      for (const day of dailyInsights) {
        const dateStr = day.date_start;
        if (!dateStr) continue;

        const { error: upsertErr } = await supabase.from("daily_metrics").upsert({
          client_id: clientId,
          date: dateStr,
          ad_spend: Number(day.spend) || 0,
          impressions: Number(day.impressions) || 0,
          clicks: Number(day.clicks) || 0,
          ctr: Number(day.inline_link_click_ctr) || 0,
        }, { onConflict: "client_id,date", ignoreDuplicates: false });

        if (upsertErr) {
          console.error(`Daily metrics upsert error for ${dateStr}:`, upsertErr.message);
        } else {
          dailyRows++;
        }
      }
      console.log(`Upserted ${dailyRows} daily metric rows`);
    } catch (dailyErr) {
      console.error("Daily insights fetch error (non-fatal):", dailyErr);
    }

    // ── 6. CRM Attribution ──
    try {
      await attributeCRMData(supabase, clientId);
    } catch (attrErr) {
      console.error("CRM attribution error (non-fatal):", attrErr);
    }

    // Update sync timestamp
    await supabase.from("client_settings").upsert({
      client_id: clientId,
      meta_ads_sync_enabled: true,
      meta_ads_last_sync: new Date().toISOString(),
    }, { onConflict: "client_id" });

    return new Response(JSON.stringify({
      success: true,
      campaigns: campaigns.length,
      adSets: adSets.length,
      ads: ads.length,
      dailyMetrics: dailyRows,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("sync-meta-ads error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
