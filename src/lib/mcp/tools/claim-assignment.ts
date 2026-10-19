import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, UUID } from "./_sb";

export default defineTool({
  name: "claim_assignment",
  title: "Claim assignment",
  description: "For a linked external agent: atomically claim one waiting assignment so no other worker starts it.",
  inputSchema: { delivery_id: z.string().uuid().regex(UUID) },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ delivery_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_agent_claim_assignment", { p_delivery_id: delivery_id });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { content: [{ type: "text", text: "Not found" }], isError: true };
    return { content: [{ type: "text", text: row.claimed ? "Claimed" : `Not claimed (status: ${row.status})` }], structuredContent: { delivery_id: row.delivery_id, status: row.status, claimed: row.claimed } };
  },
});
