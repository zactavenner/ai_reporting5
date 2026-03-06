import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const HUBSPOT_API_BASE = "https://api.hubapi.com";
const BATCH_DELAY_MS = 200;
const MAX_PER_RUN = 200;

/**
 * Syncs RetargetIQ-enriched data back to the lead's source CRM (GHL or HubSpot).
 * Runs after enrich-retargetiq completes during the daily master sync.
 */

async function pushToGHL(
  apiKey: string,
  contactId: string,
  enrichment: Record<string, any>
): Promise<boolean> {
  try {
    // Build custom field updates for GHL
    const customFields: Array<{ key: string; value: string }> = [];

    if (enrichment.city) customFields.push({ key: "retargetiq_city", value: enrichment.city });
    if (enrichment.state) customFields.push({ key: "retargetiq_state", value: enrichment.state });
    if (enrichment.zip) customFields.push({ key: "retargetiq_zip", value: enrichment.zip });
    if (enrichment.household_income) customFields.push({ key: "retargetiq_income", value: enrichment.household_income });
    if (enrichment.household_net_worth) customFields.push({ key: "retargetiq_net_worth", value: enrichment.household_net_worth });
    if (enrichment.home_ownership) customFields.push({ key: "retargetiq_home_ownership", value: enrichment.home_ownership });
    if (enrichment.home_value) customFields.push({ key: "retargetiq_home_value", value: enrichment.home_value });
    if (enrichment.credit_range) customFields.push({ key: "retargetiq_credit_range", value: enrichment.credit_range });
    if (enrichment.age) customFields.push({ key: "retargetiq_age", value: enrichment.age });
    if (enrichment.gender) customFields.push({ key: "retargetiq_gender", value: enrichment.gender });

    if (enrichment.companies?.length > 0) {
      const company = enrichment.companies[0];
      if (company.title) customFields.push({ key: "retargetiq_job_title", value: company.title });
      if (company.company) customFields.push({ key: "retargetiq_company", value: company.company });
    }

    if (customFields.length === 0) return true; // Nothing to push

    const updatePayload: Record<string, any> = {
      customFields,
    };

    // Also update address if available
    if (enrichment.address) updatePayload.address1 = enrichment.address;
    if (enrichment.city) updatePayload.city = enrichment.city;
    if (enrichment.state) updatePayload.state = enrichment.state;
    if (enrichment.zip) updatePayload.postalCode = enrichment.zip;

    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GHL update failed for ${contactId}: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`GHL push error for ${contactId}:`, err);
    return false;
  }
}

async function pushToHubSpot(
  accessToken: string,
  contactId: string,
  enrichment: Record<string, any>
): Promise<boolean> {
  try {
    const properties: Record<string, string> = {};

    if (enrichment.city) properties.city = enrichment.city;
    if (enrichment.state) properties.state = enrichment.state;
    if (enrichment.zip) properties.zip = enrichment.zip;
    if (enrichment.address) properties.address = enrichment.address;

    // HubSpot custom properties (these must exist in HubSpot first)
    if (enrichment.household_income) properties.retargetiq_income = enrichment.household_income;
    if (enrichment.household_net_worth) properties.retargetiq_net_worth = enrichment.household_net_worth;
    if (enrichment.home_ownership) properties.retargetiq_home_ownership = enrichment.home_ownership;
    if (enrichment.home_value) properties.retargetiq_home_value = enrichment.home_value;
    if (enrichment.age) properties.retargetiq_age = enrichment.age;

    if (enrichment.companies?.length > 0) {
      const company = enrichment.companies[0];
      if (company.title) properties.jobtitle = company.title;
      if (company.company) properties.company = company.company;
    }

    if (Object.keys(properties).length === 0) return true;

    // Extract numeric HubSpot contact ID from external_id format "hubspot_123"
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HubSpot update failed for ${contactId}: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`HubSpot push error for ${contactId}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let clientId: string | null = null;
  try {
    const body = await req.json();
    clientId = body.clientId || body.client_id || null;
  } catch {}

  console.log(`[sync-enrichment-to-crm] Starting sync-back. Client: ${clientId || "all"}`);

  const doSyncBack = async () => {
    // Find enriched leads that haven't been synced back yet
    let query = supabase
      .from("leads")
      .select("id, client_id, external_id, email, phone, custom_fields")
      .not("custom_fields->retargetiq_enriched_at", "is", null)
      .or("custom_fields->retargetiq_synced_back_at.is.null")
      .not("external_id", "is", null)
      .limit(MAX_PER_RUN);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError || !leads || leads.length === 0) {
      console.log(`[sync-enrichment-to-crm] No leads to sync back (${leadsError?.message || "none found"})`);
      return { success: true, synced: 0, failed: 0 };
    }

    console.log(`[sync-enrichment-to-crm] Found ${leads.length} enriched leads to sync back`);

    // Get client credentials in bulk
    const clientIds = [...new Set(leads.map((l) => l.client_id))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, ghl_api_key, ghl_location_id, hubspot_access_token")
      .in("id", clientIds);

    const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);

    let synced = 0;
    let failed = 0;

    for (const lead of leads) {
      const client = clientMap.get(lead.client_id);
      if (!client) {
        failed++;
        continue;
      }

      const customFields = (lead.custom_fields as Record<string, any>) || {};
      const enrichment = customFields.retargetiq || {};

      if (Object.keys(enrichment).length === 0) {
        continue; // No enrichment data to push
      }

      let pushed = false;

      // Determine CRM source from external_id prefix
      const externalId = lead.external_id || "";

      if (externalId.startsWith("hubspot_") && client.hubspot_access_token) {
        // Push to HubSpot
        const hubspotContactId = externalId.replace("hubspot_", "");
        pushed = await pushToHubSpot(client.hubspot_access_token, hubspotContactId, enrichment);
      } else if (client.ghl_api_key && !externalId.startsWith("hubspot_")) {
        // Push to GHL (external_id is the GHL contact ID)
        pushed = await pushToGHL(client.ghl_api_key, externalId, enrichment);
      }

      if (pushed) {
        // Mark as synced back
        await supabase
          .from("leads")
          .update({
            custom_fields: {
              ...customFields,
              retargetiq_synced_back_at: new Date().toISOString(),
            },
          })
          .eq("id", lead.id);
        synced++;
      } else {
        failed++;
      }

      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    console.log(`[sync-enrichment-to-crm] Complete: synced=${synced}, failed=${failed}`);

    // Log to sync_logs
    await supabase.from("sync_logs").insert({
      client_id: clientId || "00000000-0000-0000-0000-000000000000",
      sync_type: "retargetiq-sync-back",
      status: failed === 0 ? "completed" : "partial",
      records_synced: synced,
      error_message: failed > 0 ? `${failed} leads failed to sync back` : null,
      completed_at: new Date().toISOString(),
    });

    return { success: true, synced, failed };
  };

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSyncBack());
    return new Response(
      JSON.stringify({ success: true, message: "Enrichment sync-back started (background)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } else {
    const result = await doSyncBack();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
