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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Compute yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  console.log(`[sync-meta-ads-daily] Starting daily sync for ${yesterdayStr}`);

  // Get all active clients with a meta_ad_account_id
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, meta_ad_account_id")
    .not("meta_ad_account_id", "is", null)
    .in("status", ["active", "onboarding"]);

  if (error || !clients) {
    console.error("Failed to fetch clients:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to fetch clients" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[sync-meta-ads-daily] Found ${clients.length} clients with ad accounts`);

  const doSync = async () => {
    const results: Array<{ clientId: string; name: string; success: boolean; error?: string }> = [];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      console.log(`[sync-meta-ads-daily] (${i + 1}/${clients.length}) Syncing ${client.name}...`);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/sync-meta-ads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            clientId: client.id,
            startDate: yesterdayStr,
            endDate: yesterdayStr,
          }),
        });

        const data = await response.json();
        if (data.success) {
          console.log(`[sync-meta-ads-daily] ✓ ${client.name}: ${data.campaigns} campaigns, ${data.adSets} ad sets, ${data.ads} ads`);
          results.push({ clientId: client.id, name: client.name, success: true });
        } else {
          console.error(`[sync-meta-ads-daily] ✗ ${client.name}: ${data.error}`);
          results.push({ clientId: client.id, name: client.name, success: false, error: data.error });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[sync-meta-ads-daily] ✗ ${client.name}: ${errMsg}`);
        results.push({ clientId: client.id, name: client.name, success: false, error: errMsg });
      }

      // 30-second delay between clients to respect rate limits
      if (i < clients.length - 1) {
        console.log(`[sync-meta-ads-daily] Waiting 30s before next client...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[sync-meta-ads-daily] Complete: ${succeeded} succeeded, ${failed} failed out of ${results.length} clients`);
    return results;
  };

  // Run in background if possible
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSync());
    return new Response(JSON.stringify({
      success: true,
      message: `Daily Meta Ads sync started for ${clients.length} clients (background)`,
      date: yesterdayStr,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const results = await doSync();
    return new Response(JSON.stringify({
      success: true,
      date: yesterdayStr,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
