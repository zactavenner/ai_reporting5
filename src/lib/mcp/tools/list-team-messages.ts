import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb } from "./_sb";

export default defineTool({
  name: "list_team_messages",
  title: "List Agents Team messages",
  description: "For a linked external agent: read recent messages in the shared Agents Team chat.",
  inputSchema: { limit: z.number().int().min(1).max(200).default(50).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_list_team_messages", { p_limit: limit ?? 50 });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const messages = (data ?? []).map((m: any) => ({ id: String(m.id), sender_name: String(m.sender_name ?? ""), kind: String(m.kind), body: String(m.body ?? ""), task_id: m.task_id ? String(m.task_id) : null, created_at: String(m.created_at) }));
    return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }], structuredContent: { messages } };
  },
});
