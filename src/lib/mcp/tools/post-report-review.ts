import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, UUID } from "./_sb";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default defineTool({
  name: "post_report_review",
  title: "Post report review",
  description:
    "For a linked external agent: post a review of a client's report for a date range, shown under 'What needs attention'. Base every item on numbers from get_client_report. This adds notes only — it never changes source data.",
  inputSchema: {
    client_id: z.string().uuid().regex(UUID),
    from: z.string().regex(YMD),
    to: z.string().regex(YMD),
    summary: z.string().max(4000).optional(),
    items: z.array(z.object({
      tone: z.enum(["alert", "watch", "good"]),
      title: z.string().min(1).max(200),
      detail: z.string().max(1000).default(""),
    })).min(1).max(12),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ client_id, from, to, summary, items }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_post_report_review", {
      p_client_id: client_id, p_from: from, p_to: to, p_summary: summary ?? null, p_items: items,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Review posted (${data})` }], structuredContent: { review_id: data } };
  },
});
