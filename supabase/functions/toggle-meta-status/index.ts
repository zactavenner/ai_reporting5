// Toggle ACTIVE/PAUSED status for a Meta campaign, ad set, or ad.
// Requires ads_management scope.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_GRAPH_API_VERSION = "v21.0";
const META_GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

type Level = "campaign" | "adset" | "ad";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, level, rowId, status } = await req.json() as {
      clientId: string;
      level: Level;
      rowId: string; // internal DB uuid of the row
      status: "ACTIVE" | "PAUSED";
    };

    if (!clientId || !level || !rowId || !status) {
      throw new Error("clientId, level, rowId, status are required");
    }
    if (!["ACTIVE", "PAUSED"].includes(status)) {
      throw new Error("status must be ACTIVE or PAUSED");
    }
    if (!["campaign", "adset", "ad"].includes(level)) {
      throw new Error("level must be campaign, adset, or ad");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch client Meta credentials
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("meta_access_token, meta_ad_account_id, name")
      .eq("id", clientId)
      .single();
    if (clientErr || !client) throw new Error(`Client not found: ${clientErr?.message || "unknown"}`);

    const accessToken = client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!accessToken) throw new Error("No Meta access token configured for this client");

    // Map level → DB table + Meta node id column
    const tableMap = {
      campaign: { table: "meta_campaigns", metaIdCol: "meta_campaign_id" },
      adset: { table: "meta_ad_sets", metaIdCol: "meta_adset_id" },
      ad: { table: "meta_ads", metaIdCol: "meta_ad_id" },
    } as const;
    const { table, metaIdCol } = tableMap[level];

    const { data: row, error: rowErr } = await supabase
      .from(table)
      .select(`id, ${metaIdCol}, client_id`)
      .eq("id", rowId)
      .single();
    if (rowErr || !row) throw new Error(`Row not found in ${table}: ${rowErr?.message || "unknown"}`);
    const metaNodeId = (row as any)[metaIdCol];
    if (!metaNodeId) throw new Error(`Row missing ${metaIdCol} — cannot push to Meta`);

    // Push to Meta
    const body = new URLSearchParams({ status, access_token: accessToken });
    const metaRes = await fetch(`${META_GRAPH_API_URL}/${metaNodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      throw new Error(`Meta API error (${metaRes.status}): ${JSON.stringify(metaData)}`);
    }

    // Optimistically update local cache so UI reflects immediately
    await supabase
      .from(table)
      .update({ status, effective_status: status, updated_at: new Date().toISOString() })
      .eq("id", rowId);

    return new Response(
      JSON.stringify({ success: true, level, metaNodeId, status, metaResponse: metaData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("toggle-meta-status error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});