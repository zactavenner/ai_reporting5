import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  const SUPABASE_URL = Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!LOVABLE_API_KEY || !SLACK_API_KEY) {
    return new Response(JSON.stringify({ error: "Slack not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { report, member_name } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get reporting channel from agency_settings
    const { data: settings } = await supabase
      .from("agency_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();

    const channelId = (settings?.settings as any)?.daily_report_channel_id;
    if (!channelId) {
      return new Response(JSON.stringify({ ok: true, message: "No reporting channel configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSOD = report.report_type === "sod";
    const emoji = isSOD ? "🌅" : "🌙";
    const typeLabel = isSOD ? "Start of Day" : "End of Day";

    // Build task snapshot section
    const tasks = (report.tasks_snapshot || []) as Array<{
      task_id: string;
      title: string;
      client_name?: string;
      status: string;
      blocker_reason?: string;
      blocker_next_step?: string;
    }>;

    let taskLines = "";
    const completed = tasks.filter((t) => t.status === "completed");
    const inProgress = tasks.filter((t) => t.status === "in_progress");
    const blocked = tasks.filter((t) => t.status === "blocked");

    if (completed.length > 0) {
      taskLines += "\n✅ *Completed:*\n" + completed.map((t) => `  • ${t.title}${t.client_name ? ` (${t.client_name})` : ""}`).join("\n");
    }
    if (inProgress.length > 0) {
      taskLines += "\n🔄 *In Progress:*\n" + inProgress.map((t) => `  • ${t.title}${t.client_name ? ` (${t.client_name})` : ""}`).join("\n");
    }
    if (blocked.length > 0) {
      taskLines += "\n🚫 *Blocked:*\n" + blocked.map((t) => `  • ${t.title}${t.client_name ? ` (${t.client_name})` : ""}${t.blocker_reason ? `\n    ↳ Reason: ${t.blocker_reason}` : ""}${t.blocker_next_step ? `\n    ↳ Next step: ${t.blocker_next_step}` : ""}`).join("\n");
    }

    // Build priorities section for SOD
    let prioritiesSection = "";
    if (isSOD && report.top_priorities?.length > 0) {
      const priorityTasks = tasks.filter((t: any) => report.top_priorities.includes(t.task_id));
      if (priorityTasks.length > 0) {
        prioritiesSection = "\n\n🎯 *Top Priorities:*\n" + priorityTasks.map((t, i) => `  ${i + 1}. ${t.title}${t.client_name ? ` (${t.client_name})` : ""}`).join("\n");
      }
    }

    // Build additional fields
    let extras = "";
    if (report.touchpoint_count != null) {
      extras += `\n📞 Client Touchpoints: ${report.touchpoint_count}`;
      if (report.touchpoint_notes) extras += ` — ${report.touchpoint_notes}`;
    }
    if (report.client_experience_done != null) {
      extras += `\n${report.client_experience_done ? "✅" : "❌"} 3-Touch Rule Executed`;
    }
    if (report.wins_shared) {
      extras += `\n🏆 *Wins:* ${report.wins_shared}`;
    }
    if (report.self_assessment != null) {
      extras += `\n📊 Self-Assessment: ${report.self_assessment}/10`;
    }

    const message = `${emoji} *${typeLabel} Report — ${member_name}*\n📅 ${report.report_date}${prioritiesSection}${taskLines}${extras ? "\n" + extras : ""}`;

    const res = await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
        unfurl_links: false,
      }),
    });

    const result = await res.json();

    return new Response(JSON.stringify({ ok: result.ok, channel: channelId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("slack-daily-report error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
