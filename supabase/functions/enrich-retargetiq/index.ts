import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

const RETARGETIQ_API_BASE = "https://app.retargetiq.com/api/v2";
const BATCH_DELAY_MS = 200; // Rate limit delay between API calls
const MAX_ENRICHMENTS_PER_RUN = 500; // Safety cap per invocation

interface RetargetIQIdentity {
  firstName?: string;
  lastName?: string;
  gender?: string;
  age?: string;
  maritalStatus?: string;
  language?: string;
  phones?: Array<{ phone?: string; carrier?: string; dnc?: boolean }>;
  emails?: Array<{ email?: string; md5?: string }>;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string;
  longitude?: string;
  householdIncome?: string;
  householdNetWorth?: string;
  homeOwnership?: string;
  homeValue?: string;
  companies?: Array<{
    title?: string;
    company?: string;
    address?: string;
    linkedInUrl?: string;
  }>;
  vehicles?: Array<{
    make?: string;
    model?: string;
    year?: string;
  }>;
  [key: string]: any;
}

async function enrichByEmail(
  apiKey: string,
  website: string,
  email: string
): Promise<RetargetIQIdentity | null> {
  try {
    const response = await fetch(`${RETARGETIQ_API_BASE}/GetDataByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, website, email }),
    });

    if (!response.ok) {
      console.warn(`RetargetIQ email lookup failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data?.identities?.length > 0) {
      return data.data.identities[0];
    }
    return null;
  } catch (err) {
    console.error(`RetargetIQ email enrichment error:`, err);
    return null;
  }
}

async function enrichByPhone(
  apiKey: string,
  website: string,
  phone: string
): Promise<RetargetIQIdentity | null> {
  try {
    // Clean phone number - remove non-digits
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) return null;

    const response = await fetch(`${RETARGETIQ_API_BASE}/GetDataByPhone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, website, phone: cleanPhone }),
    });

    if (!response.ok) {
      console.warn(`RetargetIQ phone lookup failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data?.identities?.length > 0) {
      return data.data.identities[0];
    }
    return null;
  } catch (err) {
    console.error(`RetargetIQ phone enrichment error:`, err);
    return null;
  }
}

function buildEnrichmentData(identity: RetargetIQIdentity): Record<string, any> {
  const enrichment: Record<string, any> = {};

  // Demographics
  if (identity.gender) enrichment.gender = identity.gender;
  if (identity.age) enrichment.age = identity.age;
  if (identity.maritalStatus) enrichment.marital_status = identity.maritalStatus;
  if (identity.language) enrichment.language = identity.language;

  // Location
  if (identity.address) enrichment.address = identity.address;
  if (identity.city) enrichment.city = identity.city;
  if (identity.state) enrichment.state = identity.state;
  if (identity.zip) enrichment.zip = identity.zip;
  if (identity.latitude) enrichment.latitude = identity.latitude;
  if (identity.longitude) enrichment.longitude = identity.longitude;

  // Financial
  if (identity.householdIncome) enrichment.household_income = identity.householdIncome;
  if (identity.householdNetWorth) enrichment.household_net_worth = identity.householdNetWorth;
  if (identity.homeOwnership) enrichment.home_ownership = identity.homeOwnership;
  if (identity.homeValue) enrichment.home_value = identity.homeValue;
  if (identity.creditRange) enrichment.credit_range = identity.creditRange;

  // Additional phones/emails from enrichment
  if (identity.phones?.length) {
    enrichment.additional_phones = identity.phones
      .filter((p) => p.phone)
      .map((p) => ({ phone: p.phone, carrier: p.carrier, dnc: p.dnc }));
  }
  if (identity.emails?.length) {
    enrichment.additional_emails = identity.emails
      .filter((e) => e.email)
      .map((e) => e.email);
  }

  // Employment
  if (identity.companies?.length) {
    enrichment.companies = identity.companies.map((c) => ({
      title: c.title,
      company: c.company,
      linkedin_url: c.linkedInUrl,
    }));
  }

  // Vehicles
  if (identity.vehicles?.length) {
    enrichment.vehicles = identity.vehicles.map((v) => ({
      make: v.make,
      model: v.model,
      year: v.year,
    }));
  }

  return enrichment;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // RetargetIQ credentials from env (set as Supabase secrets)
  const retargetiqApiKey = Deno.env.get("RETARGETIQ_API_KEY");
  const retargetiqWebsite = Deno.env.get("RETARGETIQ_WEBSITE") || "default";

  if (!retargetiqApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "RETARGETIQ_API_KEY not configured" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let clientId: string | null = null;
  let forceReEnrich = false;
  let maxLeads = MAX_ENRICHMENTS_PER_RUN;

  try {
    const body = await req.json();
    clientId = body.clientId || body.client_id || null;
    forceReEnrich = body.forceReEnrich || false;
    if (body.maxLeads) maxLeads = Math.min(body.maxLeads, MAX_ENRICHMENTS_PER_RUN);
  } catch {}

  console.log(`[enrich-retargetiq] Starting enrichment. Client: ${clientId || "all"}, force: ${forceReEnrich}, max: ${maxLeads}`);

  const doEnrich = async () => {
    // Get leads that need enrichment (have email or phone, not yet enriched)
    let query = supabase
      .from("leads")
      .select("id, client_id, email, phone, name, custom_fields")
      .order("created_at", { ascending: false })
      .limit(maxLeads);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    if (!forceReEnrich) {
      // Only enrich leads that haven't been enriched yet
      // Check if custom_fields doesn't have retargetiq_enriched_at
      query = query.or("custom_fields.is.null,custom_fields->retargetiq_enriched_at.is.null");
    }

    // Must have email or phone to enrich
    query = query.or("email.neq.,phone.neq.");

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error("[enrich-retargetiq] Failed to fetch leads:", leadsError);
      return { success: false, error: leadsError.message, enriched: 0, skipped: 0, failed: 0 };
    }

    if (!leads || leads.length === 0) {
      console.log("[enrich-retargetiq] No leads to enrich");
      return { success: true, enriched: 0, skipped: 0, failed: 0, message: "No leads to enrich" };
    }

    console.log(`[enrich-retargetiq] Found ${leads.length} leads to enrich`);

    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        let identity: RetargetIQIdentity | null = null;

        // Try email first, then phone
        if (lead.email) {
          identity = await enrichByEmail(retargetiqApiKey, retargetiqWebsite, lead.email);
        }

        if (!identity && lead.phone) {
          identity = await enrichByPhone(retargetiqApiKey, retargetiqWebsite, lead.phone);
        }

        if (!identity) {
          skipped++;
          continue;
        }

        // Build enrichment data
        const enrichmentData = buildEnrichmentData(identity);

        // Merge into custom_fields preserving existing data
        const existingCustomFields = (lead.custom_fields as Record<string, any>) || {};
        const updatedCustomFields = {
          ...existingCustomFields,
          retargetiq: enrichmentData,
          retargetiq_enriched_at: new Date().toISOString(),
        };

        // Update lead with enriched data
        const updatePayload: Record<string, any> = {
          custom_fields: updatedCustomFields,
        };

        // Fill in missing name from enrichment
        if (!lead.name && (identity.firstName || identity.lastName)) {
          updatePayload.name = [identity.firstName, identity.lastName].filter(Boolean).join(" ");
        }

        const { error: updateError } = await supabase
          .from("leads")
          .update(updatePayload)
          .eq("id", lead.id);

        if (updateError) {
          console.error(`[enrich-retargetiq] Failed to update lead ${lead.id}:`, updateError);
          failed++;
        } else {
          enriched++;
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (err) {
        console.error(`[enrich-retargetiq] Error enriching lead ${lead.id}:`, err);
        failed++;
      }
    }

    console.log(`[enrich-retargetiq] Complete: enriched=${enriched}, skipped=${skipped}, failed=${failed}`);

    // Log to sync_logs
    await supabase.from("sync_logs").insert({
      client_id: clientId || "00000000-0000-0000-0000-000000000000",
      sync_type: "retargetiq-enrichment",
      status: failed === 0 ? "completed" : "partial",
      records_synced: enriched,
      error_message: failed > 0 ? `${failed} leads failed to enrich` : null,
      completed_at: new Date().toISOString(),
    });

    return { success: true, enriched, skipped, failed };
  };

  // Run in background for large batches
  if (typeof EdgeRuntime !== "undefined" && !clientId) {
    EdgeRuntime.waitUntil(doEnrich());
    return new Response(
      JSON.stringify({ success: true, message: "RetargetIQ enrichment started (background)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } else {
    const result = await doEnrich();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
