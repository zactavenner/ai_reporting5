import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

// ── Retry helper with exponential backoff ──
async function callWithRetry(
  fn: () => Promise<Response>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 5000,
): Promise<{ data: any; ok: boolean }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fn();
      const data = await res.json();
      
      if (res.status === 429) {
        // Rate limited — back off with jitter
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 2000;
        console.warn(`[sync-ghl-all-clients] ${label}: Rate limited (429), retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      if (res.status >= 500 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.warn(`[sync-ghl-all-clients] ${label}: Server error (${res.status}), retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return { data, ok: !data.error && res.ok };
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[sync-ghl-all-clients] ${label}: Network error, retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s:`, err);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { data: { error: err instanceof Error ? err.message : "Unknown" }, ok: false };
    }
  }
  return { data: { error: "Max retries exceeded" }, ok: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse optional sinceDateDays from request body
  let sinceDateDays: number | undefined;
  let singleClientId: string | undefined;
  try {
    const body = await req.json();
    if (body?.sinceDateDays) {
      sinceDateDays = Math.min(Math.max(parseInt(body.sinceDateDays) || 7, 1), 365);
    }
    if (body?.clientId) {
      singleClientId = body.clientId;
    }
  } catch {}

  console.log(`[sync-ghl-all-clients] Starting GHL sync${sinceDateDays ? ` (${sinceDateDays} days back)` : ''}${singleClientId ? ` (single client: ${singleClientId})` : ''}`);

  // Get clients with valid GHL credentials
  let query = supabase
    .from("clients")
    .select("id, name, ghl_api_key, ghl_location_id")
    .not("ghl_api_key", "is", null)
    .not("ghl_location_id", "is", null);

  if (singleClientId) {
    query = query.eq("id", singleClientId);
  }

  const { data: clients, error } = await query;

  if (error || !clients) {
    console.error("Failed to fetch clients:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to fetch clients" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[sync-ghl-all-clients] Found ${clients.length} GHL clients to sync`);

  // ── Create sync_run for tracking ──
  const { data: syncRun } = await supabase.from("sync_runs").insert({
    function_name: "sync-ghl-all-clients",
    started_at: new Date().toISOString(),
    status: "running",
    metadata: { clientCount: clients.length, sinceDateDays, singleClientId },
  }).select("id").single();
  const syncRunId = syncRun?.id;

  const doSync = async () => {
    const results: Array<{ clientId: string; name: string; contacts: boolean; calendar: boolean; pipelines: boolean; errors: string[] }> = [];
    let totalRowsWritten = 0;

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientResult = { clientId: client.id, name: client.name, contacts: false, calendar: false, pipelines: false, errors: [] as string[] };
      console.log(`[sync-ghl-all-clients] (${i + 1}/${clients.length}) Syncing ${client.name}...`);

      // 1. Sync contacts (leads) with retry
      const contactsBody: Record<string, unknown> = { client_id: client.id, syncType: "contacts" };
      if (sinceDateDays) contactsBody.sinceDateDays = sinceDateDays;
      
      const contactsResult = await callWithRetry(
        () => fetch(`${supabaseUrl}/functions/v1/sync-ghl-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify(contactsBody),
        }),
        `${client.name}/contacts`,
      );
      
      clientResult.contacts = contactsResult.ok;
      if (!contactsResult.ok) {
        clientResult.errors.push(`contacts: ${contactsResult.data?.error || 'Failed'}`);
      } else {
        console.log(`[sync-ghl-all-clients] ✓ ${client.name} contacts synced`);
        totalRowsWritten += (contactsResult.data?.results?.[0]?.contacts?.created || 0) + (contactsResult.data?.results?.[0]?.contacts?.updated || 0);
      }

      // 10s delay between sub-functions (prevent GHL rate limit)
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 2. Sync calendar appointments with retry
      const calendarBody: Record<string, unknown> = { clientId: client.id };
      if (sinceDateDays) calendarBody.sinceDateDays = sinceDateDays;
      
      const calendarResult = await callWithRetry(
        () => fetch(`${supabaseUrl}/functions/v1/sync-calendar-appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify(calendarBody),
        }),
        `${client.name}/calendar`,
      );
      
      clientResult.calendar = calendarResult.ok;
      if (!calendarResult.ok) {
        clientResult.errors.push(`calendar: ${calendarResult.data?.error || 'Failed'}`);
      } else {
        console.log(`[sync-ghl-all-clients] ✓ ${client.name} calendar synced`);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));

      // 3. Sync pipelines with retry
      const pipelinesResult = await callWithRetry(
        () => fetch(`${supabaseUrl}/functions/v1/sync-ghl-pipelines`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ client_id: client.id }),
        }),
        `${client.name}/pipelines`,
      );
      
      clientResult.pipelines = pipelinesResult.ok;
      if (!pipelinesResult.ok) {
        clientResult.errors.push(`pipelines: ${pipelinesResult.data?.error || 'Failed'}`);
      } else {
        console.log(`[sync-ghl-all-clients] ✓ ${client.name} pipelines synced`);
      }

      results.push(clientResult);

      // 30-second delay between clients to stay well within GHL rate limits
      if (i < clients.length - 1) {
        console.log(`[sync-ghl-all-clients] Waiting 30s before next client...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    const successCount = results.filter(r => r.errors.length === 0).length;
    const failedCount = results.filter(r => r.errors.length > 0).length;
    console.log(`[sync-ghl-all-clients] Complete: ${successCount}/${results.length} clients fully synced`);

    // Trigger daily metrics recalculation after sync
    console.log(`[sync-ghl-all-clients] Triggering daily metrics recalculation...`);
    const recalcResult = await callWithRetry(
      () => fetch(`${supabaseUrl}/functions/v1/recalculate-daily-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ days: sinceDateDays || 7 }),
      }),
      "recalculate-daily-metrics",
      2,
    );
    console.log(`[sync-ghl-all-clients] Metrics recalculation:`, recalcResult.ok ? "success" : recalcResult.data?.error);

    // ── Update sync_run ──
    if (syncRunId) {
      await supabase.from("sync_runs").update({
        finished_at: new Date().toISOString(),
        status: failedCount > 0 ? "partial" : "completed",
        rows_written: totalRowsWritten,
        error_message: failedCount > 0 ? `${failedCount} client(s) had errors` : null,
        metadata: { 
          clientCount: clients.length, 
          succeeded: successCount, 
          failed: failedCount,
          sinceDateDays,
          clients: results.map(r => ({ name: r.name, ok: r.errors.length === 0, errors: r.errors })),
        },
      }).eq("id", syncRunId);
    }

    return results;
  };

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSync());
    return new Response(JSON.stringify({
      success: true,
      message: `GHL sync started for ${clients.length} clients (background)${sinceDateDays ? `, ${sinceDateDays} days back` : ''}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const results = await doSync();
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
