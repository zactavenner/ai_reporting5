import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");
  const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SLACK_SIGNING_SECRET) throw new Error("SLACK_SIGNING_SECRET not configured");
  if (!SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN not configured");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const rawBody = await req.text();

  // --- Verify Slack signature ---
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const slackSig = req.headers.get("x-slack-signature") || "";

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return new Response("Request too old", { status: 403 });
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac("sha256", SLACK_SIGNING_SECRET);
  hmac.update(sigBase);
  const expectedSig = `v0=${hmac.digest("hex")}`;

  if (expectedSig !== slackSig) {
    console.error("Slack signature mismatch");
    return new Response("Invalid signature", { status: 403 });
  }

  const body = JSON.parse(rawBody);

  // --- Handle URL verification challenge ---
  if (body.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Handle events ---
  if (body.type === "event_callback") {
    const event = body.event;

    // Ignore bot messages to prevent loops
    if (event.bot_id || event.subtype === "bot_message") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // Only handle app_mention events
    if (event.type === "app_mention") {
      const processingPromise = handleMention(event, {
        SLACK_BOT_TOKEN,
        LOVABLE_API_KEY,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      });

      processingPromise.catch((err) =>
        console.error("Error processing mention:", err)
      );

      return new Response("ok", { status: 200, headers: corsHeaders });
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});

// -------------------------------------------------------------------
// Core handler for @HPA mentions
// -------------------------------------------------------------------
interface Env {
  SLACK_BOT_TOKEN: string;
  LOVABLE_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

async function handleMention(event: any, env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const userText = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const slackUserId = event.user;

  // Post a thinking indicator
  const thinkingMsg = await postSlackMessage(env.SLACK_BOT_TOKEN, channelId, threadTs, "🤔 Thinking...");

  // Look up which client this channel belongs to (if any)
  const { data: settingsRows } = await supabase
    .from("client_settings")
    .select("client_id")
    .or(`slack_channel_id.eq.${channelId},slack_review_channel_id.eq.${channelId}`)
    .limit(1);

  const scopedClientId = settingsRows?.[0]?.client_id || null;

  // Look up the Slack user's identity
  const slackUser = await getSlackUserInfo(env.SLACK_BOT_TOKEN, slackUserId);
  const userEmail = slackUser?.profile?.email || null;
  const userName = slackUser?.real_name || slackUser?.name || "User";

  // Check if this is an agency member
  let agencyMember: any = null;
  if (userEmail) {
    const { data: member } = await supabase
      .from("agency_members")
      .select("id, name, role")
      .eq("email", userEmail)
      .maybeSingle();
    agencyMember = member;
  }

  const isAgencyUser = !!agencyMember;

  // Determine intent
  const intent = await detectIntent(userText, env.LOVABLE_API_KEY);

  switch (intent.action) {
    case "create_task":
      await handleCreateTask(supabase, env, channelId, threadTs, scopedClientId, userText, event, userName, thinkingMsg?.ts);
      break;
    case "list_tasks":
      await handleListTasks(supabase, env, channelId, threadTs, scopedClientId, userName, isAgencyUser, thinkingMsg?.ts);
      break;
    default:
      // Full AI-powered response with rich context
      await handleAIQuery(supabase, env, channelId, threadTs, scopedClientId, userText, userName, isAgencyUser, agencyMember, thinkingMsg?.ts);
      break;
  }
}

// -------------------------------------------------------------------
// Intent detection
// -------------------------------------------------------------------
async function detectIntent(text: string, apiKey: string): Promise<{ action: string }> {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are an intent classifier. Given a user message, determine the intent.
Return ONLY one of: create_task, list_tasks, analytics_query
- create_task: user wants to create a task, request, or action item
- list_tasks: user wants to see their tasks, open items, or to-do list
- analytics_query: user wants to know about metrics, KPIs, ad spend, leads, calls, performance, comparisons, or anything data/analytics related, OR any general question or conversation`,
        },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_intent",
            description: "Classify the user's intent",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["create_task", "list_tasks", "analytics_query"],
                },
              },
              required: ["action"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_intent" } },
    }),
  });

  if (!response.ok) {
    console.error("Intent detection failed:", await response.text());
    return { action: "analytics_query" };
  }

  const data = await response.json();
  try {
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      return JSON.parse(toolCall.function.arguments);
    }
  } catch {
    // fallback
  }
  return { action: "analytics_query" };
}

// -------------------------------------------------------------------
// BUILD FULL CONTEXT: Gathers all data for AI (mirrors ai-agent-full-context)
// -------------------------------------------------------------------
async function buildFullContext(supabase: any, scopedClientId: string | null, isAgencyUser: boolean): Promise<string> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  // Build client query — agency users see all, client users see only their client
  const clientQuery = supabase.from("clients").select("id, name, status, industry, slug");
  if (!isAgencyUser && scopedClientId) {
    clientQuery.eq("id", scopedClientId);
  }

  const [
    { data: clients },
    { data: dailyMetrics },
    { data: leads },
    { data: calls },
    { data: fundedInvestors },
    { data: tasks },
    { data: meetings },
    { data: briefs },
  ] = await Promise.all([
    clientQuery,
    supabase
      .from("daily_metrics")
      .select("client_id, date, ad_spend, leads, calls, showed_calls, funded_investors, funded_dollars, spam_leads, commitment_dollars, commitments, reconnect_calls, reconnect_showed, clicks, impressions")
      .gte("date", thirtyDaysAgoStr),
    supabase
      .from("leads")
      .select("id, client_id, source, status, is_spam, created_at, name, utm_source, utm_campaign, opportunity_value")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("calls")
      .select("id, client_id, showed, outcome, scheduled_at, contact_name, is_reconnect, appointment_status")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .limit(500),
    supabase
      .from("funded_investors")
      .select("id, client_id, name, funded_amount, funded_at, commitment_amount, source, time_to_fund_days, calls_to_fund")
      .order("funded_at", { ascending: false })
      .limit(300),
    supabase
      .from("tasks")
      .select("id, client_id, title, status, priority, due_date, stage, assigned_client_name")
      .in("status", ["todo", "in_progress"]),
    supabase
      .from("agency_meetings")
      .select("id, client_id, title, meeting_date, summary, duration_minutes, action_items")
      .gte("meeting_date", thirtyDaysAgo.toISOString())
      .order("meeting_date", { ascending: false })
      .limit(50),
    supabase
      .from("creative_briefs")
      .select("id, client_id, client_name, status, hook_patterns, offer_angles, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const clientList = clients || [];
  const clientDataBlocks: string[] = [];

  for (const client of clientList) {
    const cId = client.id;
    const cMetrics = (dailyMetrics || []).filter((m: any) => m.client_id === cId);
    const cLeads = (leads || []).filter((l: any) => l.client_id === cId);
    const cCalls = (calls || []).filter((c: any) => c.client_id === cId);
    const cFunded = (fundedInvestors || []).filter((f: any) => f.client_id === cId);
    const cTasks = (tasks || []).filter((t: any) => t.client_id === cId);
    const cMeetings = (meetings || []).filter((m: any) => m.client_id === cId);
    const cBriefs = (briefs || []).filter((b: any) => b.client_id === cId);

    const totalAdSpend = cMetrics.reduce((s: number, m: any) => s + (m.ad_spend || 0), 0);
    const totalLeads = cMetrics.reduce((s: number, m: any) => s + (m.leads || 0), 0);
    const totalCalls = cMetrics.reduce((s: number, m: any) => s + (m.calls || 0), 0);
    const totalShowed = cMetrics.reduce((s: number, m: any) => s + (m.showed_calls || 0), 0);
    const totalFundedCount = cMetrics.reduce((s: number, m: any) => s + (m.funded_investors || 0), 0);
    const totalFundedDollars = cMetrics.reduce((s: number, m: any) => s + (m.funded_dollars || 0), 0);
    const totalSpam = cMetrics.reduce((s: number, m: any) => s + (m.spam_leads || 0), 0);
    const totalClicks = cMetrics.reduce((s: number, m: any) => s + (m.clicks || 0), 0);
    const totalImpressions = cMetrics.reduce((s: number, m: any) => s + (m.impressions || 0), 0);
    const cpl = totalLeads > 0 ? totalAdSpend / totalLeads : 0;
    const cpc = totalCalls > 0 ? totalAdSpend / totalCalls : 0;
    const costOfCapital = totalFundedDollars > 0 ? (totalAdSpend / totalFundedDollars) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Lead sources breakdown
    const sourceMap: Record<string, number> = {};
    cLeads.forEach((l: any) => {
      const src = l.utm_source || l.source || "unknown";
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const openTasks = cTasks.filter((t: any) => t.status !== "done");
    const overdueTasks = openTasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date());

    let block = `\n## ${client.name} (${client.status})${client.industry ? ` | ${client.industry}` : ""}
*30-Day Metrics:*
- Ad Spend: $${totalAdSpend.toLocaleString()} | Leads: ${totalLeads} (${totalSpam} spam) | CPL: $${cpl.toFixed(2)}
- Calls: ${totalCalls} | Shows: ${totalShowed} (${totalCalls > 0 ? ((totalShowed / totalCalls) * 100).toFixed(1) : 0}%) | CPC: $${cpc.toFixed(2)}
- CTR: ${ctr.toFixed(2)}% | Clicks: ${totalClicks} | Impressions: ${totalImpressions.toLocaleString()}
- Funded: ${totalFundedCount} investors, $${totalFundedDollars.toLocaleString()} | Cost of Capital: ${costOfCapital.toFixed(2)}%`;

    if (Object.keys(sourceMap).length > 0) {
      block += `\n*Lead Sources:* ${Object.entries(sourceMap).map(([s, c]) => `${s}: ${c}`).join(", ")}`;
    }

    if (cFunded.length > 0) {
      const recentFunded = cFunded.slice(0, 5);
      block += `\n*Recent Funded:* ${recentFunded.map((f: any) => `${f.name || "Unknown"} ($${(f.funded_amount || 0).toLocaleString()}, ${f.time_to_fund_days || "?"} days)`).join("; ")}`;
    }

    if (openTasks.length > 0) {
      block += `\n*Open Tasks:* ${openTasks.length} (${overdueTasks.length} overdue)`;
      const topTasks = openTasks.slice(0, 3);
      block += ` — ${topTasks.map((t: any) => `"${t.title}" [${t.priority}]`).join(", ")}`;
    }

    if (cMeetings.length > 0) {
      block += `\n*Recent Meetings:* ${cMeetings.slice(0, 3).map((m: any) => `${m.title} (${m.meeting_date?.split("T")[0] || "?"})`).join(", ")}`;
    }

    if (cBriefs.length > 0) {
      block += `\n*Creative Briefs:* ${cBriefs.length} (${cBriefs.filter((b: any) => b.status === "pending").length} pending)`;
    }

    clientDataBlocks.push(block);
  }

  return `Today: ${new Date().toISOString().split("T")[0]}
Total Clients: ${clientList.length} (${clientList.filter((c: any) => c.status === "active").length} active)

# Full Portfolio Data (Last 30 Days)
${clientDataBlocks.join("\n")}`;
}

// -------------------------------------------------------------------
// AI QUERY: Full AI response with complete analytics context
// -------------------------------------------------------------------
async function handleAIQuery(
  supabase: any, env: Env, channel: string, thread: string,
  scopedClientId: string | null, userText: string, userName: string,
  isAgencyUser: boolean, agencyMember: any, thinkingTs?: string
) {
  try {
    const context = await buildFullContext(supabase, scopedClientId, isAgencyUser);

    const scopeLabel = scopedClientId ? "this client's" : "all clients'";
    const roleDesc = isAgencyUser
      ? `You are HPA, an expert agency performance analyst and task manager for ${agencyMember?.name || userName}. You have COMPLETE access to ${scopeLabel} data across the portfolio. You can answer any question about ad performance, leads, calls, funded investors, tasks, meetings, creative briefs, and more.`
      : `You are HPA, a performance assistant. You have access to ${scopeLabel} data. Answer questions about their metrics, tasks, and campaign performance.`;

    const systemPrompt = `${roleDesc}

${context}

---
RULES:
- Use Slack markdown: *bold*, _italic_, \`code\`
- Be concise but thorough. Reference exact numbers.
- Compare clients when relevant (agency users only).
- Flag concerning trends proactively.
- If asked about creating tasks, tell them to say "@HPA create task: [description]"
- If asked about listing tasks, tell them to say "@HPA show tasks"
- Always sign off responses with relevant emoji
- Keep responses under 3000 characters for Slack readability`;

    const aiResponse = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
        "❌ Sorry, I couldn't process your question right now. Please try again.");
      return;
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices?.[0]?.message?.content || "I couldn't generate an answer.";

    await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs, answer);
  } catch (err) {
    console.error("handleAIQuery error:", err);
    await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
      "❌ An error occurred while processing your request. Please try again.");
  }
}

// -------------------------------------------------------------------
// CREATE TASK: AI generates structured task, creates it, replies
// -------------------------------------------------------------------
async function handleCreateTask(
  supabase: any, env: Env, channel: string, thread: string,
  scopedClientId: string | null, userText: string, event: any, userName: string, thinkingTs?: string
) {
  // If no client is scoped, try to figure out which client from text
  let clientId = scopedClientId;
  let clientName = "Unknown";

  if (clientId) {
    const { data: client } = await supabase
      .from("clients").select("name").eq("id", clientId).single();
    clientName = client?.name || "Unknown";
  } else {
    // Agency user in non-client channel — ask AI to detect client from message
    const { data: allClients } = await supabase
      .from("clients").select("id, name").eq("status", "active");
    
    if (allClients && allClients.length > 0) {
      const clientNames = allClients.map((c: any) => `${c.name} (${c.id})`).join(", ");
      const detectResponse = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Given the user message and list of clients, determine which client this task is for. If unclear, return "unknown".
Clients: ${clientNames}`,
            },
            { role: "user", content: userText },
          ],
          tools: [{
            type: "function",
            function: {
              name: "identify_client",
              parameters: {
                type: "object",
                properties: {
                  client_id: { type: "string", description: "The UUID of the client, or 'unknown'" },
                  client_name: { type: "string" },
                },
                required: ["client_id", "client_name"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "identify_client" } },
        }),
      });

      if (detectResponse.ok) {
        const detectData = await detectResponse.json();
        try {
          const tc = detectData.choices?.[0]?.message?.tool_calls?.[0];
          if (tc) {
            const parsed = JSON.parse(tc.function.arguments);
            if (parsed.client_id && parsed.client_id !== "unknown") {
              clientId = parsed.client_id;
              clientName = parsed.client_name || "Unknown";
            }
          }
        } catch { /* fallback */ }
      }
    }

    if (!clientId) {
      await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
        "⚠️ I couldn't determine which client this task is for. Please mention the client name in your request, or use this command in a client-specific channel.");
      return;
    }
  }

  const links = extractLinks(userText);
  const images = extractImages(event);

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a task creation assistant for ${clientName}. Given a message, generate a structured task.
- Create a clear, actionable title (max 80 chars)
- Write a detailed description that captures the full request
- Include any links or URLs mentioned
- Set appropriate priority (low/medium/high/urgent) based on urgency cues
- If images are attached, mention them in the description`,
        },
        {
          role: "user",
          content: `Create a task from this request:\n\n"${userText}"${
            links.length > 0 ? `\n\nLinks found: ${links.join(", ")}` : ""
          }${images.length > 0 ? `\n\nImages attached: ${images.length} file(s)` : ""}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "create_task",
          description: "Create a structured task from the user's request",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            },
            required: ["title", "description", "priority"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "create_task" } },
    }),
  });

  if (!response.ok) {
    console.error("AI task generation failed:", await response.text());
    await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
      "❌ Sorry, I couldn't generate the task. Please try again.");
    return;
  }

  const data = await response.json();
  let taskData = { title: userText.slice(0, 80), description: userText, priority: "medium" };

  try {
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      taskData = JSON.parse(toolCall.function.arguments);
    }
  } catch { /* use defaults */ }

  let fullDescription = taskData.description;
  if (links.length > 0) {
    fullDescription += `\n\n🔗 Links:\n${links.map((l) => `- ${l}`).join("\n")}`;
  }
  if (images.length > 0) {
    fullDescription += `\n\n🖼️ Attached images:\n${images.map((img) => `- ${img}`).join("\n")}`;
  }

  const { data: newTask, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      title: taskData.title,
      description: fullDescription,
      client_id: clientId,
      priority: taskData.priority,
      stage: "client_tasks",
      status: "todo",
      visible_to_client: true,
      created_by: `Slack (${userName})`,
    })
    .select()
    .single();

  if (taskErr) {
    console.error("Failed to create task:", taskErr);
    await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
      "❌ Failed to create the task. Please try again or contact your agency.");
    return;
  }

  // Add a comment
  await supabase.from("task_comments").insert({
    task_id: newTask.id,
    author_name: `${userName} (via Slack)`,
    content: userText,
    comment_type: "text",
  });

  const appUrl = Deno.env.get("APP_URL") || "https://funding-sonar.lovable.app";
  const taskLink = `${appUrl}/client/${clientId}?task=${newTask.id}`;

  const readback = [
    `✅ *Task Created for ${clientName}!*`,
    ``,
    `📋 *Title:* ${newTask.title}`,
    `📝 *Description:* ${taskData.description}`,
    `🎯 *Priority:* ${taskData.priority.charAt(0).toUpperCase() + taskData.priority.slice(1)}`,
    `📌 *Stage:* Client Tasks`,
    `👤 *Created by:* ${userName}`,
    `🔗 <${taskLink}|View Task in Dashboard>`,
  ].join("\n");

  await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs, readback);
}

// -------------------------------------------------------------------
// LIST TASKS
// -------------------------------------------------------------------
async function handleListTasks(
  supabase: any, env: Env, channel: string, thread: string,
  scopedClientId: string | null, userName: string, isAgencyUser: boolean, thinkingTs?: string
) {
  let query = supabase
    .from("tasks")
    .select("id, title, stage, priority, due_date, client_id, assigned_to")
    .neq("stage", "done")
    .is("parent_task_id", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (scopedClientId) {
    query = query.eq("client_id", scopedClientId);
  }

  const { data: tasks } = await query;

  if (!tasks || tasks.length === 0) {
    const scope = scopedClientId ? "this client" : "any client";
    await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs,
      `📋 No open tasks for ${scope} right now. Type \`@HPA create task: [your request]\` to create one!`);
    return;
  }

  // Get client names for agency view
  let clientNames: Record<string, string> = {};
  if (!scopedClientId) {
    const clientIds = [...new Set(tasks.map((t: any) => t.client_id).filter(Boolean))];
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients").select("id, name").in("id", clientIds);
      for (const c of clients || []) {
        clientNames[c.id] = c.name;
      }
    }
  }

  const appUrl = Deno.env.get("APP_URL") || "https://funding-sonar.lovable.app";
  const stageEmoji: Record<string, string> = {
    client_tasks: "📥",
    todo: "📝",
    in_progress: "🔧",
    stuck: "🚨",
    review: "👀",
    revisions: "🔄",
  };

  const lines = tasks.map((t: any) => {
    const emoji = stageEmoji[t.stage] || "📌";
    const due = t.due_date ? ` · Due: ${t.due_date}` : "";
    const clientLabel = !scopedClientId && clientNames[t.client_id] ? ` · ${clientNames[t.client_id]}` : "";
    const link = `<${appUrl}/client/${t.client_id}?task=${t.id}|${t.title}>`;
    return `${emoji} ${link} [${t.priority}]${clientLabel}${due}`;
  });

  const scopeLabel = scopedClientId ? "" : " (All Clients)";
  const message = [
    `📋 *Open Tasks${scopeLabel}* (${tasks.length})`,
    ``,
    ...lines,
    ``,
    `_Type \`@HPA create task: [request]\` to add a new task_`,
  ].join("\n");

  await updateOrPostMessage(env.SLACK_BOT_TOKEN, channel, thread, thinkingTs, message);
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Update the "thinking" message with the real answer, or post new if no thinking msg */
async function updateOrPostMessage(token: string, channel: string, threadTs: string, thinkingTs?: string, text?: string) {
  if (thinkingTs) {
    // Update the thinking message with the real answer
    const res = await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        ts: thinkingTs,
        text: text || "",
        unfurl_links: false,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Failed to update Slack message:", data.error);
      // Fallback: post new message
      return postSlackMessage(token, channel, threadTs, text || "");
    }
    return data;
  }
  return postSlackMessage(token, channel, threadTs, text || "");
}

async function postSlackMessage(token: string, channel: string, threadTs: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Failed to post Slack message:", data.error);
  }
  return data;
}

async function getSlackUserInfo(token: string, userId: string): Promise<any> {
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.ok ? data.user : null;
  } catch (err) {
    console.error("Failed to get Slack user info:", err);
    return null;
  }
}

function extractLinks(text: string): string[] {
  const linkRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function extractImages(event: any): string[] {
  const images: string[] = [];
  if (event.files) {
    for (const file of event.files) {
      if (file.mimetype?.startsWith("image/") && file.url_private) {
        images.push(file.url_private);
      }
    }
  }
  return images;
}
