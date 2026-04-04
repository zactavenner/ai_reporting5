import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

interface DiagnosticResult {
  clientId: string;
  clientName: string;
  hasGhlKey: boolean;
  hasGhlLocation: boolean;
  ghlApiReachable: boolean;
  ghlContactCount: number;
  dbLeadCount: number;
  dbCallCount: number;
  lastGhlSync: string | null;
  error: string | null;
  mismatch: boolean;
}

async function testGhlConnection(
  apiKey: string,
  locationId: string
): Promise<{ reachable: boolean; contactCount: number; error: string | null }> {
  try {
    const response = await fetch(`${GHL_BASE_URL}/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ locationId, pageLimit: 1, page: 1 }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { reachable: false, contactCount: 0, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
    }

    const data = await response.json();
    const total = data.total || data.meta?.total || 0;
    return { reachable: true, contactCount: total, error: null };
  } catch (err) {
    return { reachable: false, contactCount: 0, error: err instanceof Error ? err.message : "Unknown" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Optional: diagnose a single client
  let singleClientId: string | null = null;
  try {
    const body = await req.json();
    singleClientId = body?.client_id || null;
  } catch {}

  console.log(`[diagnose-ghl-sync] Starting GHL diagnostic${singleClientId ? ` for client ${singleClientId}` : " for all clients"}`);

  // Fetch all clients (or single)
  let query = supabase
    .from("clients")
    .select("id, name, ghl_api_key, ghl_location_id, last_ghl_sync_at, status")
    .in("status", ["active", "onboarding"]);

  if (singleClientId) {
    query = query.eq("id", singleClientId);
  }

  const { data: clients, error } = await query;
  if (error || !clients) {
    return new Response(JSON.stringify({ success: false, error: "Failed to fetch clients" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: DiagnosticResult[] = [];

  for (const client of clients) {
    const hasKey = !!client.ghl_api_key;
    const hasLocation = !!client.ghl_location_id;

    const result: DiagnosticResult = {
      clientId: client.id,
      clientName: client.name,
      hasGhlKey: hasKey,
      hasGhlLocation: hasLocation,
      ghlApiReachable: false,
      ghlContactCount: 0,
      dbLeadCount: 0,
      dbCallCount: 0,
      lastGhlSync: client.last_ghl_sync_at || null,
      error: null,
      mismatch: false,
    };

    if (!hasKey || !hasLocation) {
      result.error = !hasKey ? "Missing GHL API key" : "Missing GHL Location ID";
      results.push(result);
      continue;
    }

    // Test GHL API connectivity and get total contacts
    const ghlTest = await testGhlConnection(client.ghl_api_key, client.ghl_location_id);
    result.ghlApiReachable = ghlTest.reachable;
    result.ghlContactCount = ghlTest.contactCount;
    result.error = ghlTest.error;

    // Get DB counts
    const [leadsRes, callsRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id),
      supabase
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id),
    ]);

    result.dbLeadCount = leadsRes.count || 0;
    result.dbCallCount = callsRes.count || 0;

    // Flag mismatch if GHL has contacts but DB has significantly fewer
    if (ghlTest.reachable && ghlTest.contactCount > 0) {
      const ratio = result.dbLeadCount / ghlTest.contactCount;
      result.mismatch = ratio < 0.5; // Less than 50% synced = mismatch
    }

    results.push(result);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  const totalClients = results.length;
  const missingCredentials = results.filter((r) => !r.hasGhlKey || !r.hasGhlLocation).length;
  const apiUnreachable = results.filter((r) => r.hasGhlKey && r.hasGhlLocation && !r.ghlApiReachable).length;
  const mismatches = results.filter((r) => r.mismatch).length;
  const healthy = results.filter((r) => r.ghlApiReachable && !r.mismatch).length;

  console.log(`[diagnose-ghl-sync] Results: ${healthy} healthy, ${missingCredentials} missing creds, ${apiUnreachable} unreachable, ${mismatches} mismatches`);

  return new Response(
    JSON.stringify({
      success: true,
      summary: {
        totalClients,
        healthy,
        missingCredentials,
        apiUnreachable,
        mismatches,
      },
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
