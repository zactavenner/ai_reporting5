import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

interface ClientSyncResult {
  client_id: string;
  client_name: string;
  meta_ok: boolean;
  ghl_contacts_ok: boolean;
  ghl_pipelines_ok: boolean;
  metrics_recalculated: boolean;
  errors: string[];
  duration_ms: number;
  rows_written: number;
}

// ── Retry-aware fetch helper ──
async function callFunction(
  supabaseUrl: string,
  supabaseKey: string,
  functionName: string,
  body: Record<string, unknown> = {},
  label = "",
  maxRetries = 3,
): Promise<{ success: boolean; data?: any; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const delay = 5000 * Math.pow(2, attempt - 1) + Math.random() * 2000;
          console.warn(`[daily-master-sync] ${label}: ${res.status}, retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      return { success: !data.error && res.ok, data, error: data.error };
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = 5000 * Math.pow(2, attempt - 1);
        console.warn(`[daily-master-sync] ${label}: network error, retry ${attempt}/${maxRetries}`, err);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { success: false, error: err instanceof Error ? err.message : "Unknown" };
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

async function createAlertTask(
  supabase: any,
  title: string,
  description: string,
  priority: string = "high",
) {
  try {
    await supabase.from("tasks").insert({
      title,
      description,
      priority,
      status: "todo",
      stage: "backlog",
      created_by: "system",
    });
  } catch (err) {
    console.error(`[daily-master-sync] Failed to create alert task:`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let skipSteps: string[] = [];
  try {
    const body = await req.json();
    skipSteps = body.skipSteps || [];
  } catch {}

  console.log(`[daily-master-sync] Starting per-client master sync pipeline`);

  const doSync = async () => {
    // ── Step 0: Clean up stale sync runs (older than 2 hours, still "running") ──
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: staleRuns } = await supabase
        .from("sync_runs")
        .update({ status: "timed_out", completed_at: new Date().toISOString() })
        .eq("status", "running")
        .lt("started_at", twoHoursAgo)
        .select("id");
      if (staleRuns?.length) {
        console.log(`[daily-master-sync] Cleaned up ${staleRuns.length} stale sync runs`);
      }
    } catch (e) {
      console.error(`[daily-master-sync] Stale cleanup error:`, e);
    }

    // ── Compute rolling 7-day window ──
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 6); // 7 days total
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    console.log(`[daily-master-sync] Rolling window: ${startStr} → ${endStr}`);

    // ── Get all active clients ──
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, name, meta_ad_account_id, ghl_api_key, ghl_location_id")
      .in("status", ["active", "onboarding"]);

    if (clientsErr || !clients?.length) {
      console.error(`[daily-master-sync] Failed to fetch clients:`, clientsErr);
      return { success: false, error: "No clients found" };
    }

    console.log(`[daily-master-sync] Processing ${clients.length} clients`);

    // ── Create master sync_run ──
    const { data: masterRun } = await supabase.from("sync_runs").insert({
      function_name: "daily-master-sync",
      started_at: new Date().toISOString(),
      status: "running",
      metadata: { clientCount: clients.length, window: `${startStr}→${endStr}` },
    }).select("id").single();
    const masterRunId = masterRun?.id;

    const results: ClientSyncResult[] = [];

    // ── Per-client sequential pipeline ──
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientStart = Date.now();
      const result: ClientSyncResult = {
        client_id: client.id,
        client_name: client.name,
        meta_ok: false,
        ghl_contacts_ok: false,
        ghl_pipelines_ok: false,
        metrics_recalculated: false,
        errors: [],
        duration_ms: 0,
        rows_written: 0,
      };

      console.log(`[daily-master-sync] (${i + 1}/${clients.length}) ${client.name}`);

      // ── 1. Meta Ads (7-day rolling window) ──
      if (!skipSteps.includes("meta") && client.meta_ad_account_id) {
        const label = `${client.name}/meta`;
        console.log(`[daily-master-sync]   → Meta Ads sync (${startStr}→${endStr})`);
        const res = await callFunction(supabaseUrl, supabaseKey, "sync-meta-ads", {
          clientId: client.id,
          startDate: startStr,
          endDate: endStr,
        }, label);
        result.meta_ok = res.success;
        if (!res.success) {
          result.errors.push(`meta: ${res.error}`);
          console.error(`[daily-master-sync]   ✗ ${label}: ${res.error}`);
        } else {
          result.rows_written += (res.data?.dailyMetrics || 0);
          console.log(`[daily-master-sync]   ✓ ${label}: ${res.data?.campaigns || 0} campaigns, ${res.data?.ads || 0} ads`);
        }
        // Rate-limit pause between Meta and GHL
        await new Promise(r => setTimeout(r, 5000));
      } else if (!client.meta_ad_account_id) {
        // No Meta account — mark as OK (not applicable)
        result.meta_ok = true;
      }

      // ── 2. GHL Contacts (7-day rolling window) ──
      if (!skipSteps.includes("ghl") && client.ghl_api_key && client.ghl_location_id) {
        const label = `${client.name}/ghl-contacts`;
        console.log(`[daily-master-sync]   → GHL contacts sync`);
        const res = await callFunction(supabaseUrl, supabaseKey, "sync-ghl-contacts", {
          client_id: client.id,
          syncType: "contacts",
          sinceDateDays: 7,
        }, label);
        result.ghl_contacts_ok = res.success;
        if (!res.success) {
          result.errors.push(`ghl-contacts: ${res.error}`);
          console.error(`[daily-master-sync]   ✗ ${label}: ${res.error}`);
        } else {
          console.log(`[daily-master-sync]   ✓ ${label}`);
        }

        await new Promise(r => setTimeout(r, 10000));

        // ── 3. GHL Pipelines ──
        const pLabel = `${client.name}/ghl-pipelines`;
        console.log(`[daily-master-sync]   → GHL pipelines sync`);
        const pRes = await callFunction(supabaseUrl, supabaseKey, "sync-ghl-pipelines", {
          client_id: client.id,
        }, pLabel);
        result.ghl_pipelines_ok = pRes.success;
        if (!pRes.success) {
          result.errors.push(`ghl-pipelines: ${pRes.error}`);
          console.error(`[daily-master-sync]   ✗ ${pLabel}: ${pRes.error}`);
        } else {
          console.log(`[daily-master-sync]   ✓ ${pLabel}`);
        }

        await new Promise(r => setTimeout(r, 5000));
      } else if (!client.ghl_api_key || !client.ghl_location_id) {
        // No GHL configured — mark as OK (not applicable)
        result.ghl_contacts_ok = true;
        result.ghl_pipelines_ok = true;
      }

      // ── 4. Recalculate daily metrics ONLY if both Meta AND GHL succeeded ──
      if (!skipSteps.includes("recalculate")) {
        if (result.meta_ok && result.ghl_contacts_ok) {
          const label = `${client.name}/recalculate`;
          console.log(`[daily-master-sync]   → Recalculating metrics (${startStr}→${endStr})`);
          const res = await callFunction(supabaseUrl, supabaseKey, "recalculate-daily-metrics", {
            clientId: client.id,
            startDate: startStr,
            endDate: endStr,
          }, label);
          result.metrics_recalculated = res.success;
          if (!res.success) {
            result.errors.push(`recalculate: ${res.error}`);
          } else {
            console.log(`[daily-master-sync]   ✓ ${label}`);
          }
        } else {
          console.warn(`[daily-master-sync]   ⚠ ${client.name}: Skipping recalculate — upstream sync failed (meta=${result.meta_ok}, ghl=${result.ghl_contacts_ok})`);
          result.errors.push("recalculate: skipped due to upstream failure");
        }
      }

      result.duration_ms = Date.now() - clientStart;
      results.push(result);

      // ── Log per-client sync_run ──
      await supabase.from("sync_runs").insert({
        function_name: "daily-master-sync",
        started_at: new Date(clientStart).toISOString(),
        finished_at: new Date().toISOString(),
        status: result.errors.length === 0 ? "completed" : "partial",
        rows_written: result.rows_written,
        client_id: client.id,
        error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
        metadata: {
          source: "master",
          window: `${startStr}→${endStr}`,
          meta_ok: result.meta_ok,
          ghl_contacts_ok: result.ghl_contacts_ok,
          ghl_pipelines_ok: result.ghl_pipelines_ok,
          metrics_recalculated: result.metrics_recalculated,
        },
      });

      // Inter-client delay (30s) to respect rate limits
      if (i < clients.length - 1) {
        console.log(`[daily-master-sync] Waiting 30s before next client...`);
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    // ── Meta Token Check ──
    if (!skipSteps.includes("token_check")) {
      try {
        const metaToken = Deno.env.get("META_SHARED_ACCESS_TOKEN");
        if (metaToken) {
          const debugRes = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${metaToken}&access_token=${metaToken}`
          );
          const debugData = await debugRes.json();
          const expiresAt = debugData?.data?.expires_at;
          if (expiresAt && expiresAt > 0) {
            const expiryDate = new Date(expiresAt * 1000);
            const daysLeft = Math.round((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            console.log(`[daily-master-sync] Meta token expires in ${daysLeft} days`);
            if (daysLeft <= 7) {
              await createAlertTask(supabase,
                `🔑 Meta token expires in ${daysLeft} days`,
                `META_SHARED_ACCESS_TOKEN expires ${expiryDate.toISOString().split("T")[0]}. Renew immediately.`,
                daysLeft <= 3 ? "urgent" : "high"
              );
            }
          } else if (debugData?.data?.is_valid === false) {
            await createAlertTask(supabase,
              "🚨 Meta token is EXPIRED",
              "META_SHARED_ACCESS_TOKEN is invalid. All Meta syncs are broken.",
              "urgent"
            );
          }
        }
      } catch (err) {
        console.error(`[daily-master-sync] Token check error:`, err);
      }
    }

    // ── Summary ──
    const succeeded = results.filter(r => r.errors.length === 0).length;
    const failed = results.filter(r => r.errors.length > 0).length;
    const totalDuration = results.reduce((s, r) => s + r.duration_ms, 0);
    const totalRows = results.reduce((s, r) => s + r.rows_written, 0);

    console.log(`[daily-master-sync] Pipeline complete: ${succeeded}/${results.length} clients clean, ${failed} with errors, ${Math.round(totalDuration / 1000)}s total`);

    // ── Finalize master sync_run ──
    if (masterRunId) {
      await supabase.from("sync_runs").update({
        finished_at: new Date().toISOString(),
        status: failed === 0 ? "completed" : "partial",
        rows_written: totalRows,
        error_message: failed > 0 ? `${failed}/${results.length} client(s) had errors` : null,
        metadata: {
          source: "master",
          window: `${startStr}→${endStr}`,
          clientCount: results.length,
          succeeded,
          failed,
          clients: results.map(r => ({
            name: r.client_name,
            ok: r.errors.length === 0,
            meta: r.meta_ok,
            ghl: r.ghl_contacts_ok,
            recalc: r.metrics_recalculated,
            errors: r.errors,
          })),
        },
      }).eq("id", masterRunId);
    }

    // Create alert if any clients failed
    if (failed > 0) {
      const failedNames = results.filter(r => r.errors.length > 0).map(r => r.client_name).join(", ");
      await createAlertTask(supabase,
        `⚠️ Daily sync: ${failed} client(s) had errors`,
        `Clients with issues: ${failedNames}. Check sync_runs for details.`,
      );
    }

    return { success: failed === 0, clients: results.length, succeeded, failed, totalDuration_ms: totalDuration };
  };

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doSync());
    return new Response(
      JSON.stringify({ success: true, message: "Daily master sync started (background, per-client)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else {
    const result = await doSync();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
