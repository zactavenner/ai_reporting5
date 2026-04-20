import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GHLContact {
  id: string;
  email?: string;
  phone?: string;
}

async function searchGHLContacts(
  apiKey: string,
  locationId: string,
  query: string
): Promise<GHLContact[]> {
  const res = await fetch(
    "https://services.leadconnectorhq.com/contacts/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId,
        query,
        page: 1,
        pageLimit: 100,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL search failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.contacts || [];
}

async function getGHLContactCount(
  apiKey: string,
  locationId: string
): Promise<number> {
  // Use search with empty query to get total count
  const res = await fetch(
    "https://services.leadconnectorhq.com/contacts/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId,
        page: 1,
        pageLimit: 1,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL count failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.total || 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all active clients with GHL credentials
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, ghl_api_key, ghl_location_id")
      .eq("status", "active")
      .not("ghl_api_key", "is", null)
      .not("ghl_location_id", "is", null);

    if (clientErr) throw clientErr;

    const today = new Date().toISOString().split("T")[0];
    const results: any[] = [];

    for (const client of clients || []) {
      try {
        // Count local leads (last 30 days, non-spam, valid contact info)
        const { count: localCount, error: countErr } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("client_id", client.id)
          .eq("is_spam", false)
          .not("email", "is", null);

        if (countErr) throw countErr;

        // Get GHL total contact count
        let ghlCount = 0;
        try {
          ghlCount = await getGHLContactCount(
            client.ghl_api_key,
            client.ghl_location_id
          );
        } catch (ghlErr: any) {
          console.warn(`[Recon] GHL count failed for ${client.name}: ${ghlErr.message}`);
          // Still record result with 0 GHL count and note the error
          const { error: insertErr } = await supabase
            .from("ghl_reconciliation_results")
            .upsert({
              client_id: client.id,
              reconciliation_date: today,
              local_lead_count: localCount || 0,
              ghl_contact_count: 0,
              missing_in_ghl: localCount || 0,
              extra_in_ghl: 0,
              matched_count: 0,
              notes: `GHL API error: ${ghlErr.message}`,
            }, { onConflict: "client_id,reconciliation_date" });
          if (insertErr) console.error(`[Recon] Insert error: ${insertErr.message}`);
          results.push({
            client: client.name,
            status: "ghl_error",
            error: ghlErr.message,
          });
          continue;
        }

        // Sample check: pick up to 10 recent local leads and verify in GHL
        const { data: sampleLeads } = await supabase
          .from("leads")
          .select("id, email, phone")
          .eq("client_id", client.id)
          .eq("is_spam", false)
          .not("email", "is", null)
          .order("created_at", { ascending: false })
          .limit(10);

        let matchedSample = 0;
        const missingIds: string[] = [];

        for (const lead of sampleLeads || []) {
          try {
            const searchQuery = lead.email || lead.phone || "";
            if (!searchQuery) continue;
            
            const contacts = await searchGHLContacts(
              client.ghl_api_key,
              client.ghl_location_id,
              searchQuery
            );
            
            if (contacts.length > 0) {
              matchedSample++;
            } else {
              missingIds.push(lead.id);
            }
            
            // Rate limit: 100ms between GHL calls
            await new Promise((r) => setTimeout(r, 100));
          } catch {
            // Skip individual search failures
          }
        }

        const sampleSize = (sampleLeads || []).length;
        const matchRate = sampleSize > 0 ? matchedSample / sampleSize : 1;
        const estimatedMissing = Math.round((1 - matchRate) * (localCount || 0));
        const extraInGhl = Math.max(0, ghlCount - (localCount || 0));

        const { error: insertErr } = await supabase
          .from("ghl_reconciliation_results")
          .upsert({
            client_id: client.id,
            reconciliation_date: today,
            local_lead_count: localCount || 0,
            ghl_contact_count: ghlCount,
            missing_in_ghl: estimatedMissing,
            extra_in_ghl: extraInGhl,
            matched_count: Math.round(matchRate * (localCount || 0)),
            sample_missing_lead_ids: missingIds,
            notes: `Sample: ${matchedSample}/${sampleSize} matched. Match rate: ${(matchRate * 100).toFixed(1)}%`,
          }, { onConflict: "client_id,reconciliation_date" });

        if (insertErr) console.error(`[Recon] Insert error for ${client.name}: ${insertErr.message}`);

        // Auto-resync if match rate below 95%
        if (matchRate < 0.95 && sampleSize >= 5) {
          console.log(`[Recon] Triggering re-sync for ${client.name} (match rate ${(matchRate * 100).toFixed(1)}%)`);
          fetch(`${supabaseUrl}/functions/v1/sync-ghl-contacts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ client_id: client.id, syncType: "contacts", sinceDateDays: 90 }),
          }).catch((e) => console.error(`[Recon] Re-sync dispatch failed: ${e.message}`));
        }

        results.push({
          client: client.name,
          local: localCount || 0,
          ghl: ghlCount,
          match_rate: `${(matchRate * 100).toFixed(1)}%`,
          estimated_missing: estimatedMissing,
          sample_missing: missingIds.length,
          resync_triggered: matchRate < 0.95 && sampleSize >= 5,
        });
      } catch (clientError: any) {
        console.error(`[Recon] Error for ${client.name}: ${clientError.message}`);
        results.push({
          client: client.name,
          status: "error",
          error: clientError.message,
        });
      }
    }

    const summary = {
      success: true,
      date: today,
      clients_checked: results.length,
      results,
    };

    console.log("[Recon] Completed:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Recon] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
