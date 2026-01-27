import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

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

interface GHLCall {
  id: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration?: number;
  recordingUrl?: string;
  dateAdded: string;
}

async function fetchGHLContacts(
  apiKey: string,
  locationId: string,
  limit: number = 100,
  startAfterId?: string
): Promise<{ contacts: GHLContact[]; nextPageUrl?: string }> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  let url = `${GHL_BASE_URL}/contacts/?locationId=${locationId}&limit=${limit}`;
  if (startAfterId) {
    url += `&startAfterId=${startAfterId}`;
  }

  const response = await fetch(url, { method: 'GET', headers });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GHL API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    contacts: data.contacts || [],
    nextPageUrl: data.meta?.nextPageUrl,
  };
}

async function fetchGHLConversations(
  apiKey: string,
  locationId: string,
  sinceDate: Date
): Promise<GHLCall[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const calls: GHLCall[] = [];
  let hasMore = true;
  let lastMessageId: string | undefined;
  const MAX_PAGES = 10;
  let pageCount = 0;

  try {
    while (hasMore && pageCount < MAX_PAGES) {
      let url = `${GHL_BASE_URL}/conversations/search?locationId=${locationId}&type=TYPE_CALL`;
      if (lastMessageId) {
        url += `&startAfterId=${lastMessageId}`;
      }

      const response = await fetch(url, { method: 'GET', headers });
      
      if (!response.ok) {
        console.error(`GHL Conversations API error: ${response.status}`);
        break;
      }

      const data = await response.json();
      const conversations = data.conversations || [];

      for (const conv of conversations) {
        if (!conv.lastMessageDate || new Date(conv.lastMessageDate) < sinceDate) {
          hasMore = false;
          break;
        }

        // Extract call messages from conversation
        if (conv.type === 'TYPE_CALL' && conv.contactId) {
          calls.push({
            id: conv.id,
            contactId: conv.contactId,
            direction: conv.lastMessageDirection === 'inbound' ? 'inbound' : 'outbound',
            status: conv.lastMessageStatus || 'unknown',
            duration: conv.lastCallDuration || undefined,
            recordingUrl: conv.lastCallRecording || undefined,
            dateAdded: conv.lastMessageDate,
          });
        }
      }

      if (conversations.length > 0) {
        lastMessageId = conversations[conversations.length - 1].id;
      } else {
        hasMore = false;
      }

      pageCount++;
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
    }
  } catch (err) {
    console.error('Error fetching GHL conversations:', err);
  }

  return calls;
}

async function syncCallToDatabase(
  supabase: any,
  clientId: string,
  ghlCall: GHLCall
): Promise<{ action: 'enriched' | 'skipped' }> {
  // Find matching call by contact external_id or lead's external_id
  const { data: existingCall } = await supabase
    .from('calls')
    .select('id, external_id, call_connected, recording_url')
    .eq('client_id', clientId)
    .or(`external_id.eq.${ghlCall.id},external_id.eq.${ghlCall.contactId}`)
    .maybeSingle();

  if (existingCall) {
    // Enrich existing call with API data - DO NOT override 'showed' field
    const updates: Record<string, any> = {
      call_connected: ghlCall.status === 'completed' || ghlCall.status === 'answered',
      ghl_synced_at: new Date().toISOString(),
    };

    if (ghlCall.duration && ghlCall.duration > 0) {
      updates.call_duration_seconds = ghlCall.duration;
    }

    if (ghlCall.recordingUrl && !existingCall.recording_url) {
      updates.recording_url = ghlCall.recordingUrl;
    }

    await supabase
      .from('calls')
      .update(updates)
      .eq('id', existingCall.id);

    return { action: 'enriched' };
  }

  return { action: 'skipped' };
}

async function syncClientCallLogs(
  supabase: any,
  client: { id: string; name: string; ghl_api_key: string; ghl_location_id: string },
  sinceDate: Date
): Promise<{ enriched: number; skipped: number; errors: string[] }> {
  const result = { enriched: 0, skipped: 0, errors: [] as string[] };

  console.log(`Starting GHL call sync for client: ${client.name}`);

  try {
    const calls = await fetchGHLConversations(client.ghl_api_key, client.ghl_location_id, sinceDate);
    console.log(`Fetched ${calls.length} calls for ${client.name}`);

    for (const call of calls) {
      try {
        const syncResult = await syncCallToDatabase(supabase, client.id, call);
        if (syncResult.action === 'enriched') result.enriched++;
        else result.skipped++;
      } catch (err) {
        result.errors.push(`Call ${call.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        result.skipped++;
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Call sync failed: ${errorMsg}`);
    console.error(`GHL call sync error for ${client.name}:`, errorMsg);
  }

  console.log(`GHL call sync complete for ${client.name}: enriched=${result.enriched}, skipped=${result.skipped}`);
  return result;
}

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

function extractQuestionsFromCustomFields(customFields: Record<string, any>): any[] {
  const questions: any[] = [];
  const skipFields = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'campaign_name', 'ad_set_name', 'ad_id', 'assigned_user', 'source',
    'Campaign Tracker', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'UTM Term'
  ]);
  
  for (const [key, value] of Object.entries(customFields)) {
    if (value !== null && value !== undefined && value !== '' && !skipFields.has(key)) {
      questions.push({
        question: key,
        answer: value,
        source: 'ghl_sync'
      });
    }
  }
  return questions;
}

function extractCampaignAttribution(contact: GHLContact, customFields: Record<string, any>): {
  campaign_name: string | null;
  ad_set_name: string | null;
  ad_id: string | null;
} {
  const campaignFields = ['Campaign Tracker', 'campaign', 'campaign_name', 'utm_campaign'];
  const adSetFields = ['Ad Set', 'ad_set', 'ad_set_name', 'adset_name'];
  const adIdFields = ['Ad ID', 'ad_id', 'adId'];
  
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
  
  if (!campaign_name && contact.attributionSource?.utm_campaign) {
    campaign_name = contact.attributionSource.utm_campaign;
  }
  
  return { campaign_name, ad_set_name, ad_id };
}

function hasBadLeadTag(contact: GHLContact): boolean {
  if (!contact.tags || !Array.isArray(contact.tags)) return false;
  
  // Check for various "bad lead" tag variations (case-insensitive)
  const badLeadPatterns = ['bad lead', 'badlead', 'bad_lead', 'bad-lead'];
  return contact.tags.some(tag => 
    badLeadPatterns.some(pattern => 
      tag.toLowerCase().includes(pattern)
    )
  );
}

async function syncContactToDatabase(
  supabase: any,
  clientId: string,
  contact: GHLContact
): Promise<{ action: 'created' | 'updated' | 'skipped'; leadId?: string }> {
  const externalId = contact.id;
  const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  const email = contact.email || null;
  const phone = contact.phone || null;
  
  const customFields = parseCustomFields(contact.customFields);
  const questions = extractQuestionsFromCustomFields(customFields);
  const campaignAttribution = extractCampaignAttribution(contact, customFields);
  
  const attribution = contact.attributionSource || {};
  
  // Check for BAD LEAD tag
  const isBadLead = hasBadLeadTag(contact);
  
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, updated_at, is_spam')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle();

  const leadData: Record<string, any> = {
    client_id: clientId,
    external_id: externalId,
    name,
    email,
    phone,
    source: contact.source || 'ghl_sync',
    custom_fields: customFields,
    questions,
    utm_source: attribution.utm_source || null,
    utm_medium: attribution.utm_medium || null,
    utm_campaign: attribution.utm_campaign || null,
    utm_content: attribution.utm_content || null,
    utm_term: attribution.utm_term || null,
    campaign_name: campaignAttribution.campaign_name,
    ad_set_name: campaignAttribution.ad_set_name,
    ad_id: campaignAttribution.ad_id,
    updated_at: new Date().toISOString(),
  };

  // If contact has BAD LEAD tag, mark as spam
  if (isBadLead) {
    leadData.is_spam = true;
    console.log(`Marking contact ${externalId} as bad lead (tag detected)`);
  }

  if (existingLead) {
    // Only update is_spam if it's a bad lead (don't override existing spam status)
    if (!isBadLead && existingLead.is_spam) {
      delete leadData.is_spam;
    }
    
    const { error } = await supabase
      .from('leads')
      .update(leadData)
      .eq('id', existingLead.id);

    if (error) {
      console.error(`Failed to update lead ${existingLead.id}:`, error);
      return { action: 'skipped' };
    }
    return { action: 'updated', leadId: existingLead.id };
  } else {
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        ...leadData,
        status: 'new',
        is_spam: isBadLead,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Failed to create lead for contact ${externalId}:`, error);
      return { action: 'skipped' };
    }
    return { action: 'created', leadId: newLead.id };
  }
}

async function detectDiscrepancies(
  supabase: any,
  clientId: string,
  apiContactsTotal: number,
  syncLogId?: string
): Promise<void> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  try {
    // Count webhook leads in last 24h
    const { count: webhookCount } = await supabase
      .from('webhook_logs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('webhook_type', 'lead')
      .eq('status', 'success')
      .gte('processed_at', yesterday.toISOString());
    
    // Count DB leads in last 24h
    const { count: dbCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', yesterday.toISOString());
    
    // Calculate discrepancy
    const webhookNum = webhookCount || 0;
    const dbNum = dbCount || 0;
    const difference = Math.abs(webhookNum - dbNum);
    const percentDiff = dbNum > 0 ? (difference / dbNum) * 100 : (webhookNum > 0 ? 100 : 0);
    
    // Only log if significant (>5% or >3 records)
    if (difference > 3 || percentDiff > 5) {
      const severity = percentDiff > 20 ? 'critical' : percentDiff > 10 ? 'warning' : 'info';
      
      console.log(`Discrepancy detected for client ${clientId}: webhook=${webhookNum}, db=${dbNum}, api=${apiContactsTotal}, diff=${difference}, severity=${severity}`);
      
      await supabase.from('data_discrepancies').insert({
        client_id: clientId,
        discrepancy_type: 'lead_count_mismatch',
        date_range_start: yesterday.toISOString().split('T')[0],
        date_range_end: today.toISOString().split('T')[0],
        webhook_count: webhookNum,
        api_count: apiContactsTotal,
        db_count: dbNum,
        difference,
        severity,
        status: 'open',
        sync_log_id: syncLogId || null,
      });
    }
    
    // Also check for failed webhooks
    const { count: failedWebhooks } = await supabase
      .from('webhook_logs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'error')
      .gte('processed_at', yesterday.toISOString());
    
    const failedNum = failedWebhooks || 0;
    if (failedNum > 2) {
      const failedSeverity = failedNum > 5 ? 'critical' : 'warning';
      
      console.log(`Failed webhooks detected for client ${clientId}: count=${failedNum}, severity=${failedSeverity}`);
      
      await supabase.from('data_discrepancies').insert({
        client_id: clientId,
        discrepancy_type: 'failed_webhooks',
        date_range_start: yesterday.toISOString().split('T')[0],
        date_range_end: today.toISOString().split('T')[0],
        webhook_count: failedNum,
        api_count: 0,
        db_count: 0,
        difference: failedNum,
        severity: failedSeverity,
        status: 'open',
        sync_log_id: syncLogId || null,
      });
    }
  } catch (err) {
    console.error(`Error detecting discrepancies for client ${clientId}:`, err);
  }
}

async function syncClientContacts(
  supabase: any,
  client: { id: string; name: string; ghl_api_key: string; ghl_location_id: string },
  syncLogId?: string
): Promise<{ created: number; updated: number; skipped: number; errors: string[]; totalApiContacts: number }> {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[], totalApiContacts: 0 };
  
  console.log(`Starting GHL sync for client: ${client.name} (${client.id})`);
  
  let hasMore = true;
  let startAfterId: string | undefined;
  let totalProcessed = 0;
  const MAX_CONTACTS = 1000;

  try {
    while (hasMore && totalProcessed < MAX_CONTACTS) {
      const { contacts, nextPageUrl } = await fetchGHLContacts(
        client.ghl_api_key,
        client.ghl_location_id,
        100,
        startAfterId
      );

      console.log(`Fetched ${contacts.length} contacts for ${client.name}`);

      for (const contact of contacts) {
        try {
          const syncResult = await syncContactToDatabase(supabase, client.id, contact);
          if (syncResult.action === 'created') result.created++;
          else if (syncResult.action === 'updated') result.updated++;
          else result.skipped++;
        } catch (err) {
          result.errors.push(`Contact ${contact.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          result.skipped++;
        }
        totalProcessed++;
      }

      if (nextPageUrl && contacts.length === 100) {
        startAfterId = contacts[contacts.length - 1].id;
      } else {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Track total API contacts for discrepancy detection
    result.totalApiContacts = totalProcessed;
    
    // Run discrepancy detection after sync
    await detectDiscrepancies(supabase, client.id, result.totalApiContacts, syncLogId);
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Sync failed: ${errorMsg}`);
    console.error(`GHL sync error for ${client.name}:`, errorMsg);
  }

  console.log(`GHL sync complete for ${client.name}: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}`);
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let targetClientId: string | null = null;
    let syncType: 'contacts' | 'calls' | 'all' = 'all';
    
    try {
      const body = await req.json();
      targetClientId = body?.client_id || null;
      syncType = body?.syncType || 'all';
    } catch {
      // No body or invalid JSON - sync all clients
    }

    // Fetch clients with GHL credentials
    let query = supabase
      .from('clients')
      .select('id, name, ghl_api_key, ghl_location_id')
      .eq('status', 'active')
      .not('ghl_api_key', 'is', null)
      .not('ghl_location_id', 'is', null);

    if (targetClientId) {
      query = query.eq('id', targetClientId);
    }

    const { data: clients, error: clientsError } = await query;

    if (clientsError) {
      throw new Error(`Failed to fetch clients: ${clientsError.message}`);
    }

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No clients with GHL credentials found', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting GHL ${syncType} sync for ${clients.length} client(s)`);

    const results: Array<{
      client_id: string;
      client_name: string;
      contacts?: { created: number; updated: number; skipped: number; errors: string[] };
      calls?: { enriched: number; skipped: number; errors: string[] };
    }> = [];

    // Default to syncing from last 7 days for calls
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 7);

    for (const client of clients) {
      const clientResult: typeof results[0] = {
        client_id: client.id,
        client_name: client.name,
      };

      // Log sync start
      const { data: syncLog } = await supabase
        .from('sync_logs')
        .insert({
          client_id: client.id,
          sync_type: syncType === 'calls' ? 'ghl_calls' : 'ghl_contacts',
          status: 'running',
        })
        .select('id')
        .single();

      // Sync contacts
      if (syncType === 'contacts' || syncType === 'all') {
        clientResult.contacts = await syncClientContacts(supabase, client as any, syncLog?.id);
        
        // Update last contacts sync timestamp
        await supabase
          .from('client_settings')
          .update({ ghl_last_contacts_sync: new Date().toISOString() })
          .eq('client_id', client.id);
      }

      // Sync calls
      if (syncType === 'calls' || syncType === 'all') {
        clientResult.calls = await syncClientCallLogs(supabase, client as any, sinceDate);
        
        // Update last calls sync timestamp
        await supabase
          .from('client_settings')
          .update({ ghl_last_calls_sync: new Date().toISOString() })
          .eq('client_id', client.id);
      }

      results.push(clientResult);

      // Update sync log
      if (syncLog) {
        const hasErrors = (clientResult.contacts?.errors?.length || 0) > 0 || 
                         (clientResult.calls?.errors?.length || 0) > 0;
        const recordsSynced = (clientResult.contacts?.created || 0) + 
                             (clientResult.contacts?.updated || 0) +
                             (clientResult.calls?.enriched || 0);
        
        await supabase
          .from('sync_logs')
          .update({
            status: hasErrors ? 'partial' : 'success',
            records_synced: recordsSynced,
            error_message: hasErrors ? 
              [...(clientResult.contacts?.errors || []), ...(clientResult.calls?.errors || [])].join('; ') : null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }
    }

    const totalContactsCreated = results.reduce((sum, r) => sum + (r.contacts?.created || 0), 0);
    const totalContactsUpdated = results.reduce((sum, r) => sum + (r.contacts?.updated || 0), 0);
    const totalCallsEnriched = results.reduce((sum, r) => sum + (r.calls?.enriched || 0), 0);

    console.log(`GHL sync complete: ${totalContactsCreated} contacts created, ${totalContactsUpdated} updated, ${totalCallsEnriched} calls enriched`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          clients_synced: clients.length,
          total_contacts_created: totalContactsCreated,
          total_contacts_updated: totalContactsUpdated,
          total_calls_enriched: totalCallsEnriched,
        },
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('GHL sync error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
