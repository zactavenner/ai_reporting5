import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { UUID } from "./_sb";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default defineTool({
  name: "get_client_report",
  title: "Get client report facts",
  description:
    "For a linked external agent: verified, PII-free report facts for one active client and date range (spend, verified leads, CPL, booked, shows, commitments, funded, daily rows, creatives, system flags) plus existing review notes. null means unavailable, never zero. Read this before posting a review.",
  inputSchema: {
    client_id: z.string().uuid().regex(UUID),
    from: z.string().regex(YMD).describe("Start date yyyy-mm-dd (client timezone)"),
    to: z.string().regex(YMD).describe("End date yyyy-mm-dd, inclusive"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id, from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const resp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/client-report-review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.getToken()}`, apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "facts", client_id, from, to }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { content: [{ type: "text", text: data?.error || `Failed (${resp.status})` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
  },
});
