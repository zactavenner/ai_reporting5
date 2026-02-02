import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

interface GHLOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  monetaryValue?: number;
  contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  source?: string;
  lastStageChangeAt?: string;
  createdAt?: string;
  dateAdded?: string;
}

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, any>[];
  tags?: string[];
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
  attributionSource?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };
}

// Fetch full contact details from GHL
async function fetchGHLContact(apiKey: string, contactId: string): Promise<GHLContact | null> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, { 
      method: 'GET', 
      headers 
    });
    
    if (!response.ok) {
      console.error(`GHL contact fetch error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.contact || null;
  } catch (err) {
    console.error('Error fetching GHL contact:', err);
    return null;
  }
}

// Fetch notes for a contact
async function fetchGHLNotes(apiKey: string, contactId: string): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}/notes`, { 
      method: 'GET', 
      headers 
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.notes || [];
  } catch (err) {
    console.error('Error fetching GHL notes:', err);
    return [];
  }
}

// Fetch tasks for a contact
async function fetchGHLTasks(apiKey: string, contactId: string): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}/tasks`, { 
      method: 'GET', 
      headers 
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.tasks || [];
  } catch (err) {
    console.error('Error fetching GHL tasks:', err);
    return [];
  }
}

// Fetch appointments for a contact
async function fetchGHLAppointments(apiKey: string, contactId: string): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}/appointments`, { 
      method: 'GET', 
      headers 
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.appointments || data.events || [];
  } catch (err) {
    console.error('Error fetching GHL appointments:', err);
    return [];
  }
}

// Fetch conversation messages
async function fetchGHLMessages(apiKey: string, locationId: string, contactId: string): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const messages: any[] = [];

  try {
    const searchResponse = await fetch(
      `${GHL_BASE_URL}/conversations/search?locationId=${locationId}&contactId=${contactId}`, 
      { method: 'GET', headers }
    );
    
    if (!searchResponse.ok) return [];

    const searchData = await searchResponse.json();
    const conversations = searchData.conversations || [];

    for (const conv of conversations.slice(0, 5)) {
      try {
        const messagesResponse = await fetch(
          `${GHL_BASE_URL}/conversations/${conv.id}/messages?limit=50`,
          { method: 'GET', headers }
        );

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const convMessages = messagesData.messages || [];
          
          for (const msg of convMessages) {
            messages.push({
              ...msg,
              conversationType: conv.type,
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching messages for conversation ${conv.id}:`, err);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (err) {
    console.error('Error fetching GHL conversations:', err);
  }

  return messages;
}

// Parse custom fields from GHL contact
function parseCustomFields(customFields: any[] | undefined): Record<string, any> {
  if (!customFields || !Array.isArray(customFields)) return {};
  
  const result: Record<string, any> = {};
  for (const field of customFields) {
    if (field.id && field.value !== undefined && field.value !== null && field.value !== '') {
      const key = field.fieldKey || field.id;
      result[key] = field.value;
    }
  }
  return result;
}

// Extract campaign attribution from contact
function extractCampaignAttribution(contact: GHLContact, customFields: Record<string, any>): {
  campaign_name: string | null;
  ad_set_name: string | null;
  ad_id: string | null;
} {
  const campaignFields = ['Utm Campaign', 'utm_campaign', 'Campaign Tracker', 'campaign_name', 'campaign'];
  const adSetFields = ['Utm Medium', 'Adset Id', 'ad_set_name', 'Ad Set', 'ad_set'];
  const adIdFields = ['Utm Content', 'Ad Id', 'ad_id', 'Ad ID', 'adId'];
  
  let campaign_name: string | null = null;
  let ad_set_name: string | null = null;
  let ad_id: string | null = null;
  
  for (const field of campaignFields) {
    if (customFields[field]) {
      campaign_name = String(customFields[field]);
      break;
    }
  }
  
  for (const field of adSetFields) {
    if (customFields[field]) {
      ad_set_name = String(customFields[field]);
      break;
    }
  }
  
  for (const field of adIdFields) {
    if (customFields[field]) {
      ad_id = String(customFields[field]);
      break;
    }
  }
  
  // Fallback to attributionSource
  if (!campaign_name && contact.attributionSource?.utm_campaign) {
    campaign_name = contact.attributionSource.utm_campaign;
  }
  
  if (!ad_set_name && contact.attributionSource?.utm_medium) {
    ad_set_name = contact.attributionSource.utm_medium;
  }
  
  if (!ad_id && contact.attributionSource?.utm_content) {
    ad_id = contact.attributionSource.utm_content;
  }
  
  return { campaign_name, ad_set_name, ad_id };
}

// Sync contact to leads table
async function syncContactToLead(
  supabase: any,
  clientId: string,
  contact: GHLContact,
  opportunity: GHLOpportunity
): Promise<{ leadId: string | null; action: 'created' | 'updated' | 'skipped' }> {
  const externalId = contact.id;
  const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || opportunity.contact?.name || 'Unknown';
  const email = contact.email || opportunity.contact?.email || null;
  const phone = contact.phone || opportunity.contact?.phone || null;
  
  const customFields = parseCustomFields(contact.customFields);
  const campaignAttribution = extractCampaignAttribution(contact, customFields);
  const attribution = contact.attributionSource || {};
  
  // Use GHL dateAdded for lead creation date
  let ghlCreatedAt = opportunity.dateAdded || opportunity.createdAt || new Date().toISOString();
  if (contact.dateAdded) {
    try {
      const parsedDate = new Date(contact.dateAdded);
      if (!isNaN(parsedDate.getTime())) {
        ghlCreatedAt = parsedDate.toISOString();
      }
    } catch (e) {
      console.error(`Failed to parse dateAdded for contact ${externalId}`);
    }
  }

  // Check for existing lead
  let existingLead = null;
  
  const { data: leadByExternalId } = await supabase
    .from('leads')
    .select('id, updated_at, external_id')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle();
  
  if (leadByExternalId) {
    existingLead = leadByExternalId;
  } else if (email) {
    const { data: leadByEmail } = await supabase
      .from('leads')
      .select('id, updated_at, external_id')
      .eq('client_id', clientId)
      .eq('email', email)
      .maybeSingle();
    
    if (leadByEmail) {
      existingLead = leadByEmail;
      console.log(`Matched contact ${externalId} to existing lead by email: ${email}`);
    }
  }
  
  if (!existingLead && phone) {
    const { data: leadByPhone } = await supabase
      .from('leads')
      .select('id, updated_at, external_id')
      .eq('client_id', clientId)
      .eq('phone', phone)
      .maybeSingle();
    
    if (leadByPhone) {
      existingLead = leadByPhone;
      console.log(`Matched contact ${externalId} to existing lead by phone: ${phone}`);
    }
  }

  const leadData: Record<string, any> = {
    client_id: clientId,
    external_id: externalId,
    name,
    email,
    phone,
    source: contact.source || 'pipeline_sync',
    custom_fields: customFields,
    pipeline_value: opportunity.monetaryValue || 0,
    utm_source: attribution.utm_source || null,
    utm_medium: attribution.utm_medium || null,
    utm_campaign: attribution.utm_campaign || null,
    utm_content: attribution.utm_content || null,
    utm_term: attribution.utm_term || null,
    campaign_name: campaignAttribution.campaign_name,
    ad_set_name: campaignAttribution.ad_set_name,
    ad_id: campaignAttribution.ad_id,
    ghl_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existingLead) {
    // Update existing lead
    const updateData: Record<string, any> = {
      name: name || undefined,
      pipeline_value: opportunity.monetaryValue || undefined,
      custom_fields: customFields,
      ghl_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Only update if not already set
    if (campaignAttribution.campaign_name) updateData.campaign_name = campaignAttribution.campaign_name;
    if (campaignAttribution.ad_set_name) updateData.ad_set_name = campaignAttribution.ad_set_name;
    if (campaignAttribution.ad_id) updateData.ad_id = campaignAttribution.ad_id;
    
    // Update external_id if it was matched by email/phone
    if (existingLead.external_id !== externalId) {
      updateData.external_id = externalId;
    }
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    await supabase
      .from('leads')
      .update(updateData)
      .eq('id', existingLead.id);

    return { leadId: existingLead.id, action: 'updated' };
  } else {
    // Create new lead with GHL dateAdded as created_at
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        ...leadData,
        status: 'new',
        created_at: ghlCreatedAt,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Failed to create lead for contact ${externalId}:`, error);
      return { leadId: null, action: 'skipped' };
    }
    return { leadId: newLead.id, action: 'created' };
  }
}

// Sync timeline events for a contact
async function syncContactTimeline(
  supabase: any,
  clientId: string,
  contactId: string,
  leadId: string | null,
  apiKey: string,
  locationId: string
): Promise<number> {
  console.log(`Syncing timeline for contact ${contactId}`);
  
  // Fetch all history in parallel
  const [notes, tasks, appointments, messages] = await Promise.all([
    fetchGHLNotes(apiKey, contactId),
    fetchGHLTasks(apiKey, contactId),
    fetchGHLAppointments(apiKey, contactId),
    fetchGHLMessages(apiKey, locationId, contactId),
  ]);
  
  console.log(`Fetched: ${notes.length} notes, ${tasks.length} tasks, ${appointments.length} appointments, ${messages.length} messages`);
  
  // Clear existing timeline events for this contact
  await supabase
    .from('contact_timeline_events')
    .delete()
    .eq('client_id', clientId)
    .eq('ghl_contact_id', contactId);
  
  const timelineEvents: any[] = [];
  
  // Process notes
  for (const note of notes) {
    timelineEvents.push({
      client_id: clientId,
      lead_id: leadId,
      ghl_contact_id: contactId,
      event_type: 'note',
      event_subtype: null,
      title: null,
      body: note.body,
      event_at: note.dateAdded || new Date().toISOString(),
      metadata: { userId: note.userId, noteId: note.id },
    });
  }
  
  // Process tasks
  for (const task of tasks) {
    timelineEvents.push({
      client_id: clientId,
      lead_id: leadId,
      ghl_contact_id: contactId,
      event_type: 'task',
      event_subtype: task.status || (task.completed ? 'completed' : 'pending'),
      title: task.title || task.body,
      body: task.description || task.body,
      event_at: task.dueDate || task.dateAdded || new Date().toISOString(),
      metadata: { taskId: task.id, assignedTo: task.assignedTo },
    });
  }
  
  // Process appointments
  for (const appt of appointments) {
    timelineEvents.push({
      client_id: clientId,
      lead_id: leadId,
      ghl_contact_id: contactId,
      event_type: 'appointment',
      event_subtype: appt.status || appt.appointmentStatus,
      title: appt.title || appt.calendarName,
      body: appt.notes || null,
      event_at: appt.startTime || appt.dateAdded || new Date().toISOString(),
      metadata: { 
        appointmentId: appt.id, 
        calendarId: appt.calendarId,
        endTime: appt.endTime,
        status: appt.status,
      },
    });
  }
  
  // Process messages (SMS, Email, Calls)
  for (const msg of messages) {
    let eventType = 'sms';
    if (msg.type === 'TYPE_EMAIL' || msg.messageType === 'TYPE_EMAIL') {
      eventType = 'email';
    } else if (msg.type === 'TYPE_CALL' || msg.messageType === 'TYPE_CALL' || msg.conversationType === 'TYPE_CALL') {
      eventType = 'call';
    } else if (msg.type === 'TYPE_SMS' || msg.messageType === 'TYPE_SMS') {
      eventType = 'sms';
    }
    
    timelineEvents.push({
      client_id: clientId,
      lead_id: leadId,
      ghl_contact_id: contactId,
      event_type: eventType,
      event_subtype: msg.direction || (msg.direction === 1 ? 'inbound' : 'outbound'),
      title: msg.subject || null,
      body: msg.body || msg.message,
      event_at: msg.dateAdded || new Date().toISOString(),
      metadata: { 
        messageId: msg.id, 
        conversationId: msg.conversationId,
        status: msg.status,
        direction: msg.direction,
      },
    });
  }
  
  // Add opportunity stage change event
  timelineEvents.push({
    client_id: clientId,
    lead_id: leadId,
    ghl_contact_id: contactId,
    event_type: 'opportunity_stage_change',
    event_subtype: 'pipeline_sync',
    title: 'Added to pipeline',
    body: 'Contact synced from GHL pipeline',
    event_at: new Date().toISOString(),
    metadata: { source: 'pipeline_sync' },
  });
  
  // Insert all events in batches
  if (timelineEvents.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < timelineEvents.length; i += batchSize) {
      const batch = timelineEvents.slice(i, i + batchSize);
      await supabase.from('contact_timeline_events').insert(batch);
    }
  }
  
  return timelineEvents.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { client_id, mode = 'list', pipeline_id, sync_contacts = false } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client's GHL credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('ghl_location_id, ghl_api_key')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.ghl_location_id || !client.ghl_api_key) {
      return new Response(
        JSON.stringify({ error: 'GHL credentials not configured for this client' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ghlHeaders = {
      'Authorization': `Bearer ${client.ghl_api_key}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    };

    // Mode: list - Return available pipelines from GHL
    if (mode === 'list') {
      console.log('Fetching pipelines from GHL for location:', client.ghl_location_id);
      
      const pipelinesResponse = await fetch(
        `${GHL_BASE_URL}/opportunities/pipelines?locationId=${client.ghl_location_id}`,
        { headers: ghlHeaders }
      );

      if (!pipelinesResponse.ok) {
        const errorText = await pipelinesResponse.text();
        console.error('GHL API error:', pipelinesResponse.status, errorText);
        
        let errorMessage = `GHL API error: ${pipelinesResponse.status}`;
        if (pipelinesResponse.status === 401) {
          errorMessage = 'GHL credentials are invalid or expired. Please update your Private Integration Key in Client Settings → Integrations.';
        } else if (pipelinesResponse.status === 403) {
          errorMessage = 'GHL API access denied. Please ensure your Private Integration has the "Opportunities" scope enabled.';
        }
        
        return new Response(
          JSON.stringify({ error: errorMessage, code: pipelinesResponse.status }),
          { status: pipelinesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pipelinesData = await pipelinesResponse.json();
      console.log('Found pipelines:', pipelinesData.pipelines?.length || 0);

      return new Response(
        JSON.stringify({ pipelines: pipelinesData.pipelines || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: sync - Sync a specific pipeline with background processing for large datasets
    if (mode === 'sync' && pipeline_id) {
      console.log('Syncing pipeline:', pipeline_id);

      // Fetch pipeline details first (quick operation)
      const pipelinesResponse = await fetch(
        `${GHL_BASE_URL}/opportunities/pipelines?locationId=${client.ghl_location_id}`,
        { headers: ghlHeaders }
      );

      if (!pipelinesResponse.ok) {
        const errorText = await pipelinesResponse.text();
        console.error('GHL API error fetching pipelines:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pipeline details' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pipelinesData = await pipelinesResponse.json();
      const targetPipeline = pipelinesData.pipelines?.find((p: GHLPipeline) => p.id === pipeline_id);

      if (!targetPipeline) {
        return new Response(
          JSON.stringify({ error: 'Pipeline not found in GHL' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Upsert the pipeline
      const { data: dbPipeline, error: pipelineError } = await supabase
        .from('client_pipelines')
        .upsert({
          client_id,
          ghl_pipeline_id: pipeline_id,
          name: targetPipeline.name,
          last_synced_at: null, // Will be set when sync completes
        }, { onConflict: 'client_id,ghl_pipeline_id' })
        .select()
        .single();

      if (pipelineError) {
        console.error('Error upserting pipeline:', pipelineError);
        return new Response(
          JSON.stringify({ error: 'Failed to save pipeline' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sync stages synchronously (quick operation)
      const stages = targetPipeline.stages || [];
      for (const stage of stages) {
        await supabase
          .from('pipeline_stages')
          .upsert({
            pipeline_id: dbPipeline.id,
            ghl_stage_id: stage.id,
            name: stage.name,
            sort_order: stage.position || 0,
          }, { onConflict: 'pipeline_id,ghl_stage_id' });
      }

      console.log('Stages synced:', stages.length);

      // Background task for opportunity sync - with chunking to avoid CPU limits
      const backgroundSync = async () => {
        try {
          console.log('Starting background opportunity sync for pipeline:', pipeline_id);

          // Fetch stages from DB to get their IDs
          const { data: dbStages } = await supabase
            .from('pipeline_stages')
            .select('id, ghl_stage_id')
            .eq('pipeline_id', dbPipeline.id);

          const stageIdMap = new Map(dbStages?.map(s => [s.ghl_stage_id, s.id]) || []);
          console.log('Stage map has', stageIdMap.size, 'entries');

          // Clear existing opportunities for this pipeline
          await supabase
            .from('pipeline_opportunities')
            .delete()
            .eq('pipeline_id', dbPipeline.id);

          // Fetch and insert opportunities in chunks
          let hasMore = true;
          let startAfterId: string | null = null;
          let fetchCount = 0;
          let totalSynced = 0;
          const MAX_BATCHES = 200; // 200 * 100 = 20k max
          const INSERT_BATCH_SIZE = 100;

          while (hasMore && fetchCount < MAX_BATCHES) {
            fetchCount++;
            let url = `${GHL_BASE_URL}/opportunities/search?location_id=${client.ghl_location_id}&pipeline_id=${pipeline_id}&limit=100`;
            if (startAfterId) {
              url += `&startAfterId=${startAfterId}`;
            }

            const oppsResponse = await fetch(url, { 
              method: 'GET',
              headers: ghlHeaders,
            });

            if (!oppsResponse.ok) {
              console.error('Failed to fetch opportunities:', await oppsResponse.text());
              break;
            }

            const oppsData: { opportunities?: GHLOpportunity[], meta?: { startAfterId?: string } } = await oppsResponse.json();
            const opportunities: GHLOpportunity[] = oppsData.opportunities || [];
            
            if (opportunities.length === 0) {
              hasMore = false;
              break;
            }

            console.log(`Fetch ${fetchCount}: got ${opportunities.length} opps`);

            // Immediately insert this batch
            const opportunityRecords: any[] = [];
            for (const opp of opportunities) {
              const stageId = stageIdMap.get(opp.pipelineStageId);
              if (!stageId) continue;

              opportunityRecords.push({
                pipeline_id: dbPipeline.id,
                stage_id: stageId,
                ghl_opportunity_id: opp.id,
                ghl_contact_id: opp.contact?.id || null,
                contact_name: opp.contact?.name || opp.name || null,
                contact_email: opp.contact?.email || null,
                contact_phone: opp.contact?.phone || null,
                monetary_value: opp.monetaryValue || 0,
                source: opp.source || null,
                status: opp.status || 'open',
                last_stage_change_at: opp.lastStageChangeAt || null,
              });
            }

            if (opportunityRecords.length > 0) {
              const { error: batchError } = await supabase
                .from('pipeline_opportunities')
                .insert(opportunityRecords);

              if (batchError) {
                console.error('Batch insert error:', batchError);
              } else {
                totalSynced += opportunityRecords.length;
              }
            }

            // Pagination
            if (oppsData.meta?.startAfterId) {
              startAfterId = oppsData.meta.startAfterId;
            } else if (opportunities.length === 100) {
              startAfterId = opportunities[opportunities.length - 1]?.id;
            } else {
              hasMore = false;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // Update last_synced_at
          await supabase
            .from('client_pipelines')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', dbPipeline.id);

          console.log(`Pipeline sync complete: ${totalSynced} opportunities synced`);
        } catch (err) {
          console.error('Background sync error:', err);
          // Still mark as synced even on error to show partial data
          await supabase
            .from('client_pipelines')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', dbPipeline.id);
        }
      };

      // Execute in background if possible
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(backgroundSync());
        console.log('Started background sync task');
      } else {
        // Fallback: run synchronously (will timeout for large datasets)
        await backgroundSync();
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Pipeline sync started',
          pipeline: dbPipeline,
          stages_count: stages.length,
          background: typeof EdgeRuntime !== 'undefined',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: remove - Remove a pipeline from tracking
    if (mode === 'remove' && pipeline_id) {
      const { error: deleteError } = await supabase
        .from('client_pipelines')
        .delete()
        .eq('client_id', client_id)
        .eq('ghl_pipeline_id', pipeline_id);

      if (deleteError) {
        console.error('Error removing pipeline:', deleteError);
        return new Response(
          JSON.stringify({ error: 'Failed to remove pipeline' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid mode' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-ghl-pipelines:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
