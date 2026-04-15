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
    const now = new Date().toISOString();

    // 1) Fix stuck sync_logs
    const { data: stuckLogs } = await supabase
      .from("sync_logs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", cutoff);

    let fixedLogs = 0;
    for (const row of stuckLogs || []) {
      await supabase.from("sync_logs").update({
        status: "failed",
        error_message: `Watchdog: stuck >${STUCK_THRESHOLD_MINUTES}min`,
        completed_at: now,
      }).eq("id", row.id);
      fixedLogs++;
    }

    // 2) Fix stuck sync_queue jobs
    const { data: stuckJobs } = await supabase
      .from("sync_queue")
      .select("id")
      .eq("status", "processing")
      .lt("started_at", cutoff);

    let fixedJobs = 0;
    for (const row of stuckJobs || []) {
      await supabase.from("sync_queue").update({
        status: "failed",
        error_message: `Watchdog: stuck >${STUCK_THRESHOLD_MINUTES}min`,
        completed_at: now,
      }).eq("id", row.id);
      fixedJobs++;
    }

    // 3) Fix stuck outbound log entries
    const { data: stuckOutbound } = await supabase
      .from("ghl_outbound_log")
      .select("id")
      .eq("final_state", "pending")
      .lt("created_at", cutoff);

    let fixedOutbound = 0;
    for (const row of stuckOutbound || []) {
      await supabase.from("ghl_outbound_log").update({
        final_state: "dead_letter",
        error_message: `Watchdog: pending >${STUCK_THRESHOLD_MINUTES}min`,
        completed_at: now,
      }).eq("id", row.id);
      fixedOutbound++;
    }

    const summary = {
      success: true,
      timestamp: now,
      stuck_sync_logs_fixed: fixedLogs,
      stuck_queue_jobs_fixed: fixedJobs,
      stuck_outbound_fixed: fixedOutbound,
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
