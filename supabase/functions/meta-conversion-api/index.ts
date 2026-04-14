import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_GRAPH_API_VERSION = "v21.0";
const META_CAPI_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

async function hashValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface CAPIEvent {
  event_name: string;
  event_time: number;
  event_source_url?: string;
  action_source: "system_generated";
  user_data: {
    em?: string[]; ph?: string[]; fn?: string[]; ln?: string[];
    external_id?: string[]; client_ip_address?: string; fbc?: string; fbp?: string;
  };
  custom_data?: {
    value?: number; currency?: string; content_name?: string;
    content_category?: string; status?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { clientId, leadId, eventName, eventData } = body;

    if (!clientId || !eventName) {
      return new Response(JSON.stringify({ success: false, error: "clientId and eventName required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("client_settings")
      .select("meta_pixel_id, meta_conversion_api_token, meta_conversion_api_enabled")
      .eq("client_id", clientId).maybeSingle();

    if (!settings?.meta_conversion_api_enabled || !settings.meta_pixel_id || !settings.meta_conversion_api_token) {
      await supabase.from("capi_events").insert({
        client_id: clientId, lead_id: leadId || null, event_name: eventName,
        status: "skipped", error_message: "CAPI not enabled or missing pixel_id/token",
      });
      return new Response(JSON.stringify({ success: true, status: "skipped", reason: "CAPI not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userData: CAPIEvent["user_data"] = { external_id: [] };
    if (leadId) {
      const { data: lead } = await supabase
        .from("leads").select("id, email, phone, name, external_id")
        .eq("id", leadId).maybeSingle();

      if (lead) {
        if (lead.email) userData.em = [await hashValue(lead.email)];
        if (lead.phone) userData.ph = [await hashValue(lead.phone.replace(/\D/g, ""))];
        if (lead.name) {
          const parts = lead.name.trim().split(/\s+/);
          if (parts.length > 0) userData.fn = [await hashValue(parts[0])];
          if (parts.length > 1) userData.ln = [await hashValue(parts[parts.length - 1])];
        }
        userData.external_id = [await hashValue(lead.external_id || lead.id)];
      }
    }

    const capiEvent: CAPIEvent = {
      event_name: eventName,
      event_time: Math.floor((eventData?.event_time ? new Date(eventData.event_time).getTime() : Date.now()) / 1000),
      event_source_url: eventData?.source_url || undefined,
      action_source: "system_generated",
      user_data: userData,
    };

    if (eventName === "Purchase" && eventData?.value) {
      capiEvent.custom_data = { value: Number(eventData.value), currency: "USD", content_name: eventData.content_name || "Investment Fund", status: "funded" };
    } else if (eventName === "Lead") {
      capiEvent.custom_data = { content_category: "capital_raising_lead", content_name: eventData?.source || "Meta Ad" };
    } else if (eventName === "Schedule") {
      capiEvent.custom_data = { content_category: "call_booked", status: "scheduled" };
    }

    const pixelId = settings.meta_pixel_id;
    const accessToken = settings.meta_conversion_api_token;
    const url = `${META_CAPI_URL}/${pixelId}/events`;

    console.log(`[meta-capi] Sending ${eventName} event for client ${clientId}, lead ${leadId || "N/A"}`);

    const response = await fetch(`${url}?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [capiEvent] }),
    });

    const responseBody = await response.json();

    await supabase.from("capi_events").insert({
      client_id: clientId, lead_id: leadId || null, event_name: eventName,
      event_time: new Date(capiEvent.event_time * 1000).toISOString(),
      event_source_url: capiEvent.event_source_url,
      user_data: { fields_sent: Object.keys(userData).filter(k => (userData as any)[k]?.length > 0) },
      custom_data: capiEvent.custom_data || {},
      meta_response_code: response.status, meta_response_body: responseBody,
      sent_at: new Date().toISOString(),
      status: response.ok ? "sent" : "failed",
      error_message: response.ok ? null : JSON.stringify(responseBody).substring(0, 500),
    });

    if (!response.ok) {
      console.error(`[meta-capi] Meta API error ${response.status}:`, responseBody);
      return new Response(JSON.stringify({ success: false, error: `Meta API returned ${response.status}`, details: responseBody }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[meta-capi] Successfully sent ${eventName} event. Events received: ${responseBody.events_received || 0}`);
    return new Response(JSON.stringify({ success: true, status: "sent", events_received: responseBody.events_received }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[meta-capi] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
