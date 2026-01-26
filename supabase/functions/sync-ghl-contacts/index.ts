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

async function fetchGHLContact(
  apiKey: string,
  contactId: string
): Promise<GHLContact | null> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const response = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    console.error(`Failed to fetch contact ${contactId}: ${response.status}`);
    return null;
  }

  const data = await response.json();
  return data.contact || null;
}

function parseCustomFields(customFields: any[] | undefined): Record<string, any> {
  if (!customFields || !Array.isArray(customFields)) return {};
  
  const result: Record<string, any> = {};
  for (const field of customFields) {
    if (field.id && field.value !== undefined && field.value !== null && field.value !== '') {
      // Use field name if available, otherwise use ID
      const key = field.fieldKey || field.id;
      result[key] = field.value;
    }
  }
  return result;
}

function extractQuestionsFromCustomFields(customFields: Record<string, any>): any[] {
  const questions: any[] = [];
  // Skip these fields as they're not actual questions
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
  // Try multiple field names for campaign
  const campaignFields = ['Campaign Tracker', 'campaign', 'campaign_name', 'utm_campaign'];
  const adSetFields = ['Ad Set', 'ad_set', 'ad_set_name', 'adset_name'];
  const adIdFields = ['Ad ID', 'ad_id', 'adId'];
  
  let campaign_name: string | null = null;
  let ad_set_name: string | null = null;
  let ad_id: string | null = null;
  
  // Check custom fields first
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
  
  // Fallback to UTM campaign from attribution source
  if (!campaign_name && contact.attributionSource?.utm_campaign) {
    campaign_name = contact.attributionSource.utm_campaign;
  }
  
  return { campaign_name, ad_set_name, ad_id };
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
  
  // Extract UTMs from attribution
  const attribution = contact.attributionSource || {};
  
  // Check if lead already exists
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, updated_at')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle();

  const leadData = {
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

  if (existingLead) {
    // Update existing lead
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
    // Create new lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        ...leadData,
        status: 'new',
        is_spam: false,
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

async function syncClientContacts(
  supabase: any,
  client: { id: string; name: string; ghl_api_key: string; ghl_location_id: string }
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  
  console.log(`Starting GHL sync for client: ${client.name} (${client.id})`);
  
  let hasMore = true;
  let startAfterId: string | undefined;
  let totalProcessed = 0;
  const MAX_CONTACTS = 1000; // Safety limit per client

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

      // Check if there are more pages
      if (nextPageUrl && contacts.length === 100) {
        startAfterId = contacts[contacts.length - 1].id;
      } else {
        hasMore = false;
      }

      // Rate limiting - GHL has rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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
    // Parse optional client_id from request body
    let targetClientId: string | null = null;
    try {
      const body = await req.json();
      targetClientId = body?.client_id || null;
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

    console.log(`Starting GHL sync for ${clients.length} client(s)`);

    const results: Array<{
      client_id: string;
      client_name: string;
      created: number;
      updated: number;
      skipped: number;
      errors: string[];
    }> = [];

    for (const client of clients) {
      // Log sync start
      const { data: syncLog } = await supabase
        .from('sync_logs')
        .insert({
          client_id: client.id,
          sync_type: 'ghl_contacts',
          status: 'running',
        })
        .select('id')
        .single();

      const syncResult = await syncClientContacts(supabase, client as any);
      
      results.push({
        client_id: client.id,
        client_name: client.name,
        ...syncResult,
      });

      // Update sync log
      if (syncLog) {
        await supabase
          .from('sync_logs')
          .update({
            status: syncResult.errors.length > 0 ? 'partial' : 'success',
            records_synced: syncResult.created + syncResult.updated,
            error_message: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }
    }

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);

    console.log(`GHL sync complete: ${totalCreated} created, ${totalUpdated} updated across ${clients.length} clients`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          clients_synced: clients.length,
          total_created: totalCreated,
          total_updated: totalUpdated,
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
