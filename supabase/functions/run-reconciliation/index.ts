import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Create a new run
    const { data: run, error: runErr } = await supabase
      .from("reconciliation_runs")
      .insert({
        run_date: new Date().toISOString().split("T")[0],
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runErr) throw runErr;

    // Get all active clients
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, name")
      .eq("status", "active");

    if (clientErr) throw clientErr;

    let totalChecks = 0;
    let mismatchesFound = 0;
    const items: any[] = [];

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    for (const client of clients || []) {
      // --- Check 1: Leads count ---
      const { count: dbLeadCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("created_at", thirtyDaysAgo)
        .lte("created_at", today + "T23:59:59Z");

      const { data: dmLeadRows } = await supabase
        .from("daily_metrics")
        .select("leads")
        .eq("client_id", client.id)
        .gte("date", thirtyDaysAgo)
        .lte("date", today);

      const dashLeads = (dmLeadRows || []).reduce(
        (s: number, r: any) => s + (r.leads || 0),
        0
      );
      const srcLeads = dbLeadCount || 0;
      const leadDelta = Math.abs(dashLeads - srcLeads);
      const leadPct = srcLeads > 0 ? (leadDelta / srcLeads) * 100 : 0;

      totalChecks++;
      const leadMismatch = leadPct > 5 && leadDelta > 2;
      if (leadMismatch) mismatchesFound++;
      items.push({
        run_id: run.id,
        client_id: client.id,
        metric_name: "Leads (30d)",
        source_name: "leads_table",
        dashboard_value: dashLeads,
        source_value: srcLeads,
        delta: leadDelta,
        delta_percent: Number(leadPct.toFixed(2)),
        is_mismatch: leadMismatch,
      });

      // --- Check 2: Calls count ---
      const { count: dbCallCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("booked_at", thirtyDaysAgo)
        .lte("booked_at", today + "T23:59:59Z");

      const { data: dmCallRows } = await supabase
        .from("daily_metrics")
        .select("calls")
        .eq("client_id", client.id)
        .gte("date", thirtyDaysAgo)
        .lte("date", today);

      const dashCalls = (dmCallRows || []).reduce(
        (s: number, r: any) => s + (r.calls || 0),
        0
      );
      const srcCalls = dbCallCount || 0;
      const callDelta = Math.abs(dashCalls - srcCalls);
      const callPct = srcCalls > 0 ? (callDelta / srcCalls) * 100 : 0;

      totalChecks++;
      const callMismatch = callPct > 5 && callDelta > 2;
      if (callMismatch) mismatchesFound++;
      items.push({
        run_id: run.id,
        client_id: client.id,
        metric_name: "Calls (30d)",
        source_name: "calls_table",
        dashboard_value: dashCalls,
        source_value: srcCalls,
        delta: callDelta,
        delta_percent: Number(callPct.toFixed(2)),
        is_mismatch: callMismatch,
      });

      // --- Check 3: Funded investors count ---
      const { count: dbFundedCount } = await supabase
        .from("funded_investors")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("funded_at", thirtyDaysAgo)
        .lte("funded_at", today + "T23:59:59Z");

      const { data: dmFundedRows } = await supabase
        .from("daily_metrics")
        .select("funded_investors")
        .eq("client_id", client.id)
        .gte("date", thirtyDaysAgo)
        .lte("date", today);

      const dashFunded = (dmFundedRows || []).reduce(
        (s: number, r: any) => s + (r.funded_investors || 0),
        0
      );
      const srcFunded = dbFundedCount || 0;
      const fundedDelta = Math.abs(dashFunded - srcFunded);
      const fundedPct = srcFunded > 0 ? (fundedDelta / srcFunded) * 100 : 0;

      totalChecks++;
      const fundedMismatch = fundedPct > 5 && fundedDelta > 1;
      if (fundedMismatch) mismatchesFound++;
      items.push({
        run_id: run.id,
        client_id: client.id,
        metric_name: "Funded Investors (30d)",
        source_name: "funded_investors_table",
        dashboard_value: dashFunded,
        source_value: srcFunded,
        delta: fundedDelta,
        delta_percent: Number(fundedPct.toFixed(2)),
        is_mismatch: fundedMismatch,
      });

      // --- Check 4: Ad Spend ---
      const { data: dmSpendRows } = await supabase
        .from("daily_metrics")
        .select("ad_spend")
        .eq("client_id", client.id)
        .gte("date", thirtyDaysAgo)
        .lte("date", today);

      const { data: adSpendRows } = await supabase
        .from("ad_spend_reports")
        .select("spend")
        .eq("client_id", client.id)
        .gte("reported_at", thirtyDaysAgo)
        .lte("reported_at", today);

      const dashSpend = (dmSpendRows || []).reduce(
        (s: number, r: any) => s + (r.ad_spend || 0),
        0
      );
      const srcSpend = (adSpendRows || []).reduce(
        (s: number, r: any) => s + (r.spend || 0),
        0
      );
      // Only compare if there's actual spend data
      if (dashSpend > 0 || srcSpend > 0) {
        const spendDelta = Math.abs(dashSpend - srcSpend);
        const spendMax = Math.max(dashSpend, srcSpend, 1);
        const spendPct = (spendDelta / spendMax) * 100;

        totalChecks++;
        const spendMismatch = spendPct > 5 && spendDelta > 50;
        if (spendMismatch) mismatchesFound++;
        items.push({
          run_id: run.id,
          client_id: client.id,
          metric_name: "Ad Spend (30d)",
          source_name: "ad_spend_reports",
          dashboard_value: Number(dashSpend.toFixed(2)),
          source_value: Number(srcSpend.toFixed(2)),
          delta: Number(spendDelta.toFixed(2)),
          delta_percent: Number(spendPct.toFixed(2)),
          is_mismatch: spendMismatch,
        });
      }
    }

    // Insert items
    if (items.length > 0) {
      const { error: itemErr } = await supabase
        .from("reconciliation_items")
        .insert(items);
      if (itemErr) throw itemErr;
    }

    // Update run status
    await supabase
      .from("reconciliation_runs")
      .update({
        status: "completed",
        total_checks: totalChecks,
        mismatches_found: mismatchesFound,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return new Response(
      JSON.stringify({
        success: true,
        runId: run.id,
        totalChecks,
        mismatchesFound,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Reconciliation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
