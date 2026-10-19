import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, UUID } from "./_sb";

export default defineTool({
  name: "post_task_update",
  title: "Post task update",
  description: "For a linked external agent: report progress, completion or failure on a claimed assignment, optionally with an https result link.",
  inputSchema: {
    delivery_id: z.string().uuid().regex(UUID),
    event: z.enum(["progress", "completed", "failed"]),
    summary: z.string().min(1).max(4000),
    result_url: z.string().url().startsWith("https://").max(1000).optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ delivery_id, event, summary, result_url }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_post_task_update", { p_delivery_id: delivery_id, p_event: event, p_summary: summary, p_result_url: result_url ?? null });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const row = Array.isArray(data) ? data[0] : null;
    return { content: [{ type: "text", text: `Recorded (${row?.status ?? event})` }], structuredContent: { delivery_id, status: row?.status ?? event } };
  },
});
