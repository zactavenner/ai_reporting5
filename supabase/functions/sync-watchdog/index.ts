import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const STUCK_THRESHOLD_MINUTES = 15;
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // 1) Find stuck sync_logs (status = 'running' for > 15 min)
    const { data: stuckLogs, error: logErr } = await supabase
      .from("sync_logs")
      .select("id, client_id, sync_type, started_at")
      .eq("status", "running")
      .lt("started_at", cutoff);

    if (logErr) throw logErr;

    let fixedLogs = 0;
    if (stuckLogs && stuckLogs.length > 0) {
      const ids = stuckLogs.map((r: any) => r.id);
      const { error: updateErr } = await supabase
        .from("sync_logs")
        .update({
          status: "failed",
          error_message: `Watchdog: stuck running for >${STUCK_THRESHOLD_MINUTES}min, marked failed at ${new Date().toISOString()}`,
          completed_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (updateErr) throw updateErr;
      fixedLogs = ids.length;
    }

    // 2) Find stuck sync_queue jobs (status = 'processing' for > 15 min)
    const { data: stuckJobs, error: jobErr } = await supabase
      .from("sync_queue")
      .select("id, client_id, sync_type, started_at")
      .eq("status", "processing")
      .lt("started_at", cutoff);

    if (jobErr) throw jobErr;

    let fixedJobs = 0;
    if (stuckJobs && stuckJobs.length > 0) {
      const ids = stuckJobs.map((r: any) => r.id);
      const { error: updateErr } = await supabase
        .from("sync_queue")
        .update({
          status: "failed",
          error_message: `Watchdog: stuck processing for >${STUCK_THRESHOLD_MINUTES}min`,
          completed_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (updateErr) throw updateErr;
      fixedJobs = ids.length;
    }

    // 3) Find stuck ghl_outbound_log entries
    const { data: stuckOutbound, error: outErr } = await supabase
      .from("ghl_outbound_log")
      .select("id")
      .eq("final_state", "pending")
      .lt("created_at", cutoff);

    if (outErr) throw outErr;

    let fixedOutbound = 0;
    if (stuckOutbound && stuckOutbound.length > 0) {
      const ids = stuckOutbound.map((r: any) => r.id);
      const { error: updateErr } = await supabase
        .from("ghl_outbound_log")
        .update({
          final_state: "dead_letter",
          error_message: `Watchdog: pending for >${STUCK_THRESHOLD_MINUTES}min without completion`,
          completed_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (updateErr) throw updateErr;
      fixedOutbound = ids.length;
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      stuck_sync_logs_fixed: fixedLogs,
      stuck_queue_jobs_fixed: fixedJobs,
      stuck_outbound_fixed: fixedOutbound,
      stuck_details: {
        sync_logs: (stuckLogs || []).map((r: any) => ({
          id: r.id,
          client_id: r.client_id,
          sync_type: r.sync_type,
          started_at: r.started_at,
        })),
        queue_jobs: (stuckJobs || []).map((r: any) => ({
          id: r.id,
          client_id: r.client_id,
          sync_type: r.sync_type,
          started_at: r.started_at,
        })),
      },
    };

    console.log("[Watchdog] Completed:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Watchdog] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
