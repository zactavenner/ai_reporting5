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

  // Reject requests older than 5 minutes
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
      // Process async - respond immediately to Slack (3s timeout)
      const processingPromise = handleMention(event, {
        SLACK_BOT_TOKEN,
        LOVABLE_API_KEY,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      });

      // Use waitUntil pattern - respond fast, process in background
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

  // Look up which client this channel belongs to
  const { data: settingsRows } = await supabase
    .from("client_settings")
    .select("client_id")
    .or(`slack_channel_id.eq.${channelId},slack_review_channel_id.eq.${channelId}`)
    .limit(1);

  const clientId = settingsRows?.[0]?.client_id;
  if (!clientId) {
    await postSlackMessage(env.SLACK_BOT_TOKEN, channelId, threadTs,
      "⚠️ This channel isn't linked to a client. Ask your agency to configure the Slack channel in client settings.");
    return;
  }

  // Get client info
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .single();

  const clientName = client?.name || "Unknown";

  // Determine intent via AI
  const intent = await detectIntent(userText, env.LOVABLE_API_KEY);

  switch (intent.action) {
    case "create_task":
      await handleCreateTask(supabase, env, channelId, threadTs, clientId, clientName, userText, event);
      break;
    case "list_tasks":
      await handleListTasks(supabase, env, channelId, threadTs, clientId, clientName);
      break;
    case "client_data":
      await handleClientData(supabase, env, channelId, threadTs, clientId, clientName, userText);
      break;
    default:
      await handleGeneral(supabase, env, channelId, threadTs, clientId, clientName, userText);
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
Return ONLY one of: create_task, list_tasks, client_data, general
- create_task: user wants to create a task, request, or action item
- list_tasks: user wants to see their tasks, open items, or to-do list
- client_data: user wants to know about their metrics, KPIs, ad spend, leads, calls, etc.
- general: anything else (greeting, question, etc.)`,
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
                  enum: ["create_task", "list_tasks", "client_data", "general"],
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
    return { action: "general" };
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
  return { action: "general" };
}

// -------------------------------------------------------------------
// CREATE TASK: AI generates structured task, creates it, reads it back
// -------------------------------------------------------------------
async function handleCreateTask(
  supabase: any, env: Env, channel: string, thread: string,
  clientId: string, clientName: string, userText: string, event: any
) {
  // Extract links and images from the Slack message
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
          content: `You are a task creation assistant for ${clientName}. Given a message from a client, generate a structured task.
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
      tools: [
        {
          type: "function",
          function: {
            name: "create_task",
            description: "Create a structured task from the user's request",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Clear, actionable task title" },
                description: { type: "string", description: "Detailed task description" },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              },
              required: ["title", "description", "priority"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_task" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI task generation failed:", errText);
    await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread,
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
  } catch {
    // use defaults
  }

  // Append links and images to description
  let fullDescription = taskData.description;
  if (links.length > 0) {
    fullDescription += `\n\n🔗 Links:\n${links.map((l) => `- ${l}`).join("\n")}`;
  }
  if (images.length > 0) {
    fullDescription += `\n\n🖼️ Attached images:\n${images.map((img) => `- ${img}`).join("\n")}`;
  }

  // Create the task in the database
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
      created_by: "Slack Bot",
    })
    .select()
    .single();

  if (taskErr) {
    console.error("Failed to create task:", taskErr);
    await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread,
      "❌ Failed to create the task. Please try again or contact your agency.");
    return;
  }

  // Add a comment with the original Slack message
  await supabase.from("task_comments").insert({
    task_id: newTask.id,
    author_name: "Client (via Slack)",
    content: userText,
    comment_type: "text",
  });

  // Build the task link
  const appUrl = Deno.env.get("APP_URL") || "https://funding-sonar.lovable.app";
  const taskLink = `${appUrl}/client/${clientId}?task=${newTask.id}`;

  // Read back the created task
  const readback = [
    `✅ *Task Created!*`,
    ``,
    `📋 *Title:* ${newTask.title}`,
    `📝 *Description:* ${taskData.description}`,
    `🎯 *Priority:* ${taskData.priority.charAt(0).toUpperCase() + taskData.priority.slice(1)}`,
    `📌 *Stage:* Client Tasks`,
    `🔗 <${taskLink}|View Task in Dashboard>`,
  ].join("\n");

  await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread, readback);
}

// -------------------------------------------------------------------
// LIST TASKS: Show open tasks for this client
// -------------------------------------------------------------------
async function handleListTasks(
  supabase: any, env: Env, channel: string, thread: string,
  clientId: string, clientName: string
) {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, stage, priority, due_date, assigned_to")
    .eq("client_id", clientId)
    .neq("stage", "done")
    .is("parent_task_id", null)
    .order("created_at", { ascending: false })
    .limit(15);

  if (!tasks || tasks.length === 0) {
    await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread,
      `📋 No open tasks for *${clientName}* right now. Type \`@HPA create task: [your request]\` to create one!`);
    return;
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
    const link = `<${appUrl}/client/${clientId}?task=${t.id}|${t.title}>`;
    return `${emoji} ${link} [${t.priority}]${due}`;
  });

  const message = [
    `📋 *Open Tasks for ${clientName}* (${tasks.length})`,
    ``,
    ...lines,
    ``,
    `_Type \`@HPA create task: [request]\` to add a new task_`,
  ].join("\n");

  await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread, message);
}

// -------------------------------------------------------------------
// CLIENT DATA: Query metrics scoped to this client only
// -------------------------------------------------------------------
async function handleClientData(
  supabase: any, env: Env, channel: string, thread: string,
  clientId: string, clientName: string, userText: string
) {
  // Fetch recent metrics for this client
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: metrics } = await supabase
    .from("daily_metrics")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  // Fetch client settings for context
  const { data: settings } = await supabase
    .from("client_settings")
    .select("monthly_ad_spend_target, total_raise_amount, funded_investor_label")
    .eq("client_id", clientId)
    .maybeSingle();

  // Summarize metrics
  const totals = (metrics || []).reduce(
    (acc: any, m: any) => ({
      ad_spend: acc.ad_spend + (m.ad_spend || 0),
      leads: acc.leads + (m.leads || 0),
      calls: acc.calls + (m.calls || 0),
      showed: acc.showed + (m.calls_showed || 0),
      funded: acc.funded + (m.funded_investors || 0),
      funded_dollars: acc.funded_dollars + (m.funded_dollars || 0),
    }),
    { ad_spend: 0, leads: 0, calls: 0, showed: 0, funded: 0, funded_dollars: 0 }
  );

  const metricsContext = `
Client: ${clientName}
Last 30 days metrics:
- Ad Spend: $${totals.ad_spend.toLocaleString()}
- Leads: ${totals.leads}
- Calls Booked: ${totals.calls}
- Showed: ${totals.showed}
- ${settings?.funded_investor_label || "Funded Investors"}: ${totals.funded}
- Funded Amount: $${totals.funded_dollars.toLocaleString()}
- Cost Per Lead: $${totals.leads > 0 ? (totals.ad_spend / totals.leads).toFixed(2) : "N/A"}
- Cost Per Call: $${totals.calls > 0 ? (totals.ad_spend / totals.calls).toFixed(2) : "N/A"}
- Monthly Ad Spend Target: $${(settings?.monthly_ad_spend_target || 0).toLocaleString()}
- Total Raise Amount: $${(settings?.total_raise_amount || 0).toLocaleString()}`;

  // Use AI to answer the specific question
  const aiResponse = await fetch(AI_GATEWAY, {
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
          content: `You are a data analyst for ${clientName}. Answer the user's question using ONLY the provided metrics. Be concise and use Slack markdown formatting (*bold*, etc.). Never reveal data from other clients. If you don't have the data to answer, say so.

${metricsContext}`,
        },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!aiResponse.ok) {
    await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread,
      "❌ Sorry, I couldn't pull your data right now. Please try again.");
    return;
  }

  const aiData = await aiResponse.json();
  const answer = aiData.choices?.[0]?.message?.content || "I couldn't generate an answer.";

  await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread, answer);
}

// -------------------------------------------------------------------
// GENERAL: Conversational response
// -------------------------------------------------------------------
async function handleGeneral(
  supabase: any, env: Env, channel: string, thread: string,
  clientId: string, clientName: string, userText: string
) {
  const message = [
    `👋 Hey! I'm the HPA bot for *${clientName}*. Here's what I can do:`,
    ``,
    `📋 *Create a task:* \`@HPA create task: [your request]\``,
    `📝 *See your tasks:* \`@HPA show tasks\` or \`@HPA my tasks\``,
    `📊 *Ask about your data:* \`@HPA how many leads this month?\``,
    ``,
    `_Just @ mention me with what you need!_`,
  ].join("\n");

  await postSlackMessage(env.SLACK_BOT_TOKEN, channel, thread, message);
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
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
