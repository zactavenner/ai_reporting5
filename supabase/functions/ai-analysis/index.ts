import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ClientMetrics {
  name?: string;
  status?: string;
  adSpend?: number;
  leads?: number;
  calls?: number;
  showedCalls?: number;
  costPerLead?: number;
  costPerCall?: number;
  fundedInvestors?: number;
  fundedDollars?: number;
  costOfCapital?: number;
}

interface MetricsContext {
  isAgencyLevel?: boolean;
  clientName?: string;
  totalAdSpend?: number;
  leads?: number;
  calls?: number;
  showedCalls?: number;
  costPerLead?: number;
  costPerCall?: number;
  costPerShow?: number;
  fundedInvestors?: number;
  fundedDollars?: number;
  costPerInvestor?: number;
  costOfCapital?: number;
  showedPercent?: number;
  // Agency level
  agencyTotals?: {
    totalAdSpend?: number;
    totalLeads?: number;
    totalCalls?: number;
    showedCalls?: number;
    costPerLead?: number;
    costPerCall?: number;
    fundedInvestors?: number;
    fundedDollars?: number;
    costOfCapital?: number;
  };
  clients?: ClientMetrics[];
}

interface FileContent {
  name: string;
  type: string;
  content: string; // base64
}

function buildSystemPrompt(context: MetricsContext): string {
  if (context.isAgencyLevel) {
    return buildAgencyPrompt(context);
  }
  return buildClientPrompt(context);
}

function buildClientPrompt(context: MetricsContext): string {
  const metrics = [];
  
  if (context.clientName) {
    metrics.push(`Client: ${context.clientName}`);
  }
  if (context.totalAdSpend !== undefined) {
    metrics.push(`Total Ad Spend: $${context.totalAdSpend.toLocaleString()}`);
  }
  if (context.leads !== undefined) {
    metrics.push(`Leads: ${context.leads}`);
  }
  if (context.calls !== undefined) {
    metrics.push(`Calls Booked: ${context.calls}`);
  }
  if (context.showedCalls !== undefined) {
    metrics.push(`Showed Calls: ${context.showedCalls}`);
  }
  if (context.showedPercent !== undefined) {
    metrics.push(`Show Rate: ${context.showedPercent.toFixed(1)}%`);
  }
  if (context.costPerLead !== undefined) {
    metrics.push(`Cost Per Lead: $${context.costPerLead.toFixed(2)}`);
  }
  if (context.costPerCall !== undefined) {
    metrics.push(`Cost Per Call: $${context.costPerCall.toFixed(2)}`);
  }
  if (context.costPerShow !== undefined) {
    metrics.push(`Cost Per Show: $${context.costPerShow.toFixed(2)}`);
  }
  if (context.fundedInvestors !== undefined) {
    metrics.push(`Funded Investors: ${context.fundedInvestors}`);
  }
  if (context.fundedDollars !== undefined) {
    metrics.push(`Funded Amount: $${context.fundedDollars.toLocaleString()}`);
  }
  if (context.costPerInvestor !== undefined) {
    metrics.push(`Cost Per Investor: $${context.costPerInvestor.toFixed(2)}`);
  }
  if (context.costOfCapital !== undefined) {
    metrics.push(`Cost of Capital: ${context.costOfCapital.toFixed(2)}%`);
  }

  return `You are an expert advertising performance analyst helping agencies optimize their client campaigns. You provide actionable insights based on campaign metrics.

Current Performance Metrics:
${metrics.length > 0 ? metrics.join('\n') : 'No metrics data available.'}

Guidelines:
- Be concise and actionable in your responses
- Focus on the most important insights first
- Suggest specific improvements when relevant
- Compare metrics to industry benchmarks when helpful
- If asked about missing data, acknowledge and work with what's available
- Use bullet points for clarity when listing recommendations`;
}

function buildAgencyPrompt(context: MetricsContext): string {
  const { agencyTotals, clients } = context;

  let agencySection = "AGENCY TOTALS:\n";
  if (agencyTotals) {
    agencySection += `- Total Ad Spend: $${agencyTotals.totalAdSpend?.toLocaleString() || 0}
- Total Leads: ${agencyTotals.totalLeads || 0}
- Total Calls: ${agencyTotals.totalCalls || 0}
- Showed Calls: ${agencyTotals.showedCalls || 0}
- Cost Per Lead: $${agencyTotals.costPerLead?.toFixed(2) || 0}
- Cost Per Call: $${agencyTotals.costPerCall?.toFixed(2) || 0}
- Funded Investors: ${agencyTotals.fundedInvestors || 0}
- Funded Amount: $${agencyTotals.fundedDollars?.toLocaleString() || 0}
- Cost of Capital: ${agencyTotals.costOfCapital?.toFixed(2) || 0}%`;
  }

  let clientsSection = "\n\nCLIENT BREAKDOWN:\n";
  if (clients && clients.length > 0) {
    clients.forEach((client, i) => {
      if (client) {
        clientsSection += `
${i + 1}. ${client.name} (${client.status})
   - Ad Spend: $${client.adSpend?.toLocaleString() || 0}
   - Leads: ${client.leads || 0}
   - CPL: $${client.costPerLead?.toFixed(2) || 0}
   - Calls: ${client.calls || 0}
   - Showed: ${client.showedCalls || 0}
   - Cost/Call: $${client.costPerCall?.toFixed(2) || 0}
   - Funded Investors: ${client.fundedInvestors || 0}
   - Funded $: $${client.fundedDollars?.toLocaleString() || 0}
   - CoC: ${client.costOfCapital?.toFixed(2) || 0}%
`;
      }
    });
  }

  return `You are an expert advertising agency performance analyst. You have complete visibility into all client performance data and can compare, analyze, and provide strategic recommendations across the entire portfolio.

${agencySection}
${clientsSection}

ANALYSIS CAPABILITIES:
- Compare performance across all clients
- Identify which clients need immediate attention
- Spot trends and patterns in the data
- Provide budget reallocation recommendations
- Benchmark individual clients against agency averages

Guidelines:
- Be specific about which client you're referring to
- Use data to support your recommendations
- Prioritize actionable insights
- When comparing clients, highlight both top performers and those needing improvement
- Consider the full funnel from leads to funded investors
- Use markdown formatting for clarity (headers, bullets, bold)`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, model, files } = await req.json() as {
      messages: Message[];
      context: MetricsContext;
      model?: 'gemini' | 'openai';
      files?: FileContent[];
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = buildSystemPrompt(context);

    // Select model based on user choice
    const selectedModel = model === 'openai' 
      ? 'openai/gpt-5' 
      : 'google/gemini-3-flash-preview';

    // Build message content with file attachments if present
    let userMessages = messages.map(m => ({ role: m.role, content: m.content }));
    
    // If files are provided, append file info to the last user message
    if (files && files.length > 0) {
      const lastUserMsgIndex = userMessages.findLastIndex(m => m.role === 'user');
      if (lastUserMsgIndex >= 0) {
        let fileContext = "\n\n[Attached files for context:";
        for (const file of files) {
          // For text-based files, try to extract content
          if (file.type.startsWith('text/') || file.type === 'application/pdf') {
            fileContext += `\n- ${file.name} (${file.type})`;
          } else if (file.type.startsWith('image/')) {
            fileContext += `\n- ${file.name} (image attached)`;
          } else if (file.type.startsWith('video/')) {
            fileContext += `\n- ${file.name} (video attached)`;
          } else if (file.type.startsWith('audio/')) {
            fileContext += `\n- ${file.name} (audio/voice message attached)`;
          } else {
            fileContext += `\n- ${file.name} (${file.type})`;
          }
        }
        fileContext += "]";
        userMessages[lastUserMsgIndex].content += fileContext;
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...userMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
