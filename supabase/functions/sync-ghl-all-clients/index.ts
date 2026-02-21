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

  console.log(`[sync-ghl-all-clients] Starting 6-hour GHL sync`);

  // Get all active GHL clients (exclude HubSpot-only clients)
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, ghl_api_key, ghl_location_id, hubspot_portal_id")
    .not("ghl_api_key", "is", null)
    .not("ghl_location_id", "is", null)
    .in("status", ["active", "onboarding"]);

  if (error || !clients) {
    console.error("Failed to fetch clients:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to fetch clients" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter out clients that are HubSpot-primary (have hubspot_portal_id)
  const ghlClients = clients.filter(c => !c.hubspot_portal_id);
  console.log(`[sync-ghl-all-clients] Found ${ghlClients.length} GHL clients (excluded ${clients.length - ghlClients.length} HubSpot clients)`);

  const doSync = async () => {
    const results: Array<{ clientId: string; name: string; contacts: boolean; calendar: boolean; pipelines: boolean; errors: string[] }> = [];

    for (let i = 0; i < ghlClients.length; i++) {
      const client = ghlClients[i];
      const clientResult = { clientId: client.id, name: client.name, contacts: false, calendar: false, pipelines: false, errors: [] as string[] };
      console.log(`[sync-ghl-all-clients] (${i + 1}/${ghlClients.length}) Syncing ${client.name}...`);

      // 1. Sync contacts (leads)
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ client_id: client.id, mode: "contacts" }),
        });
        const data = await res.json();
        clientResult.contacts = !data.error;
        if (data.error) clientResult.errors.push(`contacts: ${data.error}`);
        else console.log(`[sync-ghl-all-clients] ✓ ${client.name} contacts synced`);
      } catch (err) {
        clientResult.errors.push(`contacts: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      // 2. Sync calendar appointments
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-calendar-appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ clientId: client.id }),
        });
        const data = await res.json();
        clientResult.calendar = !data.error;
        if (data.error) clientResult.errors.push(`calendar: ${data.error}`);
        else console.log(`[sync-ghl-all-clients] ✓ ${client.name} calendar synced`);
      } catch (err) {
        clientResult.errors.push(`calendar: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      // 3. Sync pipelines
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-pipelines`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ client_id: client.id }),
        });
        const data = await res.json();
        clientResult.pipelines = !data.error;
        if (data.error) clientResult.errors.push(`pipelines: ${data.error}`);
        else console.log(`[sync-ghl-all-clients] ✓ ${client.name} pipelines synced`);
      } catch (err) {
        clientResult.errors.push(`pipelines: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      results.push(clientResult);

      // 15-second delay between clients
      if (i < ghlClients.length - 1) {
        console.log(`[sync-ghl-all-clients] Waiting 15s before next client...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    const successCount = results.filter(r => r.errors.length === 0).length;
    console.log(`[sync-ghl-all-clients] Complete: ${successCount}/${results.length} clients fully synced`);
    return results;
  };

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSync());
    return new Response(JSON.stringify({
      success: true,
      message: `GHL sync started for ${ghlClients.length} clients (background)`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const results = await doSync();
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
