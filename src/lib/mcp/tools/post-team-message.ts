import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, UUID } from "./_sb";

export default defineTool({
  name: "post_team_message",
  title: "Post to Agents Team",
  description: "For a linked external agent: post to the shared Agents Team chat. @slug mentions wake that agent, within hop and rate limits.",
  inputSchema: {
    body: z.string().min(1).max(4000),
    task_id: z.string().uuid().regex(UUID).optional(),
    reply_to: z.string().uuid().regex(UUID).optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ body, task_id, reply_to }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_post_team_message", { p_body: body, p_task_id: task_id ?? null, p_reply_to: reply_to ?? null });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: "Posted" }], structuredContent: { message_id: String(data) } };
  },
});
