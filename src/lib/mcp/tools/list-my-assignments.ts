import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb } from "./_sb";

export default defineTool({
  name: "list_my_assignments",
  title: "List my assignments",
  description: "For a linked external agent: list tasks and chat mentions waiting for you or in progress. Empty access for anyone else.",
  inputSchema: { limit: z.number().int().min(1).max(100).default(25).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_list_assignments", { p_limit: limit ?? 25 });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }], structuredContent: { assignments: data ?? [] } };
  },
});
