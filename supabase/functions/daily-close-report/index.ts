import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined;

interface ClientReport {
  client_id: string;
  client_name: string;
  leads: number;
  calls: number;
  showed: number;
  funded: number;
  funded_dollars: number;
  ad_spend: number;
  leads_delta: number;
  calls_delta: number;
  showed_delta: number;
  sync_status: "healthy" | "stale" | "error" | "not_configured";
  last_sync_at: string | null;
  discrepancies: Array<{
    metric: string;
    expected: number;
    actual: number;
    fixed: boolean;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let reportDate: string | null = null;
  try {
    const body = await req.json();
    reportDate = body.reportDate || null;
  } catch {}

  // Default to yesterday
  if (!reportDate) {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    reportDate = yesterday.toISOString().split("T")[0];
  }

  // Previous day for delta comparison
  const prevDate = new Date(reportDate + "T00:00:00Z");
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateStr = prevDate.toISOString().split("T")[0];

  console.log(`[daily-close-report] Generating report for ${reportDate} (comparing vs ${prevDateStr})`);

  const doReport = async () => {
    try {
      // 1. Fetch all active clients
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, last_ghl_sync_at, ghl_sync_status, ghl_location_id")
        .order("name");

      if (clientsError || !clients) {
        throw new Error(`Failed to fetch clients: ${clientsError?.message}`);
      }

      // 2. Fetch daily_metrics for report date and previous date
      const { data: todayMetrics } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("date", reportDate);

      const { data: prevMetrics } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("date", prevDateStr);

      // Build lookup maps
      const todayMap = new Map<string, any>();
      (todayMetrics || []).forEach((m: any) => todayMap.set(m.client_id, m));
      const prevMap = new Map<string, any>();
      (prevMetrics || []).forEach((m: any) => prevMap.set(m.client_id, m));

      // 3. Verify daily_metrics against source tables for accuracy
      // Count leads per client for the report date
      const { data: leadCounts } = await supabase.rpc("exec_sql", {
        query: `
          SELECT client_id, COUNT(*) as cnt
          FROM leads
          WHERE created_at::date = '${reportDate}'
            AND (is_spam IS NULL OR is_spam = false)
          GROUP BY client_id
        `,
      }).catch(() => ({ data: null }));

      // If RPC not available, fall back to individual queries
      const sourceLeadMap = new Map<string, number>();
      const sourceCallMap = new Map<string, number>();
      const sourceShowedMap = new Map<string, number>();
      const sourceFundedMap = new Map<string, number>();

      if (leadCounts && Array.isArray(leadCounts)) {
        leadCounts.forEach((r: any) => sourceLeadMap.set(r.client_id, parseInt(r.cnt)));
      } else {
        // Fallback: query source tables directly per client
        for (const client of clients) {
          const { count: leadCount } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("created_at", reportDate + "T00:00:00Z")
            .lt("created_at", reportDate + "T23:59:59.999Z")
            .or("is_spam.is.null,is_spam.eq.false");
          sourceLeadMap.set(client.id, leadCount || 0);

          const { count: callCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("booked_at", reportDate + "T00:00:00Z")
            .lt("booked_at", reportDate + "T23:59:59.999Z")
            .or("is_reconnect.is.null,is_reconnect.eq.false");
          sourceCallMap.set(client.id, callCount || 0);

          const { count: showedCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("client_id", client.id)
            .eq("showed", true)
            .gte("booked_at", reportDate + "T00:00:00Z")
            .lt("booked_at", reportDate + "T23:59:59.999Z")
            .or("is_reconnect.is.null,is_reconnect.eq.false");
          sourceShowedMap.set(client.id, showedCount || 0);

          const { count: fundedCount } = await supabase
            .from("funded_investors")
            .select("*", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("funded_at", reportDate + "T00:00:00Z")
            .lt("funded_at", reportDate + "T23:59:59.999Z");
          sourceFundedMap.set(client.id, fundedCount || 0);
        }
      }

      // 4. Build per-client reports and fix discrepancies
      const clientDetails: ClientReport[] = [];
      let totalDiscrepancies = 0;
      let totalFixed = 0;
      let clientsWithIssues = 0;
      let healthyCt = 0, staleCt = 0, errorCt = 0, notConfiguredCt = 0;

      // Agency totals
      let agLeads = 0, agCalls = 0, agShowed = 0, agFunded = 0, agSpend = 0, agFundedDollars = 0;
      let agLeadsDelta = 0, agCallsDelta = 0, agShowedDelta = 0, agFundedDelta = 0, agSpendDelta = 0;

      for (const client of clients) {
        const dm = todayMap.get(client.id);
        const prev = prevMap.get(client.id);

        // Determine sync status
        let syncStatus: "healthy" | "stale" | "error" | "not_configured" = "not_configured";
        if (!client.ghl_location_id) {
          syncStatus = "not_configured";
          notConfiguredCt++;
        } else if (client.ghl_sync_status === "error") {
          syncStatus = "error";
          errorCt++;
        } else if (client.last_ghl_sync_at) {
          const hoursSinceSync = (Date.now() - new Date(client.last_ghl_sync_at).getTime()) / (1000 * 60 * 60);
          if (hoursSinceSync > 24) {
            syncStatus = "stale";
            staleCt++;
          } else {
            syncStatus = "healthy";
            healthyCt++;
          }
        } else {
          syncStatus = "stale";
          staleCt++;
        }

        // Metrics from daily_metrics
        const dmLeads = dm?.leads || 0;
        const dmCalls = dm?.calls || 0;
        const dmShowed = dm?.showed_calls || 0;
        const dmFunded = dm?.funded_investors || 0;
        const dmSpend = parseFloat(dm?.ad_spend || "0");
        const dmFundedDollars = parseFloat(dm?.funded_dollars || "0");

        // Previous day
        const prevLeads = prev?.leads || 0;
        const prevCalls = prev?.calls || 0;
        const prevShowed = prev?.showed_calls || 0;

        // Source counts
        const srcLeads = sourceLeadMap.get(client.id) || 0;
        const srcCalls = sourceCallMap.get(client.id) || 0;
        const srcShowed = sourceShowedMap.get(client.id) || 0;
        const srcFunded = sourceFundedMap.get(client.id) || 0;

        // Find discrepancies
        const discrepancies: ClientReport["discrepancies"] = [];

        if (dmLeads !== srcLeads) {
          discrepancies.push({ metric: "leads", expected: srcLeads, actual: dmLeads, fixed: false });
        }
        if (dmCalls !== srcCalls) {
          discrepancies.push({ metric: "calls", expected: srcCalls, actual: dmCalls, fixed: false });
        }
        if (dmShowed !== srcShowed) {
          discrepancies.push({ metric: "showed", expected: srcShowed, actual: dmShowed, fixed: false });
        }
        if (dmFunded !== srcFunded) {
          discrepancies.push({ metric: "funded", expected: srcFunded, actual: dmFunded, fixed: false });
        }

        // Auto-fix discrepancies by updating daily_metrics
        if (discrepancies.length > 0) {
          clientsWithIssues++;
          totalDiscrepancies += discrepancies.length;

          const updatePayload: Record<string, any> = {};
          for (const d of discrepancies) {
            if (d.metric === "leads") updatePayload.leads = d.expected;
            if (d.metric === "calls") updatePayload.calls = d.expected;
            if (d.metric === "showed") updatePayload.showed_calls = d.expected;
            if (d.metric === "funded") updatePayload.funded_investors = d.expected;
          }

          if (dm) {
            // Update existing row
            const { error: updateErr } = await supabase
              .from("daily_metrics")
              .update(updatePayload)
              .eq("client_id", client.id)
              .eq("date", reportDate);

            if (!updateErr) {
              discrepancies.forEach((d) => (d.fixed = true));
              totalFixed += discrepancies.length;
            } else {
              console.error(`[daily-close] Failed to fix metrics for ${client.name}:`, updateErr);
            }
          } else if (srcLeads > 0 || srcCalls > 0 || srcFunded > 0) {
            // Insert new row if source data exists but no daily_metrics row
            const { error: insertErr } = await supabase.from("daily_metrics").insert({
              client_id: client.id,
              date: reportDate,
              leads: srcLeads,
              calls: srcCalls,
              showed_calls: srcShowed,
              funded_investors: srcFunded,
              ad_spend: 0,
            });

            if (!insertErr) {
              discrepancies.forEach((d) => (d.fixed = true));
              totalFixed += discrepancies.length;
            }
          }

          // Log to sync_accuracy_log
          for (const d of discrepancies) {
            await supabase.from("sync_accuracy_log").insert({
              client_id: client.id,
              check_date: reportDate,
              metric_type: d.metric,
              expected_count: d.expected,
              actual_count: d.actual,
              discrepancy: d.expected - d.actual,
              auto_fixed: d.fixed,
            }).catch(() => {});
          }
        }

        // Use source-corrected values for totals
        const finalLeads = discrepancies.find((d) => d.metric === "leads") ? srcLeads : dmLeads;
        const finalCalls = discrepancies.find((d) => d.metric === "calls") ? srcCalls : dmCalls;
        const finalShowed = discrepancies.find((d) => d.metric === "showed") ? srcShowed : dmShowed;
        const finalFunded = discrepancies.find((d) => d.metric === "funded") ? srcFunded : dmFunded;

        const leadsDelta = finalLeads - prevLeads;
        const callsDelta = finalCalls - prevCalls;
        const showedDelta = finalShowed - prevShowed;

        clientDetails.push({
          client_id: client.id,
          client_name: client.name,
          leads: finalLeads,
          calls: finalCalls,
          showed: finalShowed,
          funded: finalFunded,
          funded_dollars: dmFundedDollars,
          ad_spend: dmSpend,
          leads_delta: leadsDelta,
          calls_delta: callsDelta,
          showed_delta: showedDelta,
          sync_status: syncStatus,
          last_sync_at: client.last_ghl_sync_at,
          discrepancies,
        });

        // Agency totals
        agLeads += finalLeads;
        agCalls += finalCalls;
        agShowed += finalShowed;
        agFunded += finalFunded;
        agSpend += dmSpend;
        agFundedDollars += dmFundedDollars;
        agLeadsDelta += leadsDelta;
        agCallsDelta += callsDelta;
        agShowedDelta += showedDelta;
      }

      // Previous day funded delta
      const { count: prevFundedTotal } = await supabase
        .from("funded_investors")
        .select("*", { count: "exact", head: true })
        .gte("funded_at", prevDateStr + "T00:00:00Z")
        .lt("funded_at", prevDateStr + "T23:59:59.999Z");
      const agFundedDelta = agFunded - (prevFundedTotal || 0);

      // Previous day ad spend delta
      const prevTotalSpend = Array.from(prevMap.values()).reduce(
        (sum: number, m: any) => sum + parseFloat(m?.ad_spend || "0"),
        0
      );
      const agSpendDelta = agSpend - prevTotalSpend;

      // 5. Save the report
      const duration = Date.now() - startedAt;
      const { data: report, error: reportErr } = await supabase
        .from("daily_reports")
        .upsert(
          {
            report_date: reportDate,
            status: "completed",
            total_clients: clients.length,
            total_leads: agLeads,
            total_calls: agCalls,
            total_showed: agShowed,
            total_funded: agFunded,
            total_ad_spend: agSpend,
            total_funded_dollars: agFundedDollars,
            leads_delta: agLeadsDelta,
            calls_delta: agCallsDelta,
            showed_delta: agShowedDelta,
            funded_delta: agFundedDelta,
            ad_spend_delta: agSpendDelta,
            discrepancies_found: totalDiscrepancies,
            discrepancies_fixed: totalFixed,
            clients_with_issues: clientsWithIssues,
            client_details: clientDetails,
            healthy_clients: healthyCt,
            stale_clients: staleCt,
            error_clients: errorCt,
            not_configured_clients: notConfiguredCt,
            started_at: new Date(startedAt).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: duration,
          },
          { onConflict: "report_date" }
        )
        .select()
        .single();

      if (reportErr) {
        console.error("[daily-close-report] Failed to save report:", reportErr);
      }

      // 6. Send Slack notification
      const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
      if (slackWebhookUrl) {
        try {
          const accuracyEmoji = totalDiscrepancies === 0 ? ":white_check_mark:" : `:warning: ${totalDiscrepancies} fixed`;
          const syncEmoji = errorCt > 0 ? `:x: ${errorCt} errors` : staleCt > 0 ? `:hourglass: ${staleCt} stale` : ":white_check_mark: All healthy";

          const deltaStr = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "0" : `${n}`);
          const moneyStr = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

          // Build top performers list (by leads)
          const topClients = [...clientDetails]
            .filter((c) => c.leads > 0)
            .sort((a, b) => b.leads - a.leads)
            .slice(0, 5);

          const topPerformersText = topClients
            .map((c, i) => `${i + 1}. *${c.client_name}*: ${c.leads} leads, ${c.calls} calls, ${c.showed} showed`)
            .join("\n");

          const slackPayload = {
            blocks: [
              {
                type: "header",
                text: { type: "plain_text", text: `Daily Report — ${reportDate}`, emoji: true },
              },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Leads:* ${agLeads} (${deltaStr(agLeadsDelta)})` },
                  { type: "mrkdwn", text: `*Calls:* ${agCalls} (${deltaStr(agCallsDelta)})` },
                  { type: "mrkdwn", text: `*Showed:* ${agShowed} (${deltaStr(agShowedDelta)})` },
                  { type: "mrkdwn", text: `*Funded:* ${agFunded} (${deltaStr(agFundedDelta)})` },
                  { type: "mrkdwn", text: `*Ad Spend:* ${moneyStr(agSpend)} (${agSpendDelta >= 0 ? "+" : ""}${moneyStr(agSpendDelta)})` },
                  { type: "mrkdwn", text: `*Funded $:* ${moneyStr(agFundedDollars)}` },
                ],
              },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Accuracy:* ${accuracyEmoji}` },
                  { type: "mrkdwn", text: `*Sync Health:* ${syncEmoji}` },
                ],
              },
              ...(topPerformersText
                ? [
                    { type: "divider" },
                    {
                      type: "section",
                      text: { type: "mrkdwn", text: `*Top Performers:*\n${topPerformersText}` },
                    },
                  ]
                : []),
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `${clients.length} clients | ${healthyCt} healthy, ${staleCt} stale, ${errorCt} errors | Generated in ${Math.round(duration / 1000)}s`,
                  },
                ],
              },
            ],
          };

          const slackRes = await fetch(slackWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackPayload),
          });

          if (slackRes.ok) {
            // Mark slack as sent
            if (report?.id) {
              await supabase
                .from("daily_reports")
                .update({ slack_sent: true, slack_sent_at: new Date().toISOString() })
                .eq("id", report.id);
            }
            console.log("[daily-close-report] Slack notification sent successfully");
          } else {
            console.error("[daily-close-report] Slack send failed:", slackRes.status, await slackRes.text());
          }
        } catch (slackErr) {
          console.error("[daily-close-report] Slack notification error:", slackErr);
        }
      } else {
        console.log("[daily-close-report] SLACK_WEBHOOK_URL not configured, skipping notification");
      }

      console.log(
        `[daily-close-report] Report complete for ${reportDate}: ` +
          `${agLeads} leads, ${agCalls} calls, ${agShowed} showed, ${agFunded} funded, ` +
          `$${agSpend.toFixed(0)} spend, ${totalDiscrepancies} discrepancies (${totalFixed} fixed), ` +
          `${healthyCt}/${clients.length} healthy in ${Math.round(duration / 1000)}s`
      );

      return {
        success: true,
        reportDate,
        totals: {
          leads: agLeads,
          calls: agCalls,
          showed: agShowed,
          funded: agFunded,
          ad_spend: agSpend,
          funded_dollars: agFundedDollars,
        },
        deltas: {
          leads: agLeadsDelta,
          calls: agCallsDelta,
          showed: agShowedDelta,
          funded: agFundedDelta,
          ad_spend: agSpendDelta,
        },
        accuracy: {
          discrepancies_found: totalDiscrepancies,
          discrepancies_fixed: totalFixed,
          clients_with_issues: clientsWithIssues,
        },
        sync_health: {
          healthy: healthyCt,
          stale: staleCt,
          error: errorCt,
          not_configured: notConfiguredCt,
        },
        duration_ms: duration,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[daily-close-report] Fatal error:", errorMsg);

      // Save failed report
      await supabase
        .from("daily_reports")
        .upsert(
          {
            report_date: reportDate,
            status: "failed",
            client_details: [],
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
          },
          { onConflict: "report_date" }
        )
        .catch(() => {});

      return { success: false, error: errorMsg };
    }
  };

  // Run in background for scheduled calls
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(doReport());
    return new Response(
      JSON.stringify({ success: true, message: `Daily close report for ${reportDate} started (background)` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } else {
    const result = await doReport();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
