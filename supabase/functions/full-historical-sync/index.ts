import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Production DB for data queries
  const dbUrl = Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const dbKey = Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(dbUrl, dbKey);
  // Lovable Cloud URL for calling other edge functions (they're deployed here)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let startDate = "2026-01-01";
  let clientId: string | undefined;
  try {
    const body = await req.json();
    if (body?.startDate) startDate = body.startDate;
    if (body?.clientId) clientId = body.clientId;
  } catch {}

  const now = new Date();
  const start = new Date(startDate + "T00:00:00Z");
  const sinceDateDays = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const endDate = now.toISOString().split("T")[0];

  console.log(`[full-historical-sync] Starting from ${startDate} (${sinceDateDays} days back)${clientId ? ` for client ${clientId}` : " for ALL clients"}`);

  const doSync = async () => {
    const results: Record<string, any> = { startDate, endDate, sinceDateDays, steps: {} };

    // Step 1: GHL sync
    console.log(`[full-historical-sync] Step 1/4: GHL contacts sync...`);
    try {
      if (clientId) {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ client_id: clientId, syncType: "contacts", sinceDateDays }),
        });
        results.steps.ghl = await res.json();
      } else {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-all-clients`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ sinceDateDays }),
        });
        results.steps.ghl = await res.json();
      }
      console.log(`[full-historical-sync] GHL sync triggered`);
    } catch (err) {
      results.steps.ghl = { error: err instanceof Error ? err.message : "Unknown" };
      console.error(`[full-historical-sync] GHL sync failed:`, err);
    }

    // Wait for GHL sync to process (it runs in background)
    console.log(`[full-historical-sync] Waiting 60s for GHL sync to process...`);
    await new Promise(r => setTimeout(r, 60000));

    // Step 2: HubSpot sync
    console.log(`[full-historical-sync] Step 2/4: HubSpot sync...`);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-hubspot-all-clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({}),
      });
      results.steps.hubspot = await res.json();
      console.log(`[full-historical-sync] HubSpot sync triggered`);
    } catch (err) {
      results.steps.hubspot = { error: err instanceof Error ? err.message : "Unknown" };
    }

    // Wait for HubSpot sync
    await new Promise(r => setTimeout(r, 30000));

    // Step 3: Recalculate daily metrics
    console.log(`[full-historical-sync] Step 3/4: Recalculating daily metrics...`);
    try {
      const body: Record<string, any> = { startDate, endDate };
      if (clientId) body.clientId = clientId;
      const res = await fetch(`${supabaseUrl}/functions/v1/recalculate-daily-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify(body),
      });
      results.steps.metrics = await res.json();
      console.log(`[full-historical-sync] Metrics recalculation complete`);
    } catch (err) {
      results.steps.metrics = { error: err instanceof Error ? err.message : "Unknown" };
    }

    // Step 4: Accuracy check
    console.log(`[full-historical-sync] Step 4/4: Running accuracy check...`);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/daily-accuracy-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({}),
      });
      results.steps.accuracy = await res.json();
      console.log(`[full-historical-sync] Accuracy check complete`);
    } catch (err) {
      results.steps.accuracy = { error: err instanceof Error ? err.message : "Unknown" };
    }

    console.log(`[full-historical-sync] All steps complete`, JSON.stringify(results));
    return results;
  };

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSync());
    return new Response(JSON.stringify({
      success: true,
      message: `Full historical sync started from ${startDate} (${sinceDateDays} days, background)`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const results = await doSync();
    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
