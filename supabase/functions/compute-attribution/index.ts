import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AttributionModel = "first_touch" | "last_touch" | "linear" | "time_decay" | "position_based";

interface Touchpoint {
  id: string;
  lead_id: string;
  touchpoint_type: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  timestamp: string;
}

interface LeadWithOutcome {
  id: string;
  client_id: string;
  created_at: string;
  is_spam: boolean;
  touchpoints: Touchpoint[];
  calls: number;
  showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_count: number;
  funded_dollars: number;
}

/**
 * Compute attribution weights for a lead's touchpoints using the specified model.
 * Returns a map of touchpoint_id → weight (0 to 1, summing to 1).
 */
function computeWeights(touchpoints: Touchpoint[], model: AttributionModel): Map<string, number> {
  const weights = new Map<string, number>();
  // Only consider touchpoints with ad entity references
  const adTouchpoints = touchpoints.filter(t =>
    t.meta_campaign_id || t.meta_adset_id || t.meta_ad_id
  );

  if (adTouchpoints.length === 0) return weights;

  switch (model) {
    case "first_touch": {
      weights.set(adTouchpoints[0].id, 1.0);
      break;
    }
    case "last_touch": {
      weights.set(adTouchpoints[adTouchpoints.length - 1].id, 1.0);
      break;
    }
    case "linear": {
      const w = 1.0 / adTouchpoints.length;
      for (const tp of adTouchpoints) {
        weights.set(tp.id, w);
      }
      break;
    }
    case "time_decay": {
      // Half-life of 7 days: more recent touchpoints get more credit
      const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
      const latestTime = new Date(adTouchpoints[adTouchpoints.length - 1].timestamp).getTime();
      let totalWeight = 0;
      const rawWeights: number[] = [];
      for (const tp of adTouchpoints) {
        const age = latestTime - new Date(tp.timestamp).getTime();
        const w = Math.pow(0.5, age / halfLife);
        rawWeights.push(w);
        totalWeight += w;
      }
      for (let i = 0; i < adTouchpoints.length; i++) {
        weights.set(adTouchpoints[i].id, totalWeight > 0 ? rawWeights[i] / totalWeight : 0);
      }
      break;
    }
    case "position_based": {
      // 40% first, 40% last, 20% split among middle
      if (adTouchpoints.length === 1) {
        weights.set(adTouchpoints[0].id, 1.0);
      } else if (adTouchpoints.length === 2) {
        weights.set(adTouchpoints[0].id, 0.5);
        weights.set(adTouchpoints[1].id, 0.5);
      } else {
        weights.set(adTouchpoints[0].id, 0.4);
        weights.set(adTouchpoints[adTouchpoints.length - 1].id, 0.4);
        const middleWeight = 0.2 / (adTouchpoints.length - 2);
        for (let i = 1; i < adTouchpoints.length - 1; i++) {
          weights.set(adTouchpoints[i].id, middleWeight);
        }
      }
      break;
    }
  }

  return weights;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const clientId: string | null = body.clientId || null;
    const models: AttributionModel[] = body.models || ["first_touch", "last_touch", "linear", "time_decay", "position_based"];
    const periodStart: string = body.periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const periodEnd: string = body.periodEnd || new Date().toISOString().split("T")[0];

    console.log(`[compute-attribution] Starting for client=${clientId || "ALL"}, period=${periodStart} to ${periodEnd}, models=${models.join(",")}`);

    // Get clients to process
    let clientsQuery = supabase.from("clients").select("id, name").in("status", ["active", "onboarding"]);
    if (clientId) clientsQuery = clientsQuery.eq("id", clientId);
    const { data: clients, error: clientErr } = await clientsQuery;
    if (clientErr || !clients) {
      throw new Error(`Failed to fetch clients: ${clientErr?.message}`);
    }

    const results: any[] = [];
    const clientErrors: Array<{ client: string; error: string }> = [];

    for (const client of clients) {
      console.log(`[compute-attribution] Processing ${client.name}...`);

      // Per-client try/catch: one client's failure should not kill the whole run
      try {

      // 1. Fetch all touchpoints for this client in the period
      const { data: touchpoints, error: tpErr } = await supabase
        .from("lead_touchpoints")
        .select("id, lead_id, touchpoint_type, meta_campaign_id, meta_adset_id, meta_ad_id, timestamp")
        .eq("client_id", client.id)
        .gte("timestamp", `${periodStart}T00:00:00Z`)
        .lte("timestamp", `${periodEnd}T23:59:59Z`)
        .order("timestamp", { ascending: true });

      if (tpErr) throw new Error(`Failed to fetch touchpoints: ${tpErr.message}`);

      // 2. Fetch leads created in the period
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, client_id, created_at, is_spam")
        .eq("client_id", client.id)
        .gte("created_at", `${periodStart}T00:00:00Z`)
        .lte("created_at", `${periodEnd}T23:59:59Z`);

      if (leadsErr) throw new Error(`Failed to fetch leads: ${leadsErr.message}`);

      // 3. Fetch calls for these leads (FIXED: was silently dropping leads beyond 1000)
      const leadIds = (leads || []).map(l => l.id);
      let callsByLead: Record<string, { total: number; showed: number }> = {};
      if (leadIds.length > 0) {
        // Chunk to avoid Postgres IN() limits while still fetching ALL leads
        const CHUNK_SIZE = 500;
        for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
          const chunk = leadIds.slice(i, i + CHUNK_SIZE);
          const { data: calls, error: callsErr } = await supabase
            .from("calls")
            .select("lead_id, showed")
            .in("lead_id", chunk);

          if (callsErr) {
            throw new Error(`Failed to fetch calls for ${client.name}: ${callsErr.message}`);
          }

          for (const c of calls || []) {
            if (!c.lead_id) continue;
            const existing = callsByLead[c.lead_id] || { total: 0, showed: 0 };
            existing.total++;
            // Explicit === true check: NULL showed is NOT counted as shown (it's unknown)
            if (c.showed === true) existing.showed++;
            callsByLead[c.lead_id] = existing;
          }
        }
      }

      // 4. Fetch funded investors for these leads (FIXED: chunked, proper NULL handling)
      let fundedByLead: Record<string, { count: number; dollars: number; commitments: number; commitmentDollars: number }> = {};
      if (leadIds.length > 0) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
          const chunk = leadIds.slice(i, i + CHUNK_SIZE);
          const { data: funded, error: fundedErr } = await supabase
            .from("funded_investors")
            .select("lead_id, funded_amount, commitment_amount")
            .in("lead_id", chunk);

          if (fundedErr) {
            throw new Error(`Failed to fetch funded investors for ${client.name}: ${fundedErr.message}`);
          }

          for (const f of funded || []) {
            if (!f.lead_id) continue;
            const existing = fundedByLead[f.lead_id] || { count: 0, dollars: 0, commitments: 0, commitmentDollars: 0 };
            // Explicit NULL → 0 conversion. `Number(null) === 0`, but `Number(undefined) === NaN`, so use fallback
            const amt = f.funded_amount === null || f.funded_amount === undefined ? 0 : Number(f.funded_amount);
            const commitAmt = f.commitment_amount === null || f.commitment_amount === undefined ? 0 : Number(f.commitment_amount);
            // Count as funded if funded_amount > 0
            if (amt > 0) {
              existing.count++;
              existing.dollars += amt;
            }
            // Count as commitment if commitment_amount > 0 (independent of funded status)
            if (commitAmt > 0) {
              existing.commitments++;
              existing.commitmentDollars += commitAmt;
            }
            fundedByLead[f.lead_id] = existing;
          }
        }
      }

      // 5. Group touchpoints by lead
      const touchpointsByLead: Record<string, Touchpoint[]> = {};
      for (const tp of touchpoints || []) {
        if (!tp.lead_id) continue;
        if (!touchpointsByLead[tp.lead_id]) touchpointsByLead[tp.lead_id] = [];
        touchpointsByLead[tp.lead_id].push(tp);
      }

      // 6. Build enriched lead objects
      const enrichedLeads: LeadWithOutcome[] = (leads || [])
        .filter(l => !l.is_spam)
        .map(l => ({
          id: l.id,
          client_id: l.client_id,
          created_at: l.created_at,
          is_spam: l.is_spam,
          touchpoints: touchpointsByLead[l.id] || [],
          calls: callsByLead[l.id]?.total || 0,
          showed: callsByLead[l.id]?.showed || 0,
          commitments: fundedByLead[l.id]?.commitments || 0,
          commitment_dollars: fundedByLead[l.id]?.commitmentDollars || 0,
          funded_count: fundedByLead[l.id]?.count || 0,
          funded_dollars: fundedByLead[l.id]?.dollars || 0,
        }));

      // 7. For each model, compute attribution
      for (const model of models) {
        // Accumulate by campaign (primary), adset, ad
        const byCampaign: Record<string, any> = {};
        const byAdset: Record<string, any> = {};
        const byAd: Record<string, any> = {};

        for (const lead of enrichedLeads) {
          const weights = computeWeights(lead.touchpoints, model);

          for (const [tpId, weight] of weights) {
            const tp = lead.touchpoints.find(t => t.id === tpId);
            if (!tp) continue;

            // Campaign-level
            if (tp.meta_campaign_id) {
              const key = tp.meta_campaign_id;
              if (!byCampaign[key]) byCampaign[key] = { leads: 0, calls: 0, shows: 0, commitments: 0, commitmentDollars: 0, fundedCount: 0, fundedDollars: 0 };
              byCampaign[key].leads += weight;
              byCampaign[key].calls += weight * lead.calls;
              byCampaign[key].shows += weight * lead.showed;
              byCampaign[key].commitments += weight * lead.commitments;
              byCampaign[key].commitmentDollars += weight * lead.commitment_dollars;
              byCampaign[key].fundedCount += weight * lead.funded_count;
              byCampaign[key].fundedDollars += weight * lead.funded_dollars;
            }

            // Adset-level
            if (tp.meta_adset_id) {
              const key = tp.meta_adset_id;
              if (!byAdset[key]) byAdset[key] = { leads: 0, calls: 0, shows: 0, commitments: 0, commitmentDollars: 0, fundedCount: 0, fundedDollars: 0 };
              byAdset[key].leads += weight;
              byAdset[key].calls += weight * lead.calls;
              byAdset[key].shows += weight * lead.showed;
              byAdset[key].commitments += weight * lead.commitments;
              byAdset[key].commitmentDollars += weight * lead.commitment_dollars;
              byAdset[key].fundedCount += weight * lead.funded_count;
              byAdset[key].fundedDollars += weight * lead.funded_dollars;
            }

            // Ad-level
            if (tp.meta_ad_id) {
              const key = tp.meta_ad_id;
              if (!byAd[key]) byAd[key] = { leads: 0, calls: 0, shows: 0, commitments: 0, commitmentDollars: 0, fundedCount: 0, fundedDollars: 0 };
              byAd[key].leads += weight;
              byAd[key].calls += weight * lead.calls;
              byAd[key].shows += weight * lead.showed;
              byAd[key].commitments += weight * lead.commitments;
              byAd[key].commitmentDollars += weight * lead.commitment_dollars;
              byAd[key].fundedCount += weight * lead.funded_count;
              byAd[key].fundedDollars += weight * lead.funded_dollars;
            }
          }
        }

        // 8. Fetch spend data for campaigns to compute ROAS/CoC
        const campaignIds = Object.keys(byCampaign);
        const spendByCampaign: Record<string, number> = {};
        if (campaignIds.length > 0) {
          const { data: campaigns } = await supabase
            .from("meta_campaigns")
            .select("meta_campaign_id, spend")
            .eq("client_id", client.id)
            .in("meta_campaign_id", campaignIds);
          for (const c of campaigns || []) {
            spendByCampaign[c.meta_campaign_id] = Number(c.spend) || 0;
          }
        }

        // 9. Upsert attribution results for campaigns
        const rows: any[] = [];
        for (const [campaignId, stats] of Object.entries(byCampaign)) {
          const spend = spendByCampaign[campaignId] || 0;
          const fundedDollars = (stats as any).fundedDollars;
          rows.push({
            client_id: client.id,
            period_start: periodStart,
            period_end: periodEnd,
            attribution_model: model,
            meta_campaign_id: campaignId,
            meta_adset_id: null,
            meta_ad_id: null,
            attributed_leads: Math.round((stats as any).leads * 10000) / 10000,
            attributed_calls: Math.round((stats as any).calls * 10000) / 10000,
            attributed_shows: Math.round((stats as any).shows * 10000) / 10000,
            attributed_commitments: Math.round((stats as any).commitments * 10000) / 10000,
            attributed_commitment_dollars: Math.round((stats as any).commitmentDollars * 100) / 100,
            attributed_funded_count: Math.round((stats as any).fundedCount * 10000) / 10000,
            attributed_funded_dollars: Math.round(fundedDollars * 100) / 100,
            attributed_spend: spend,
            roas: spend > 0 ? Math.round((fundedDollars / spend) * 10000) / 10000 : 0,
            cost_of_capital_pct: fundedDollars > 0 ? Math.round((spend / fundedDollars) * 10000) / 10000 * 100 : 0,
            cpl: (stats as any).leads > 0 ? Math.round((spend / (stats as any).leads) * 100) / 100 : 0,
            cpa: (stats as any).fundedCount > 0 ? Math.round((spend / (stats as any).fundedCount) * 100) / 100 : 0,
            computed_at: new Date().toISOString(),
          });
        }

        // Batch upsert — throw on error so sync_runs correctly marks as failed
        if (rows.length > 0) {
          const { error: upsertErr } = await supabase
            .from("attribution_results")
            .upsert(rows, {
              onConflict: "client_id,period_start,period_end,attribution_model,meta_campaign_id,meta_adset_id,meta_ad_id",
            });
          if (upsertErr) {
            throw new Error(`Upsert failed for ${client.name}/${model}: ${upsertErr.message}`);
          }
        }

        // Track unattributed revenue: funded leads with zero trackable touchpoints
        const unattributedLeads = enrichedLeads.filter(l => l.touchpoints.length === 0 && l.funded_dollars > 0);
        const unattributedDollars = unattributedLeads.reduce((s, l) => s + l.funded_dollars, 0);
        if (unattributedLeads.length > 0) {
          console.warn(`[compute-attribution] ${client.name}/${model}: ${unattributedLeads.length} funded leads have zero touchpoints, $${unattributedDollars.toFixed(2)} unattributed`);
        }

        results.push({
          client: client.name,
          model,
          campaigns: Object.keys(byCampaign).length,
          leadsProcessed: enrichedLeads.length,
          touchpointsUsed: (touchpoints || []).length,
          unattributedLeads: unattributedLeads.length,
          unattributedDollars,
        });
      }

      // Log sync run (success path)
      await supabase.from("sync_runs").insert({
        client_id: client.id,
        source: "reconciliation",
        function_name: "compute-attribution",
        finished_at: new Date().toISOString(),
        status: "success",
        rows_written: results.filter(r => r.client === client.name).reduce((s, r) => s + r.campaigns, 0),
        metadata: { models, periodStart, periodEnd },
      }).then(() => {});

      } catch (clientErr) {
        // Per-client failure: log and continue with remaining clients
        const errMsg = clientErr instanceof Error ? clientErr.message : "Unknown error";
        console.error(`[compute-attribution] ${client.name} failed:`, errMsg);
        clientErrors.push({ client: client.name, error: errMsg });

        await supabase.from("sync_runs").insert({
          client_id: client.id,
          source: "reconciliation",
          function_name: "compute-attribution",
          finished_at: new Date().toISOString(),
          status: "failed",
          rows_written: 0,
          error_message: errMsg,
          metadata: { models, periodStart, periodEnd },
        }).then(() => {});
      }
    }

    const totalErrors = clientErrors.length;
    console.log(`[compute-attribution] Complete: ${results.length} model/client combinations processed, ${totalErrors} client errors`);
    return new Response(JSON.stringify({
      success: totalErrors === 0,
      results,
      clientErrors: clientErrors.length > 0 ? clientErrors : undefined,
    }), {
      status: totalErrors === clients.length ? 500 : 200, // Fail only if ALL clients failed
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[compute-attribution] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
