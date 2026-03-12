import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, startDate, endDate } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const dateStart = startDate ? `${startDate}T00:00:00.000Z` : null;
    const dateEnd = endDate ? `${endDate}T23:59:59.999Z` : null;

    // Get meta campaigns
    const { data: metaCampaigns } = await supabase
      .from("meta_campaigns")
      .select("id, name, spend, meta_campaign_id")
      .eq("client_id", clientId);

    // Get meta ad sets
    const { data: metaAdSets } = await supabase
      .from("meta_ad_sets")
      .select("id, name, spend, meta_adset_id")
      .eq("client_id", clientId);

    // Get meta ads
    const { data: metaAds } = await supabase
      .from("meta_ads")
      .select("id, name, spend, ad_set_id, meta_ad_id, meta_adset_id")
      .eq("client_id", clientId);

    // Get leads
    const leadFilters: { column: string; op: string; value: any }[] = [
      { column: "client_id", op: "eq", value: clientId },
    ];
    if (dateStart) leadFilters.push({ column: "created_at", op: "gte", value: dateStart });
    if (dateEnd) leadFilters.push({ column: "created_at", op: "lte", value: dateEnd });
    const leads = await fetchAllRowsPaginated(supabase, "leads", "id, campaign_name, ad_set_name, ad_id, is_spam, utm_source, utm_medium, utm_campaign, utm_content, source", leadFilters);

    // Get calls
    const callFilters: { column: string; op: string; value: any }[] = [
      { column: "client_id", op: "eq", value: clientId },
    ];
    if (dateStart) callFilters.push({ column: "booked_at", op: "gte", value: dateStart });
    if (dateEnd) callFilters.push({ column: "booked_at", op: "lte", value: dateEnd });
    const calls = await fetchAllRowsPaginated(supabase, "calls", "id, lead_id, showed, is_reconnect", callFilters);

    // Get funded
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

    // Build maps
    const campaignByName = new Map<string, any>();
    for (const c of (metaCampaigns || [])) {
      campaignByName.set(c.name, c);
    }

    const campaignByMetaId = new Map<string, any>();
    for (const c of (metaCampaigns || [])) {
      campaignByMetaId.set(c.meta_campaign_id, c);
    }

    const adSetByName = new Map<string, any>();
    for (const as of (metaAdSets || [])) {
      adSetByName.set(as.name, as);
    }

    const adsByAdSetId = new Map<string, any[]>();
    for (const ad of (metaAds || [])) {
      if (!ad.ad_set_id) continue;
      const existing = adsByAdSetId.get(ad.ad_set_id) || [];
      existing.push(ad);
      adsByAdSetId.set(ad.ad_set_id, existing);
    }

    const metaAdByMetaId = new Map<string, any>();
    for (const ad of (metaAds || [])) {
      metaAdByMetaId.set(ad.meta_ad_id, ad);
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

    // Debug info
    const leadsWithCampaignName = leads.filter((l: any) => l.campaign_name && l.campaign_name.trim());
    const leadsWithUtmCampaign = leads.filter((l: any) => l.utm_campaign && l.utm_campaign.trim());
    const leadsWithAdSetName = leads.filter((l: any) => l.ad_set_name && l.ad_set_name.trim());
    
    const debugSample = leadsWithCampaignName.slice(0, 3).map((l: any) => ({
      campaign_name: l.campaign_name,
      inMap: campaignByName.has(l.campaign_name),
    }));

    for (const lead of leads || []) {
      const isSpam = !!lead.is_spam;
      let attributed = false;

      const campaignName = lead.campaign_name || lead.utm_campaign;
      if (campaignName) {
        if (campaignByName.has(campaignName)) {
          addStats(campaignStats, campaignName, lead.id, isSpam);
          attributed = true;
        } else if (campaignByMetaId.has(campaignName)) {
          const matchedCampaign = campaignByMetaId.get(campaignName);
          addStats(campaignStats, matchedCampaign.name, lead.id, isSpam);
          attributed = true;
        }
      }

      if (lead.ad_set_name) {
        if (adSetByName.has(lead.ad_set_name)) {
          addStats(adSetStats, lead.ad_set_name, lead.id, isSpam);
          attributed = true;
        } else {
          const matchedAdSet = (metaAdSets || []).find((as: any) => as.meta_adset_id === lead.ad_set_name);
          if (matchedAdSet) {
            addStats(adSetStats, matchedAdSet.name, lead.id, isSpam);
            attributed = true;
          }
        }
      }

      let matchedAdId: string | null = null;
      const adIdToMatch = lead.ad_id || lead.utm_content;
      if (adIdToMatch) {
        const directAd = metaAdByMetaId.get(adIdToMatch);
        if (directAd) matchedAdId = directAd.id;
      }
      if (!matchedAdId && lead.ad_set_name) {
        const matchedAdSet = adSetByName.get(lead.ad_set_name) || 
          (metaAdSets || []).find((as: any) => as.meta_adset_id === lead.ad_set_name);
        if (matchedAdSet) {
          const adsInSet = adsByAdSetId.get(matchedAdSet.id) || [];
          if (adsInSet.length === 1) matchedAdId = adsInSet[0].id;
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

    // Now update the database
    for (const campaign of (metaCampaigns || [])) {
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

    for (const adSet of (metaAdSets || [])) {
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

    for (const ad of (metaAds || [])) {
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

    return new Response(JSON.stringify({
      success: true,
      debug: {
        totalLeads: leads.length,
        leadsWithCampaignName: leadsWithCampaignName.length,
        leadsWithUtmCampaign: leadsWithUtmCampaign.length,
        leadsWithAdSetName: leadsWithAdSetName.length,
        metaCampaignCount: (metaCampaigns || []).length,
        campaignMapSize: campaignByName.size,
        campaignMapKeys: [...campaignByName.keys()].slice(0, 5),
        debugSample,
        totalCalls: calls.length,
        callsWithLeadId: calls.filter((c: any) => c.lead_id).length,
        totalFunded: funded.length,
        fundedWithLeadId: funded.filter((f: any) => f.lead_id).length,
      },
      attribution: {
        campaignsAttributed: campaignStats.size,
        adSetsAttributed: adSetStats.size,
        adsAttributed: adStats.size,
        unattributed: unattributedCount,
        campaignBreakdown: Object.fromEntries([...campaignStats.entries()].map(([k, v]) => [k, v])),
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
