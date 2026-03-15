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

// ── Strict Meta API call budget ──
const META_API_CALL_LIMIT = 190;
let metaApiCallCount = 0;

function checkCallBudget(label: string) {
  if (metaApiCallCount >= META_API_CALL_LIMIT) {
    throw new Error(`Meta API call budget exhausted (${META_API_CALL_LIMIT} calls). Stopped before: ${label}`);
  }
}

async function fetchMeta(url: string, accessToken: string, label = "unknown"): Promise<MetaApiResponse> {
  checkCallBudget(label);
  metaApiCallCount++;
  console.log(`Meta API call #${metaApiCallCount}/${META_API_CALL_LIMIT}: ${label}`);
  const separator = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${separator}access_token=${accessToken}`);
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Meta API ${res.status}: ${errBody.substring(0, 500)}`);
  }
  return res.json();
}

async function fetchAllPages(url: string, accessToken: string, limit = 100, label = "unknown"): Promise<any[]> {
  const all: any[] = [];
  let nextUrl: string | undefined = `${url}&limit=${limit}`;
  let page = 0;
  while (nextUrl) {
    page++;
    const res = await fetchMeta(nextUrl, accessToken, `${label} page ${page}`);
    if (res.error) throw new Error(res.error.message);
    if (res.data) all.push(...res.data);
    nextUrl = res.paging?.next;
    if (all.length > 1000) break;
    // Stop paginating if we're running low on budget
    if (metaApiCallCount >= META_API_CALL_LIMIT - 5) {
      console.warn(`Stopping pagination for ${label} - nearing API budget`);
      break;
    }
  }
  return all;
}

function getTimeRange(startDate?: string, endDate?: string): string {
  const until = endDate || new Date().toISOString().split("T")[0];
  // Default to last 30 days instead of all-time to avoid Meta API "reduce data" errors
  const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return `time_range={"since":"${since}","until":"${until}"}`;
}

// Split a date range into chunks of `chunkDays` to avoid Meta "reduce data" errors
function getDateChunks(startDate?: string, endDate?: string, chunkDays = 7): Array<{ since: string; until: string }> {
  const until = endDate || new Date().toISOString().split("T")[0];
  const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const chunks: Array<{ since: string; until: string }> = [];
  let cursor = new Date(since);
  const end = new Date(until);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      since: cursor.toISOString().split("T")[0],
      until: chunkEnd.toISOString().split("T")[0],
    });
    cursor.setDate(cursor.getDate() + chunkDays);
  }
  return chunks;
}

// ── Attribution: aggregate CRM data back onto meta tables ──
// Fix 2: Improved attribution — removed fragile name substring matching,
// uses UTM params as primary, lead source/medium fields as secondary,
// single-ad-per-set as last resort. Tracks unattributed leads.
// Helper to fetch all rows with pagination (bypasses 1000-row default limit)
async function fetchAllRowsPaginated(supabase: any, table: string, select: string, filters: { column: string; op: string; value: any }[]): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    for (const f of filters) {
      if (f.op === 'eq') query = query.eq(f.column, f.value);
      else if (f.op === 'gte') query = query.gte(f.column, f.value);
      else if (f.op === 'lte') query = query.lte(f.column, f.value);
      else if (f.op === 'not.is') query = query.not(f.column, 'is', f.value);
    }
    const { data, error } = await query;
    if (error) { console.error(`Pagination error on ${table}:`, error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

async function attributeCRMData(supabase: any, clientId: string, startDate?: string, endDate?: string) {
  console.log(`Starting CRM attribution (date range: ${startDate || 'all'} to ${endDate || 'all'})...`);

  const dateStart = startDate ? `${startDate}T00:00:00.000Z` : null;
  const dateEnd = endDate ? `${endDate}T23:59:59.999Z` : null;

  // 1. Get all meta campaigns for this client
  const { data: metaCampaigns } = await supabase
    .from("meta_campaigns")
    .select("id, name, spend, meta_campaign_id")
    .eq("client_id", clientId);

  if (!metaCampaigns || metaCampaigns.length === 0) {
    console.log("No meta campaigns found, skipping attribution");
    return;
  }

  // 2. Get all meta ad sets for this client  
  const { data: metaAdSets } = await supabase
    .from("meta_ad_sets")
    .select("id, name, spend, meta_adset_id")
    .eq("client_id", clientId);

  // 3. Get all meta ads for this client
  const { data: metaAds } = await supabase
    .from("meta_ads")
    .select("id, name, spend, ad_set_id, meta_ad_id, meta_adset_id")
    .eq("client_id", clientId);

  // 4. Get leads with pagination (bypasses 1000-row limit)
  const leadFilters: { column: string; op: string; value: any }[] = [
    { column: "client_id", op: "eq", value: clientId },
  ];
  if (dateStart) leadFilters.push({ column: "created_at", op: "gte", value: dateStart });
  if (dateEnd) leadFilters.push({ column: "created_at", op: "lte", value: dateEnd });
  const leads = await fetchAllRowsPaginated(supabase, "leads", "id, campaign_name, ad_set_name, ad_id, is_spam, utm_source, utm_medium, utm_campaign, utm_content, source", leadFilters);
  console.log(`Attribution: fetched ${leads.length} leads (paginated)`);
  
  // Debug: count leads with campaign_name
  const leadsWithCampaign = leads.filter((l: any) => l.campaign_name && l.campaign_name.trim());
  console.log(`Attribution debug: ${leadsWithCampaign.length} leads have campaign_name, ${campaignByName ? 'campaignByName not built yet' : ''}`);
  if (leadsWithCampaign.length > 0) {
    const sampleLead = leadsWithCampaign[0];
    console.log(`Attribution debug: sample lead campaign_name = "${sampleLead.campaign_name}" (length ${sampleLead.campaign_name?.length})`);
  }

  // 5. Get all calls with pagination
  const callFilters: { column: string; op: string; value: any }[] = [
    { column: "client_id", op: "eq", value: clientId },
  ];
  if (dateStart) callFilters.push({ column: "booked_at", op: "gte", value: dateStart });
  if (dateEnd) callFilters.push({ column: "booked_at", op: "lte", value: dateEnd });
  const calls = await fetchAllRowsPaginated(supabase, "calls", "id, lead_id, showed", callFilters);

  // 6. Get all funded investors with pagination
  const fundedFilters: { column: string; op: string; value: any }[] = [
    { column: "client_id", op: "eq", value: clientId },
  ];
  if (dateStart) fundedFilters.push({ column: "funded_at", op: "gte", value: dateStart });
  if (dateEnd) fundedFilters.push({ column: "funded_at", op: "lte", value: dateEnd });
  const funded = await fetchAllRowsPaginated(supabase, "funded_investors", "id, lead_id, funded_amount, commitment_amount", fundedFilters);

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
    const amount = (Number(f.funded_amount) > 0) ? Number(f.funded_amount) : (Number(f.commitment_amount) || 0);
    existing.dollars += amount;
    fundedByLead.set(f.lead_id, existing);
  }

  // Build ad-set-id to ads mapping
  const adsByAdSetId = new Map<string, any[]>();
  for (const ad of metaAds || []) {
    if (!ad.ad_set_id) continue;
    const existing = adsByAdSetId.get(ad.ad_set_id) || [];
    existing.push(ad);
    adsByAdSetId.set(ad.ad_set_id, existing);
  }

  // Build meta_ad lookup by meta_ad_id for direct matching
  const metaAdByMetaId = new Map<string, any>();
  for (const ad of metaAds || []) {
    metaAdByMetaId.set(ad.meta_ad_id, ad);
  }

  // Build campaign name -> campaign mapping (exact match)
  const campaignByName = new Map<string, any>();
  for (const c of metaCampaigns) {
    campaignByName.set(c.name, c);
  }
  console.log(`Attribution debug: campaignByName has ${campaignByName.size} entries, sample keys: ${[...campaignByName.keys()].slice(0, 3).map(k => `"${k}"`).join(', ')}`);
  
  // Debug: count leads with campaign_name that SHOULD match
  const matchableLeads = (leads || []).filter((l: any) => {
    const cn = l.campaign_name || l.utm_campaign;
    return cn && (campaignByName.has(cn) || campaignByMetaId?.has?.(cn));
  });
  console.log(`Attribution debug: ${matchableLeads.length} leads should match campaigns. Sample: ${matchableLeads.slice(0, 2).map((l: any) => `"${l.campaign_name || l.utm_campaign}"`).join(', ')}`);

  // Build ad set name -> db id mapping (exact match)
  const adSetByName = new Map<string, any>();
  for (const as of metaAdSets || []) {
    adSetByName.set(as.name, as);
  }

  // Build campaign id -> name mapping
  const campaignByMetaId = new Map<string, any>();
  for (const c of metaCampaigns) {
    campaignByMetaId.set(c.meta_campaign_id, c);
  }

  type Stats = { leads: number; spamLeads: number; calls: number; showed: number; funded: number; fundedDollars: number };
  const campaignStats = new Map<string, Stats>();
  const adSetStats = new Map<string, Stats>();
  const adStats = new Map<string, Stats>();
  let unattributedCount = 0;

  function addStats(map: Map<string, Stats>, key: string, leadId: string, isSpam: boolean) {
    const stats = map.get(key) || { leads: 0, spamLeads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    if (isSpam) {
      stats.spamLeads++;
    } else {
      stats.leads++;
    }
    if (!isSpam) {
      const leadCalls = callsByLead.get(leadId);
      if (leadCalls) { stats.calls += leadCalls.total; stats.showed += leadCalls.showed; }
      const leadFunded = fundedByLead.get(leadId);
      if (leadFunded) { stats.funded += leadFunded.count; stats.fundedDollars += leadFunded.dollars; }
    }
    map.set(key, stats);
  }

  for (const lead of leads || []) {
    const isSpam = !!lead.is_spam;

    let attributed = false;

    // Campaign level — match by campaign_name or utm_campaign
    const campaignName = lead.campaign_name || lead.utm_campaign;
    if (campaignName) {
      // Pass 1: Exact name match
      if (campaignByName.has(campaignName)) {
        addStats(campaignStats, campaignName, lead.id, isSpam);
        attributed = true;
      }
      // Pass 2: campaignName might be a numeric meta_campaign_id (from UTM params)
      else if (campaignByMetaId.has(campaignName)) {
        const matchedCampaign = campaignByMetaId.get(campaignName);
        addStats(campaignStats, matchedCampaign.name, lead.id, isSpam);
        attributed = true;
      }
    }

    // Ad set level — match by ad_set_name
    if (lead.ad_set_name) {
      if (adSetByName.has(lead.ad_set_name)) {
        addStats(adSetStats, lead.ad_set_name, lead.id, isSpam);
        attributed = true;
      }
      // Fallback: ad_set_name might be a numeric meta_adset_id
      else {
        const matchedAdSet = (metaAdSets || []).find((as: any) => as.meta_adset_id === lead.ad_set_name);
        if (matchedAdSet) {
          addStats(adSetStats, matchedAdSet.name, lead.id, isSpam);
          attributed = true;
        }
      }
    }

    // Ad level — UTM direct match + single-ad-per-set fallback
    let matchedAdId: string | null = null;

    // Pass 1: Direct match via ad_id field (from UTM params / utm_content)
    const adIdToMatch = lead.ad_id || lead.utm_content;
    if (adIdToMatch) {
      const directAd = metaAdByMetaId.get(adIdToMatch);
      if (directAd) matchedAdId = directAd.id;
    }

    // Pass 2: Single-ad-per-set fallback — ONLY when exactly one active ad in the set
    if (!matchedAdId && lead.ad_set_name) {
      const matchedAdSet = adSetByName.get(lead.ad_set_name) || 
        (metaAdSets || []).find((as: any) => as.meta_adset_id === lead.ad_set_name);
      if (matchedAdSet) {
        const adsInSet = adsByAdSetId.get(matchedAdSet.id) || [];
        if (adsInSet.length === 1) {
          matchedAdId = adsInSet[0].id;
        }
      }
    }

    if (matchedAdId) {
      addStats(adStats, matchedAdId, lead.id, isSpam);
      attributed = true;
    }

    if (!attributed && !isSpam) {
      unattributedCount++;
    }
  }

  console.log(`Attribution: ${unattributedCount} leads unattributed out of ${(leads || []).filter((l: any) => !l.is_spam).length} total`);

  // Update meta_campaigns with attribution
  for (const campaign of metaCampaigns) {
    const stats = campaignStats.get(campaign.name) || { leads: 0, spamLeads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    const spend = Number(campaign.spend) || 0;
    await supabase.from("meta_campaigns").update({
      attributed_leads: stats.leads,
      attributed_spam_leads: stats.spamLeads,
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
    const stats = adSetStats.get(adSet.name) || { leads: 0, spamLeads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    const spend = Number(adSet.spend) || 0;
    await supabase.from("meta_ad_sets").update({
      attributed_leads: stats.leads,
      attributed_spam_leads: stats.spamLeads,
      attributed_calls: stats.calls,
      attributed_showed: stats.showed,
      attributed_funded: stats.funded,
      attributed_funded_dollars: stats.fundedDollars,
      cost_per_lead: stats.leads > 0 ? Math.round((spend / stats.leads) * 100) / 100 : 0,
      cost_per_call: stats.calls > 0 ? Math.round((spend / stats.calls) * 100) / 100 : 0,
      cost_per_funded: stats.funded > 0 ? Math.round((spend / stats.funded) * 100) / 100 : 0,
    }).eq("id", adSet.id);
  }

  // Update meta_ads with attribution
  for (const ad of metaAds || []) {
    const stats = adStats.get(ad.id) || { leads: 0, spamLeads: 0, calls: 0, showed: 0, funded: 0, fundedDollars: 0 };
    const spend = Number(ad.spend) || 0;
    await supabase.from("meta_ads").update({
      attributed_leads: stats.leads,
      attributed_spam_leads: stats.spamLeads,
      attributed_calls: stats.calls,
      attributed_showed: stats.showed,
      attributed_funded: stats.funded,
      attributed_funded_dollars: stats.fundedDollars,
      cost_per_lead: stats.leads > 0 ? Math.round((spend / stats.leads) * 100) / 100 : 0,
      cost_per_call: stats.calls > 0 ? Math.round((spend / stats.calls) * 100) / 100 : 0,
      cost_per_funded: stats.funded > 0 ? Math.round((spend / stats.funded) * 100) / 100 : 0,
    }).eq("id", ad.id);
  }

  // Fix 2: Update unattributed_leads count in daily_metrics for the date range
  if (unattributedCount > 0 && startDate) {
    const { data: existing } = await supabase
      .from("daily_metrics")
      .select("id")
      .eq("client_id", clientId)
      .eq("date", startDate)
      .maybeSingle();

    if (existing) {
      await supabase.from("daily_metrics").update({
        unattributed_leads: unattributedCount,
      }).eq("id", existing.id);
    }
  }

  console.log(`Attribution complete: ${campaignStats.size} campaigns, ${adSetStats.size} ad sets, ${adStats.size} ads, ${unattributedCount} unattributed`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Reset API call counter for each request (fixes warm isolate bug)
  metaApiCallCount = 0;

  try {
    const { clientId, startDate, endDate } = await req.json();
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

    if (!client.meta_ad_account_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "Meta Ad Account ID must be configured in client settings.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use client-specific token, fall back to shared token
    const accessToken = client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(JSON.stringify({
        success: false,
        error: "No Meta access token available (client token and shared token both missing).",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const adAccountId = client.meta_ad_account_id.startsWith("act_")
      ? client.meta_ad_account_id
      : `act_${client.meta_ad_account_id}`;

    console.log(`Syncing Meta Ads for ${client.name} (${adAccountId})`);

    // ── 1. Fetch Campaigns ──
    const campaignFields = "id,name,status,objective,buying_type,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time";
    const campaigns = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/campaigns?fields=${campaignFields}`,
      accessToken, 100, "campaigns"
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

    // ── 2. Fetch Daily Breakdown (highest priority for dashboard) ──
    let dailyRows = 0;
    try {
      const dailyFields = "spend,impressions,clicks,inline_link_click_ctr";
      checkCallBudget("daily-insights");
      const dailyInsights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=${dailyFields}&${getTimeRange(startDate, endDate)}&time_increment=1&level=account`,
        accessToken, 100, "daily-insights"
      );
      console.log(`Fetched ${dailyInsights.length} daily insight rows`);

      for (const day of dailyInsights) {
        const dateStr = day.date_start;
        if (!dateStr) continue;

        const { data: existing } = await supabase
          .from("daily_metrics")
          .select("id")
          .eq("client_id", clientId)
          .eq("date", dateStr)
          .maybeSingle();

        if (existing) {
          await supabase.from("daily_metrics").update({
            ad_spend: Number(day.spend) || 0,
            impressions: Number(day.impressions) || 0,
            clicks: Number(day.clicks) || 0,
            ctr: Number(day.inline_link_click_ctr) || 0,
          }).eq("id", existing.id);
        } else {
          await supabase.from("daily_metrics").insert({
            client_id: clientId,
            date: dateStr,
            ad_spend: Number(day.spend) || 0,
            impressions: Number(day.impressions) || 0,
            clicks: Number(day.clicks) || 0,
            ctr: Number(day.inline_link_click_ctr) || 0,
          });
        }
        dailyRows++;
      }
      console.log(`Upserted ${dailyRows} daily metric rows`);
    } catch (dailyErr) {
      console.error("Daily insights fetch error (non-fatal):", dailyErr);
    }

    // ── 3. Fetch Ad Sets ──
    const adSetFields = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,optimization_goal,billing_event,targeting,start_time,end_time";
    const adSets = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/adsets?fields=${adSetFields}`,
      accessToken, 100, "adsets"
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
    const adFields = "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,image_url,object_story_spec}";
    const ads = await fetchAllPages(
      `${META_GRAPH_API_URL}/${adAccountId}/ads?fields=${adFields}`,
      accessToken, 50, "ads"
    );
    console.log(`Fetched ${ads.length} ads`);

    // Track video IDs to fetch HD source URLs
    const videoIdMap = new Map<string, string>(); // meta_ad_id -> video_id

    const adRecords = ads.map((a: any) => {
      const creative = a.creative || {};
      const storySpec = creative.object_story_spec || {};
      const videoData = storySpec.video_data;
      const linkData = storySpec.link_data;
      
      // Determine media type and URLs
      let imageUrl = creative.image_url || null;
      let fullImageUrl = creative.image_url || null; // full-res from creative endpoint
      let videoThumbnailUrl: string | null = null;
      let mediaType = 'image';
      
      if (videoData) {
        mediaType = 'video';
        videoThumbnailUrl = videoData.image_url || videoData.image_hash || null;
        if (!imageUrl) imageUrl = videoThumbnailUrl;
        // Track video ID for HD fetch
        if (videoData.video_id) {
          videoIdMap.set(a.id, videoData.video_id);
        }
      } else if (linkData?.picture) {
        if (!imageUrl) imageUrl = linkData.picture;
        if (!fullImageUrl) fullImageUrl = linkData.picture;
      }

      return {
        client_id: clientId,
        ad_set_id: adSetIdMap.get(a.adset_id) || null,
        meta_ad_id: a.id,
        meta_adset_id: a.adset_id || null,
        meta_campaign_id: a.campaign_id || null,
        name: a.name,
        status: a.status,
        effective_status: a.effective_status || null,
        creative_id: creative.id || null,
        thumbnail_url: creative.thumbnail_url || null,
        image_url: imageUrl,
        video_thumbnail_url: videoThumbnailUrl,
        full_image_url: fullImageUrl,
        media_type: mediaType,
        synced_at: new Date().toISOString(),
      };
    });

    for (const rec of adRecords) {
      await supabase.from("meta_ads").upsert(rec, { onConflict: "client_id,meta_ad_id" });
    }

    // ── Fetch HD video source URLs for video ads ──
    let hdVideosFetched = 0;
    for (const [metaAdId, videoId] of videoIdMap) {
      try {
        checkCallBudget("video-source");
        const video = await fetchMeta(
          `${META_GRAPH_API_URL}/${videoId}?fields=source`,
          accessToken, `video-source-${metaAdId}`
        );
        if (video.source) {
          await supabase.from("meta_ads")
            .update({ video_source_url: video.source })
            .eq("client_id", clientId)
            .eq("meta_ad_id", metaAdId);
          hdVideosFetched++;
        }
      } catch (videoErr) {
        console.warn(`Failed to fetch video source for ${metaAdId}:`, videoErr);
        break; // Stop if budget exhausted
      }
    }
    console.log(`Fetched ${hdVideosFetched} HD video source URLs`);

    // ── 5. Fetch Per-Entity Insights ──
    try {
      const insightsFields = "campaign_id,impressions,clicks,spend,ctr,cpc,cpm";
      checkCallBudget("campaign-insights");
      const insights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=${insightsFields}&level=campaign&${getTimeRange(startDate, endDate)}&time_increment=all_days`,
        accessToken, 50, "campaign-insights"
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

      checkCallBudget("adset-insights");
      const adSetInsights = await fetchAllPages(
        `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=adset_id,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency&level=adset&${getTimeRange(startDate, endDate)}&time_increment=all_days`,
        accessToken, 50, "adset-insights"
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

      // Ad-level insights: fetch in 7-day chunks to avoid Meta "reduce data" 500 errors
      const adChunks = getDateChunks(startDate, endDate, 7);
      const adSpendAccum = new Map<string, { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number; reach: number; conversions: number; costPerConversion: number }>();

      for (const chunk of adChunks) {
        checkCallBudget("ad-insights-chunk");
        const chunkTimeRange = `time_range={"since":"${chunk.since}","until":"${chunk.until}"}`;
        try {
          const adInsights = await fetchAllPages(
            `${META_GRAPH_API_URL}/${adAccountId}/insights?fields=ad_id,impressions,clicks,spend,ctr,cpc,cpm,reach&level=ad&${chunkTimeRange}&time_increment=all_days&filtering=[{"field":"spend","operator":"GREATER_THAN","value":"0"}]`,
            accessToken, 50, `ad-insights ${chunk.since}-${chunk.until}`
          );
          for (const ins of adInsights) {
            const existing = adSpendAccum.get(ins.ad_id) || { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0, conversions: 0, costPerConversion: 0 };
            existing.spend += Number(ins.spend) || 0;
            existing.impressions += Number(ins.impressions) || 0;
            existing.clicks += Number(ins.clicks) || 0;
            existing.reach += Number(ins.reach) || 0;
            adSpendAccum.set(ins.ad_id, existing);
          }
        } catch (chunkErr) {
          console.warn(`Ad insights chunk ${chunk.since}-${chunk.until} failed:`, chunkErr);
          break; // Budget exhausted or other error
        }
      }

      // Write accumulated ad insights
      for (const [adId, stats] of adSpendAccum) {
        const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
        const cpc = stats.clicks > 0 ? stats.spend / stats.clicks : 0;
        const cpm = stats.impressions > 0 ? (stats.spend / stats.impressions) * 1000 : 0;
        await supabase.from("meta_ads").update({
          spend: stats.spend,
          impressions: stats.impressions,
          clicks: stats.clicks,
          ctr: Math.round(ctr * 100) / 100,
          cpc: Math.round(cpc * 100) / 100,
          cpm: Math.round(cpm * 100) / 100,
          reach: stats.reach,
        }).eq("client_id", clientId).eq("meta_ad_id", adId);
      }
    } catch (insightErr) {
      console.error("Per-entity insights fetch error (non-fatal):", insightErr);
    }

    // ── 6. CRM Attribution ──
    try {
      await attributeCRMData(supabase, clientId, startDate, endDate);
    } catch (attrErr) {
      console.error("CRM attribution error (non-fatal):", attrErr);
    }

    // Update sync timestamp and streak
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { data: currentSettings } = await supabase
      .from("client_settings")
      .select("meta_ads_sync_streak, meta_ads_last_sync_date")
      .eq("client_id", clientId)
      .maybeSingle();

    let newStreak = 1;
    if (currentSettings?.meta_ads_last_sync_date) {
      const lastDate = new Date(currentSettings.meta_ads_last_sync_date);
      const todayDate = new Date(today);
      const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        // Same day re-sync, keep streak
        newStreak = currentSettings.meta_ads_sync_streak || 1;
      } else if (diffDays === 1) {
        // Consecutive day, increment
        newStreak = (currentSettings.meta_ads_sync_streak || 0) + 1;
      }
      // diffDays > 1 means gap, reset to 1
    }

    await supabase.from("client_settings").upsert({
      client_id: clientId,
      meta_ads_sync_enabled: true,
      meta_ads_last_sync: new Date().toISOString(),
      meta_ads_sync_streak: newStreak,
      meta_ads_last_sync_date: today,
    }, { onConflict: "client_id" });

    console.log(`Sync complete. Total Meta API calls: ${metaApiCallCount}/${META_API_CALL_LIMIT}`);
    return new Response(JSON.stringify({
      success: true,
      campaigns: campaigns.length,
      adSets: adSets.length,
      ads: ads.length,
      dailyMetrics: dailyRows,
      metaApiCalls: metaApiCallCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("sync-meta-ads error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
