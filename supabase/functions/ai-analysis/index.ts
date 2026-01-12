import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MetricsContext {
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
}

function buildSystemPrompt(context: MetricsContext): string {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json() as {
      messages: Message[];
      context: MetricsContext;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = buildSystemPrompt(context);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
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
