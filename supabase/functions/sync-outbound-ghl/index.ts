import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const BATCH_SIZE = 50;
const DELAY_MS = 200;
const MAX_RETRIES = 3;

interface Client {
  id: string;
  name: string;
  ghl_api_key: string;
  ghl_location_id: string;
}

interface OutboundEvent {
  id: string;
  client_id: string;
  external_id: string;
  channel: 'sms' | 'email' | 'call';
  direction: string;
  contact_identifier: string;
  ghl_contact_id: string | null;
  event_at: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Find or create contact in GHL
async function findOrCreateContact(
  apiKey: string,
  locationId: string,
  identifier: string
): Promise<string | null> {
  try {
    // Search by phone or email using POST /contacts/search (v2 recommended)
    const isEmail = identifier.includes('@');
    
    const searchBody: Record<string, any> = {
      locationId,
      pageLimit: 1,
      page: 1,
    };
    if (isEmail) {
      searchBody.email = identifier;
    } else {
      searchBody.phone = identifier;
    }
    
    const searchResponse = await fetch(
      `${GHL_BASE_URL}/contacts/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(searchBody)
      }
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      if (data.contacts && data.contacts.length > 0) {
        return data.contacts[0].id;
      }
    }

    // Create new contact if not found
    const createPayload: Record<string, string> = {
      locationId,
    };
    
    if (isEmail) {
      createPayload.email = identifier;
    } else {
      createPayload.phone = identifier;
    }

    const createResponse = await fetch(`${GHL_BASE_URL}/contacts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    if (createResponse.ok) {
      const newContact = await createResponse.json();
      return newContact.contact?.id || null;
    }

    return null;
  } catch (error) {
    console.error('Error finding/creating contact:', error);
    return null;
  }
}

// Push SMS or Email to GHL conversations
async function pushMessage(
  apiKey: string,
  locationId: string,
  contactId: string,
  event: OutboundEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = event.payload as Record<string, unknown>;
    const messageType = event.channel === 'sms' ? 'SMS' : 'Email';
    
    // Create conversation message
    const messagePayload = {
      type: messageType,
      contactId,
      locationId,
      message: payload.body || payload.message || '',
      direction: event.direction === 'outbound' ? 'outbound' : 'inbound',
      dateAdded: event.event_at,
      ...(event.channel === 'email' && {
        subject: payload.subject || 'Email',
        fromEmail: payload.from_email,
        toEmail: payload.to_email,
      })
    };

    const response = await fetch(`${GHL_BASE_URL}/conversations/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `GHL API error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Push Call record to GHL activities
async function pushCall(
  apiKey: string,
  locationId: string,
  contactId: string,
  event: OutboundEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = event.payload as Record<string, unknown>;
    
    // Build call summary with transcript
    let noteBody = `**Call Record**\n`;
    noteBody += `• Direction: ${event.direction}\n`;
    noteBody += `• Duration: ${payload.duration_seconds || 0} seconds\n`;
    noteBody += `• Outcome: ${payload.outcome || 'Unknown'}\n`;
    
    if (payload.summary) {
      noteBody += `\n**Summary:**\n${payload.summary}\n`;
    }
    
    // Handle transcript - chunk if too large
    if (payload.transcript) {
      const transcript = String(payload.transcript);
      if (transcript.length > 30000) {
        noteBody += `\n**Transcript (truncated):**\n${transcript.slice(0, 30000)}...\n[Full transcript stored in system]`;
      } else {
        noteBody += `\n**Transcript:**\n${transcript}`;
      }
    }

    // Create activity for the call
    const activityPayload = {
      contactId,
      locationId,
      type: 'call',
      title: `${event.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call`,
      body: noteBody,
      date: event.event_at,
      ...(payload.duration_seconds ? { callDuration: Number(payload.duration_seconds) } : {})
    };

    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        body: noteBody,
        userId: null // System note
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `GHL API error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Process a single event
async function processEvent(
  supabase: ReturnType<typeof createClient>,
  client: Client,
  event: OutboundEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find or create the GHL contact
    let ghlContactId = event.ghl_contact_id;
    
    if (!ghlContactId) {
      ghlContactId = await findOrCreateContact(
        client.ghl_api_key,
        client.ghl_location_id,
        event.contact_identifier
      );

      if (!ghlContactId) {
        return { success: false, error: 'Failed to find or create GHL contact' };
      }

      // Update the event with the GHL contact ID for future reference
      await supabase
        .from('sync_outbound_events')
        .update({ ghl_contact_id: ghlContactId })
        .eq('id', event.id);
    }

    // Push based on channel type
    let result: { success: boolean; error?: string };
    
    switch (event.channel) {
      case 'sms':
      case 'email':
        result = await pushMessage(client.ghl_api_key, client.ghl_location_id, ghlContactId, event);
        break;
      case 'call':
        result = await pushCall(client.ghl_api_key, client.ghl_location_id, ghlContactId, event);
        break;
      default:
        result = { success: false, error: `Unknown channel: ${event.channel}` };
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Outbound GHL sync starting...');

  try {
    // Get all clients with GHL credentials
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, ghl_api_key, ghl_location_id')
      .not('ghl_api_key', 'is', null)
      .not('ghl_location_id', 'is', null);

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No clients with GHL credentials' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalSynced = 0;
    let totalFailed = 0;
    const clientResults: Record<string, { synced: number; failed: number }> = {};

    for (const client of clients as Client[]) {
      // Get unsynced events for this client (limit to batch size)
      const { data: events, error: eventsError } = await supabase
        .from('sync_outbound_events')
        .select('*')
        .eq('client_id', client.id)
        .eq('synced_to_ghl', false)
        .lt('retry_count', MAX_RETRIES)
        .order('event_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (eventsError) {
        console.error(`Error fetching events for ${client.name}:`, eventsError);
        continue;
      }

      if (!events || events.length === 0) {
        continue;
      }

      console.log(`[${client.name}] Processing ${events.length} outbound events`);

      let synced = 0;
      let failed = 0;

      for (const event of events as OutboundEvent[]) {
        const result = await processEvent(supabase, client, event);

        if (result.success) {
          // Mark as synced
          await supabase
            .from('sync_outbound_events')
            .update({
              synced_to_ghl: true,
              synced_at: new Date().toISOString(),
              sync_error: null
            })
            .eq('id', event.id);
          
          synced++;
        } else {
          // Record error and increment retry count
          await supabase
            .from('sync_outbound_events')
            .update({
              sync_error: result.error,
              retry_count: event.retry_count + 1
            })
            .eq('id', event.id);
          
          failed++;
          console.error(`[${client.name}] Failed to sync event ${event.id}: ${result.error}`);
        }

        await delay(DELAY_MS);
      }

      clientResults[client.name] = { synced, failed };
      totalSynced += synced;
      totalFailed += failed;

      console.log(`[${client.name}] Completed: ${synced} synced, ${failed} failed`);
    }

    console.log(`Outbound sync complete: ${totalSynced} synced, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        total_synced: totalSynced,
        total_failed: totalFailed,
        clients: clientResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Outbound sync error:', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
