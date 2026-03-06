import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

const RETARGETIQ_API_BASE = "https://app.retargetiq.com/api/v2";
const BATCH_DELAY_MS = 200; // Rate limit delay between API calls
const DEFAULT_BATCH_SIZE = 500; // Default leads per batch
const DB_FETCH_LIMIT = 1000; // Max leads to fetch per DB query page

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
  creditRange?: string;
  discretionaryIncome?: string;
  ownsInvestments?: string;
  ownsStocksAndBonds?: string;
  ownsMutualFunds?: string;
  investor?: string;
  education?: string;
  occupationDetail?: string;
  occupationType?: string;
  companies?: Array<{
    title?: string;
    company?: string;
    address?: string;
    linkedInUrl?: string;
    linkedin?: string;
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
  if (identity.discretionaryIncome) enrichment.discretionary_income = identity.discretionaryIncome;
  if (identity.ownsInvestments) enrichment.owns_investments = identity.ownsInvestments;
  if (identity.ownsStocksAndBonds) enrichment.owns_stocks_bonds = identity.ownsStocksAndBonds;
  if (identity.ownsMutualFunds) enrichment.owns_mutual_funds = identity.ownsMutualFunds;
  if (identity.investor) enrichment.investor = identity.investor;

  // Education & Occupation
  if (identity.education) enrichment.education = identity.education;
  if (identity.occupationDetail) enrichment.occupation = identity.occupationDetail;
  if (identity.occupationType) enrichment.occupation_type = identity.occupationType;

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
      linkedin_url: c.linkedInUrl || c.linkedin,
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

  // RetargetIQ credentials from env or agency_settings
  let retargetiqApiKey = Deno.env.get("RETARGETIQ_API_KEY");
  let retargetiqWebsite = Deno.env.get("RETARGETIQ_WEBSITE") || "default";

  // Fall back to agency_settings if env not set
  if (!retargetiqApiKey) {
    const { data: agencyData } = await supabase
      .from("agency_settings")
      .select("retargetiq_api_key, retargetiq_website")
      .not("retargetiq_api_key", "is", null)
      .limit(1)
      .maybeSingle();

    if (agencyData?.retargetiq_api_key) {
      retargetiqApiKey = agencyData.retargetiq_api_key;
      retargetiqWebsite = agencyData.retargetiq_website || "default";
    }
  }

  if (!retargetiqApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "RETARGETIQ_API_KEY not configured (env or agency_settings)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let clientId: string | null = null;
  let forceReEnrich = false;
  let enrichAll = false;
  let maxLeads = DEFAULT_BATCH_SIZE;

  try {
    const body = await req.json();
    clientId = body.clientId || body.client_id || null;
    forceReEnrich = body.forceReEnrich || false;
    enrichAll = body.enrichAll || false;
    if (body.maxLeads) maxLeads = body.maxLeads; // No cap when enrichAll is true
    if (!enrichAll && !body.maxLeads) maxLeads = DEFAULT_BATCH_SIZE;
  } catch {}

  console.log(`[enrich-retargetiq] Starting enrichment. Client: ${clientId || "all"}, force: ${forceReEnrich}, enrichAll: ${enrichAll}, max: ${enrichAll ? "unlimited" : maxLeads}`);

  const apiKey = retargetiqApiKey;
  const website = retargetiqWebsite;

  const doEnrich = async () => {
    let totalEnriched = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalProcessed = 0;
    let hasMoreLeads = true;
    let lastId: string | null = null;

    while (hasMoreLeads) {
      // Calculate batch size for this iteration
      const remainingQuota = enrichAll ? DB_FETCH_LIMIT : Math.min(maxLeads - totalProcessed, DB_FETCH_LIMIT);
      if (remainingQuota <= 0) break;

      // Build query for unenriched leads with cursor-based pagination
      let query = supabase
        .from("leads")
        .select("id, client_id, email, phone, name, custom_fields")
        .order("id", { ascending: true })
        .limit(remainingQuota);

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      if (!forceReEnrich) {
        query = query.or("custom_fields.is.null,custom_fields->retargetiq_enriched_at.is.null");
      }

      // Must have email or phone to enrich
      query = query.or("email.neq.,phone.neq.");

      // Cursor pagination: fetch leads after the last processed ID
      if (lastId) {
        query = query.gt("id", lastId);
      }

      const { data: leads, error: leadsError } = await query;

      if (leadsError) {
        console.error("[enrich-retargetiq] Failed to fetch leads:", leadsError);
        break;
      }

      if (!leads || leads.length === 0) {
        hasMoreLeads = false;
        break;
      }

      console.log(`[enrich-retargetiq] Processing batch of ${leads.length} leads (total so far: ${totalProcessed})`);

      for (const lead of leads) {
        try {
          let identity: RetargetIQIdentity | null = null;

          if (lead.email) {
            identity = await enrichByEmail(apiKey, website, lead.email);
          }

          if (!identity && lead.phone) {
            identity = await enrichByPhone(apiKey, website, lead.phone);
          }

          if (!identity) {
            // Mark as attempted so we don't retry endlessly
            const existingCF = (lead.custom_fields as Record<string, any>) || {};
            if (!existingCF.retargetiq_enriched_at) {
              await supabase
                .from("leads")
                .update({
                  custom_fields: {
                    ...existingCF,
                    retargetiq_enriched_at: new Date().toISOString(),
                    retargetiq_no_match: true,
                  },
                })
                .eq("id", lead.id);
            }
            totalSkipped++;
            totalProcessed++;
            continue;
          }

          const enrichmentData = buildEnrichmentData(identity);
          const existingCustomFields = (lead.custom_fields as Record<string, any>) || {};
          const updatedCustomFields = {
            ...existingCustomFields,
            retargetiq: enrichmentData,
            retargetiq_enriched_at: new Date().toISOString(),
            retargetiq_no_match: undefined, // Clear previous no-match flag
          };

          const updatePayload: Record<string, any> = {
            custom_fields: updatedCustomFields,
          };

          if (!lead.name && (identity.firstName || identity.lastName)) {
            updatePayload.name = [identity.firstName, identity.lastName].filter(Boolean).join(" ");
          }

          const { error: updateError } = await supabase
            .from("leads")
            .update(updatePayload)
            .eq("id", lead.id);

          if (updateError) {
            console.error(`[enrich-retargetiq] Failed to update lead ${lead.id}:`, updateError);
            totalFailed++;
          } else {
            totalEnriched++;
          }

          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        } catch (err) {
          console.error(`[enrich-retargetiq] Error enriching lead ${lead.id}:`, err);
          totalFailed++;
        }

        totalProcessed++;
      }

      // Update cursor for next batch
      lastId = leads[leads.length - 1].id;

      // Stop if this was the last page or we've hit our quota
      if (leads.length < remainingQuota) {
        hasMoreLeads = false;
      }
      if (!enrichAll && totalProcessed >= maxLeads) {
        hasMoreLeads = false;
      }

      // Log progress for large enrichment runs
      if (enrichAll && totalProcessed > 0 && totalProcessed % 500 === 0) {
        console.log(`[enrich-retargetiq] Progress: ${totalProcessed} processed, ${totalEnriched} enriched, ${totalSkipped} skipped, ${totalFailed} failed`);

        // Save progress to sync_logs
        await supabase.from("sync_logs").insert({
          client_id: clientId || "00000000-0000-0000-0000-000000000000",
          sync_type: "retargetiq-enrichment-progress",
          status: "running",
          records_synced: totalEnriched,
          error_message: `In progress: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalFailed} failed`,
          completed_at: new Date().toISOString(),
        });
      }
    }

    console.log(`[enrich-retargetiq] Complete: enriched=${totalEnriched}, skipped=${totalSkipped}, failed=${totalFailed}, total=${totalProcessed}`);

    // Final sync_logs entry
    await supabase.from("sync_logs").insert({
      client_id: clientId || "00000000-0000-0000-0000-000000000000",
      sync_type: "retargetiq-enrichment",
      status: totalFailed === 0 ? "completed" : "partial",
      records_synced: totalEnriched,
      error_message: totalFailed > 0 ? `${totalFailed} leads failed to enrich out of ${totalProcessed} processed` : null,
      completed_at: new Date().toISOString(),
    });

    return { success: true, enriched: totalEnriched, skipped: totalSkipped, failed: totalFailed, totalProcessed };
  };

  // Always run in background for enrichAll or large batches
  if (typeof EdgeRuntime !== "undefined" && (enrichAll || !clientId)) {
    EdgeRuntime.waitUntil(doEnrich());
    return new Response(
      JSON.stringify({
        success: true,
        message: enrichAll
          ? "RetargetIQ full database enrichment started (background). Check sync_logs for progress."
          : "RetargetIQ enrichment started (background)",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } else {
    const result = await doEnrich();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
