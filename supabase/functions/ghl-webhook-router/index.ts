import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Webhook router for GHL events.
 * Receives normalized GHL webhooks, then in parallel:
 *   1. Creates a touchpoint via record-touchpoint (for attribution)
 *   2. Fires a Meta Conversion API event via meta-conversion-api (for ad optimization)
 *
 * GHL webhook URL pattern (configure in GHL → Settings → Webhooks):
 *   POST {SUPABASE_URL}/functions/v1/ghl-webhook-router?clientId={uuid}
 *
 * Supported GHL event types (passed in body.type):
 *   - ContactCreate           → touchpoint(form_submit) + CAPI(Lead)
 *   - AppointmentCreate       → touchpoint(call_booked) + CAPI(Schedule)
 *   - AppointmentUpdate       → touchpoint(call_showed) + CAPI(CompleteRegistration)  [if showed]
 *   - OpportunityStageChange  → touchpoint(funded) + CAPI(Purchase)  [if stage matches funded pattern]
 */

// Map GHL event types to internal touchpoint types + CAPI event names
const EVENT_MAP: Record<string, { touchpoint: string; capi: string | null }> = {
  ContactCreate: { touchpoint: "form_submit", capi: "Lead" },
  AppointmentCreate: { touchpoint: "call_booked", capi: "Schedule" },
  AppointmentUpdate: { touchpoint: "call_showed", capi: "CompleteRegistration" },
  OpportunityStageChange: { touchpoint: "funded", capi: "Purchase" },
  // Fallback for raw GHL webhook types
  contact_create: { touchpoint: "form_submit", capi: "Lead" },
  appointment_create: { touchpoint: "call_booked", capi: "Schedule" },
  appointment_update: { touchpoint: "call_showed", capi: "CompleteRegistration" },
  opportunity_status_update: { touchpoint: "funded", capi: "Purchase" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Client ID from query param (configured per-client in GHL webhook URL)
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      return new Response(JSON.stringify({ success: false, error: "clientId query param required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const eventType = body.type || body.event_type || body.eventType;
    const mapping = EVENT_MAP[eventType];

    if (!mapping) {
      console.log(`[ghl-webhook-router] Unknown event type: ${eventType} — logging only`);
      // Still log unknown events for debugging
      await supabase.from("sync_warnings").insert({
        client_id: clientId,
        warning_type: "unknown_ghl_event",
        message: `Received unknown GHL event type: ${eventType}`,
        metadata: { event: body },
      });
      return new Response(JSON.stringify({ success: true, status: "ignored", eventType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract common fields (GHL payloads vary; handle multiple shapes)
    const contact = body.contact || body;
    const email = contact.email || body.email;
    const phone = contact.phone || body.phone;
    const ghlContactId = contact.id || contact.contactId || body.contactId;

    // Build payloads
    let touchpointType = mapping.touchpoint;
    let capiEventName = mapping.capi;
    let capiEventData: Record<string, any> = {};
    let touchpointMetadata: Record<string, any> = {
      ghl_event_type: eventType,
      ghl_contact_id: ghlContactId,
    };

    // Special handling per event type
    if (eventType === "AppointmentUpdate" || eventType === "appointment_update") {
      // Only fire showed event if the appointment was actually marked showed
      const showed = body.showed === true || body.appointmentStatus === "showed" || body.status === "showed";
      if (!showed) {
        console.log(`[ghl-webhook-router] AppointmentUpdate without showed=true — skipping`);
        return new Response(JSON.stringify({ success: true, status: "skipped", reason: "not showed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      touchpointMetadata.appointment_id = body.appointmentId || body.id;
    }

    if (eventType === "OpportunityStageChange" || eventType === "opportunity_status_update") {
      // Only fire funded event if the new stage matches a funded pattern
      const newStage = (body.stageName || body.opportunityStage || body.newStage || "").toLowerCase();
      const fundedPatterns = ["funded", "won", "closed-won", "invested", "closed won"];
      const isFunded = fundedPatterns.some(p => newStage.includes(p));
      if (!isFunded) {
        console.log(`[ghl-webhook-router] OpportunityStageChange to "${newStage}" — not a funded stage`);
        return new Response(JSON.stringify({ success: true, status: "skipped", reason: "not funded stage" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Pull the dollar value from the opportunity
      const fundedAmount = Number(body.monetaryValue || body.opportunityValue || body.value || 0);
      capiEventData.value = fundedAmount;
      capiEventData.content_name = "Investment Fund";
      touchpointMetadata.value = fundedAmount;
      touchpointMetadata.opportunity_id = body.opportunityId || body.id;
      touchpointMetadata.stage_name = newStage;
    }

    // Fire touchpoint + CAPI in parallel
    const touchpointPromise = fetch(`${supabaseUrl}/functions/v1/record-touchpoint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        clientId,
        email,
        phone,
        touchpointType,
        utmSource: contact.attributionSource?.utmSource,
        utmMedium: contact.attributionSource?.utmMedium,
        utmCampaign: contact.attributionSource?.utmCampaign,
        utmContent: contact.attributionSource?.utmContent,
        metadata: touchpointMetadata,
      }),
    }).then(r => r.json()).catch(err => ({ error: err.message }));

    const capiPromise = capiEventName
      ? fetch(`${supabaseUrl}/functions/v1/meta-conversion-api`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            clientId,
            eventName: capiEventName,
            eventData: capiEventData,
          }),
        }).then(r => r.json()).catch(err => ({ error: err.message }))
      : Promise.resolve({ skipped: true });

    const [touchpointResult, capiResult] = await Promise.all([touchpointPromise, capiPromise]);

    console.log(`[ghl-webhook-router] Processed ${eventType}: touchpoint=${touchpointResult.success ? "ok" : "failed"}, capi=${capiResult.success ? "ok" : "skipped"}`);

    return new Response(JSON.stringify({
      success: true,
      eventType,
      touchpoint: touchpointResult,
      capi: capiResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[ghl-webhook-router] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
