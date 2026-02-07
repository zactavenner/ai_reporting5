import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

interface AppointmentResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  appointments: any[];
}

// Fetch all appointments from a specific GHL calendar using the /calendars/events endpoint
async function fetchCalendarAppointments(
  apiKey: string,
  locationId: string,
  calendarId: string
): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
  
  const appointments: any[] = [];
  
  try {
    // Use date range: last 365 days to future 30 days
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 365);
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + 30);
    
    // Use the correct GHL API endpoint: /calendars/events
    const url = `${GHL_BASE_URL}/calendars/events?locationId=${locationId}&calendarId=${calendarId}&startTime=${startTime.getTime()}&endTime=${endTime.getTime()}`;
    
    console.log(`Fetching appointments from calendar ${calendarId} (${startTime.toISOString()} to ${endTime.toISOString()})`);
    const response = await fetch(url, { method: 'GET', headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GHL calendar events fetch error: ${response.status} - ${errorText}`);
      return [];
    }
    
    const data = await response.json();
    const events = data.events || [];
    console.log(`Fetched ${events.length} events from calendar ${calendarId}`);
    
    // Filter for appointments only (not blocked slots)
    for (const event of events) {
      if (event.appointmentStatus || event.status || event.contactId) {
        appointments.push({ ...event, calendarId });
      }
    }
    
    console.log(`Found ${appointments.length} appointments (filtered from ${events.length} events)`);
  } catch (err) {
    console.error(`Error fetching appointments for calendar ${calendarId}:`, err);
  }
  
  console.log(`Total appointments fetched from calendar ${calendarId}: ${appointments.length}`);
  return appointments;
}

// Sync appointment to call record
async function syncAppointmentToCall(
  supabase: any,
  clientId: string,
  appt: any,
  leadsByContactId: Map<string, { id: string; name: string | null; email: string | null; phone: string | null }>,
  isReconnect: boolean
): Promise<{ action: 'created' | 'updated' | 'skipped' }> {
  const appointmentId = appt.id;
  const calendarId = appt.calendarId;
  const contactId = appt.contactId;
  const status = (appt.status || appt.appointmentStatus || '').toLowerCase();
  
  // Map GHL appointment status to our call outcome
  let outcome = isReconnect ? 'reconnect_booked' : 'booked';
  let showed = false;
  
  if (status === 'showed' || status === 'completed') {
    outcome = isReconnect ? 'reconnect_showed' : 'showed';
    showed = true;
  } else if (status === 'noshow' || status === 'no-show' || status === 'no_show') {
    outcome = 'no_show';
    showed = false;
  } else if (status === 'cancelled' || status === 'canceled') {
    outcome = 'cancelled';
    showed = false;
  } else if (status === 'confirmed') {
    outcome = isReconnect ? 'reconnect_booked' : 'booked';
    showed = false;
  }
  
  // Find lead by contact ID
  const lead = contactId ? leadsByContactId.get(contactId) : null;
  const leadId = lead?.id || null;
  
  // Get contact details
  let contactName = lead?.name || null;
  let contactEmail = lead?.email || null;
  let contactPhone = lead?.phone || null;
  
  // Try to get from appointment data
  if (appt.contact) {
    contactName = contactName || appt.contact.name || `${appt.contact.firstName || ''} ${appt.contact.lastName || ''}`.trim() || null;
    contactEmail = contactEmail || appt.contact.email || null;
    contactPhone = contactPhone || appt.contact.phone || null;
  }
  
  // Use GHL dateAdded as the original creation date
  const ghlCreatedAt = appt.dateAdded || appt.createdAt || new Date().toISOString();
  
  const callData = {
    client_id: clientId,
    lead_id: leadId,
    external_id: contactId || appointmentId,
    ghl_appointment_id: appointmentId,
    ghl_calendar_id: calendarId,
    scheduled_at: appt.startTime || appt.dateAdded,
    appointment_status: status,
    showed,
    outcome,
    is_reconnect: isReconnect,
    booked_at: ghlCreatedAt,
    ghl_synced_at: new Date().toISOString(),
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  };
  
  // Check if call already exists by appointment ID
  const { data: existingCall } = await supabase
    .from('calls')
    .select('id, created_at')
    .eq('client_id', clientId)
    .eq('ghl_appointment_id', appointmentId)
    .maybeSingle();
  
  if (existingCall) {
    // Update existing call (don't change created_at)
    const { error: updateError } = await supabase
      .from('calls')
      .update({
        lead_id: callData.lead_id,
        scheduled_at: callData.scheduled_at,
        appointment_status: callData.appointment_status,
        showed: callData.showed,
        outcome: callData.outcome,
        is_reconnect: callData.is_reconnect,
        booked_at: callData.booked_at,
        ghl_synced_at: callData.ghl_synced_at,
        contact_name: callData.contact_name,
        contact_email: callData.contact_email,
        contact_phone: callData.contact_phone,
      })
      .eq('id', existingCall.id);
    
    if (updateError) {
      console.error(`Failed to update call ${appointmentId}:`, updateError);
      return { action: 'skipped' };
    }
    return { action: 'updated' };
  }
  
  // Create new call with GHL creation date
  const { error: insertError } = await supabase
    .from('calls')
    .insert({
      ...callData,
      created_at: ghlCreatedAt, // Use GHL creation date
    });
  
  if (insertError) {
    console.error(`Failed to create call ${appointmentId}:`, insertError);
    return { action: 'skipped' };
  }
  
  console.log(`Created call: ${contactName || contactId} - ${outcome} - ${appt.startTime}`);
  return { action: 'created' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'clientId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch client and settings
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, ghl_api_key, ghl_location_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.ghl_api_key || !client.ghl_location_id) {
      return new Response(
        JSON.stringify({ error: 'Client has no GHL credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabase
      .from('client_settings')
      .select('tracked_calendar_ids, reconnect_calendar_ids')
      .eq('client_id', clientId)
      .single();

    const trackedCalendarIds = settings?.tracked_calendar_ids || [];
    const reconnectCalendarIds = settings?.reconnect_calendar_ids || [];

    if (trackedCalendarIds.length === 0 && reconnectCalendarIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No calendars configured for tracking',
          tracked: trackedCalendarIds.length,
          reconnect: reconnectCalendarIds.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting calendar sync for ${client.name}: tracked=${trackedCalendarIds.length}, reconnect=${reconnectCalendarIds.length}`);

    // Build lead lookup map
    const { data: leads } = await supabase
      .from('leads')
      .select('id, external_id, name, email, phone')
      .eq('client_id', clientId)
      .not('external_id', 'is', null);

    const leadsByContactId = new Map<string, { id: string; name: string | null; email: string | null; phone: string | null }>();
    for (const lead of leads || []) {
      if (lead.external_id) {
        leadsByContactId.set(lead.external_id, {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        });
      }
    }
    console.log(`Built lead lookup map with ${leadsByContactId.size} entries`);

    const result: AppointmentResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      appointments: [],
    };

    // Process tracked calendars (booked calls)
    for (const calendarId of trackedCalendarIds) {
      try {
        console.log(`Processing tracked calendar: ${calendarId}`);
        const appointments = await fetchCalendarAppointments(
          client.ghl_api_key,
          client.ghl_location_id,
          calendarId
        );

        for (const appt of appointments) {
          const syncResult = await syncAppointmentToCall(supabase, clientId, appt, leadsByContactId, false);
          if (syncResult.action === 'created') result.created++;
          else if (syncResult.action === 'updated') result.updated++;
          else result.skipped++;
          
          result.appointments.push({
            id: appt.id,
            contactId: appt.contactId,
            startTime: appt.startTime,
            status: appt.status || appt.appointmentStatus,
            action: syncResult.action,
          });
        }
      } catch (err) {
        const errorMsg = `Calendar ${calendarId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Process reconnect calendars
    for (const calendarId of reconnectCalendarIds) {
      try {
        console.log(`Processing reconnect calendar: ${calendarId}`);
        const appointments = await fetchCalendarAppointments(
          client.ghl_api_key,
          client.ghl_location_id,
          calendarId
        );

        for (const appt of appointments) {
          const syncResult = await syncAppointmentToCall(supabase, clientId, appt, leadsByContactId, true);
          if (syncResult.action === 'created') result.created++;
          else if (syncResult.action === 'updated') result.updated++;
          else result.skipped++;
          
          result.appointments.push({
            id: appt.id,
            contactId: appt.contactId,
            startTime: appt.startTime,
            status: appt.status || appt.appointmentStatus,
            isReconnect: true,
            action: syncResult.action,
          });
        }
      } catch (err) {
        const errorMsg = `Reconnect calendar ${calendarId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Update sync timestamp
    await supabase
      .from('client_settings')
      .update({ ghl_last_calls_sync: new Date().toISOString() })
      .eq('client_id', clientId);

    console.log(`Calendar sync complete for ${client.name}: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        client: client.name,
        trackedCalendars: trackedCalendarIds,
        reconnectCalendars: reconnectCalendarIds,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        totalAppointments: result.appointments.length,
        sampleAppointments: result.appointments.slice(0, 10),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Calendar sync error:', err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
