import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, userId, toolkits, tool_name, tool_args } = await req.json();

    // Get Composio API key from secrets or agency_settings
    let composioKey = Deno.env.get("COMPOSIO_API_KEY");

    if (!composioKey) {
      const supabase = createClient(
        Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: settings } = await supabase
        .from("agency_settings")
        .select("settings")
        .limit(1)
        .single();
      composioKey = (settings?.settings as any)?.composio_api_key;
    }

    if (!composioKey) {
      return new Response(
        JSON.stringify({ error: "COMPOSIO_API_KEY is not configured. Add it in Agency Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // V3 API base
    const COMPOSIO_V3 = "https://backend.composio.dev/api/v3";
    // V1 API base (some endpoints like connectedAccounts still use v1)
    const COMPOSIO_V1 = "https://backend.composio.dev/api/v1";

    const authHeaders = {
      "x-api-key": composioKey,
      "Content-Type": "application/json",
    };

    // Action: create_session — creates a Composio MCP server for a user (v3)
    if (action === "create_session") {
      const sessionUserId = userId || "agency_default";

      // V3: create an MCP server endpoint
      const res = await fetch(`${COMPOSIO_V3}/mcp/server`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          user_id: sessionUserId,
          ...(toolkits ? { apps: toolkits } : {}),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Composio v3 MCP server error:", res.status, errText);

        // If v3 also fails, try the streamable-http MCP endpoint
        if (res.status === 404 || res.status === 410) {
          const fallbackRes = await fetch(`${COMPOSIO_V3}/mcp/streamable-http`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              user_id: sessionUserId,
              ...(toolkits ? { apps: toolkits } : {}),
            }),
          });

          if (!fallbackRes.ok) {
            const fallbackErr = await fallbackRes.text();
            return new Response(
              JSON.stringify({ error: `Composio v3 API error [${fallbackRes.status}]: ${fallbackErr}` }),
              { status: fallbackRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const fallbackData = await fallbackRes.json();
          return new Response(JSON.stringify({ success: true, session: fallbackData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ error: `Composio API error [${res.status}]: ${errText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sessionData = await res.json();
      return new Response(JSON.stringify({ success: true, session: sessionData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list_tools — list available tools/actions (v3)
    if (action === "list_tools") {
      const params = new URLSearchParams({ limit: "100" });
      if (toolkits) params.set("apps", toolkits);

      const res = await fetch(`${COMPOSIO_V3}/actions?${params}`, {
        headers: { "x-api-key": composioKey },
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `Composio API error [${res.status}]: ${errText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tools = await res.json();
      return new Response(JSON.stringify({ success: true, tools }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: execute_tool — execute a specific tool (v3)
    if (action === "execute_tool") {
      if (!tool_name) {
        return new Response(
          JSON.stringify({ error: "tool_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(`${COMPOSIO_V3}/actions/${tool_name}/execute`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          connected_account_id: userId || "agency_default",
          input: tool_args || {},
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `Tool execution error [${res.status}]: ${errText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await res.json();
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list_connections — list connected accounts (v1 — still active)
    if (action === "list_connections") {
      const res = await fetch(`${COMPOSIO_V1}/connectedAccounts?showActiveOnly=true`, {
        headers: { "x-api-key": composioKey },
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `Composio API error [${res.status}]: ${errText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const connections = await res.json();
      return new Response(JSON.stringify({ success: true, connections }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: initiate_connection — start OAuth flow for an app (v1)
    if (action === "initiate_connection") {
      const { app_name, redirect_url } = tool_args || {};
      if (!app_name) {
        return new Response(
          JSON.stringify({ error: "app_name is required in tool_args" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(`${COMPOSIO_V1}/connectedAccounts`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          integrationId: app_name,
          redirectUri: redirect_url || "https://report-bloom-magic.lovable.app",
          userUuid: userId || "agency_default",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `Connection error [${res.status}]: ${errText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const connection = await res.json();
      return new Response(JSON.stringify({ success: true, connection }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Supported: create_session, list_tools, execute_tool, list_connections, initiate_connection` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("composio-mcp-proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
