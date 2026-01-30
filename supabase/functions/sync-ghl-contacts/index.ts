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

interface GHLOpportunity {
  id: string;
  contactId: string;
  status: string;
  monetaryValue?: number;
  monetary_value?: number;
  pipelineStageId?: string;
  pipelineStageName?: string;
  stageName?: string;
  dateAdded: string;
  lastStageChangeAt?: string;
}

interface GHLNote {
  id: string;
  body: string;
  userId?: string;
  dateAdded: string;
}

// Tag patterns that indicate a funded investor
const FUNDED_TAG_PATTERNS = [
  'funded',
  'funded investor',
  'fundedinvestor',
  'funded_investor',
  'active investor',
  'activeinvestor',
  'active_investor'
];

function hasFundedInvestorTag(contact: GHLContact): boolean {
  if (!contact.tags || !Array.isArray(contact.tags)) return false;
  
  return contact.tags.some(tag => 
    FUNDED_TAG_PATTERNS.some(pattern => 
      tag.toLowerCase().trim() === pattern ||
      tag.toLowerCase().includes(pattern)
    )
  );
}

function hasBadLeadTag(contact: GHLContact): boolean {
  if (!contact.tags || !Array.isArray(contact.tags)) return false;
  
  const badLeadPatterns = ['bad lead', 'badlead', 'bad_lead', 'bad-lead'];
  return contact.tags.some(tag => 
    badLeadPatterns.some(pattern => 
      tag.toLowerCase().includes(pattern)
    )
  );
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

async function fetchGHLOpportunities(
  apiKey: string,
  locationId: string
): Promise<GHLOpportunity[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const response = await fetch(
      `${GHL_BASE_URL}/opportunities/?locationId=${locationId}&limit=100`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      console.error(`GHL Opportunities API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.opportunities || [];
  } catch (err) {
    console.error('Error fetching GHL opportunities:', err);
    return [];
  }
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
      await new Promise(resolve => setTimeout(resolve, 300));
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
  const { data: existingCall } = await supabase
    .from('calls')
    .select('id, external_id, call_connected, recording_url')
    .eq('client_id', clientId)
    .or(`external_id.eq.${ghlCall.id},external_id.eq.${ghlCall.contactId}`)
    .maybeSingle();

  if (existingCall) {
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

function extractUtmFromQuestions(questions: any[]): {
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  filteredQuestions: any[];
} {
  const result: any = { filteredQuestions: [] };
  
  for (const q of questions) {
    const questionLower = String(q.question || '').toLowerCase().trim();
    
    if (questionLower.includes('utm_campaign') || questionLower === 'utm campaign' || 
        questionLower === 'utm campaign\t' || questionLower.includes('utm campaign')) {
      result.utm_campaign = q.answer;
    } 
    else if (questionLower.includes('utm_medium') || questionLower === 'utm medium' ||
             questionLower.includes('utm medium')) {
      result.utm_medium = q.answer;
    } 
    else if (questionLower.includes('utm_content') || questionLower === 'utm content' ||
             questionLower.includes('utm content')) {
      result.utm_content = q.answer;
    } 
    else if (questionLower.includes('utm_term') || questionLower === 'utm term' ||
             questionLower.includes('utm term')) {
      result.utm_term = q.answer;
    } 
    else {
      result.filteredQuestions.push(q);
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
  // GHL Page Details field names (from screenshot) + common variations
  // Priority order: GHL page details fields first, then common field names
  const campaignFields = [
    'Utm Campaign',      // GHL Page Details
    'utm_campaign',      // Standard
    'Campaign Tracker',  // Common custom field
    'campaign_name',
    'campaign',
    'Campaign Id',       // GHL Page Details (ID, can use as fallback)
  ];
  
  const adSetFields = [
    'Utm Medium',        // GHL stores Ad Set name in Utm Medium often
    'Adset Id',          // GHL Page Details
    'ad_set_name',
    'Ad Set',
    'ad_set',
    'adset_name',
    'adGroupName',
    'Ad Set Name',
  ];
  
  const adIdFields = [
    'Utm Content',       // GHL stores Ad name in Utm Content often
    'Ad Id',             // GHL Page Details
    'ad_id',
    'Ad ID',
    'adId',
  ];
  
  let campaign_name: string | null = null;
  let ad_set_name: string | null = null;
  let ad_id: string | null = null;
  
  // Check custom fields for campaign name
  for (const field of campaignFields) {
    if (customFields[field]) {
      campaign_name = String(customFields[field]);
      console.log(`Found campaign_name in field "${field}": ${campaign_name}`);
      break;
    }
  }
  
  // Check custom fields for ad set name  
  for (const field of adSetFields) {
    if (customFields[field]) {
      ad_set_name = String(customFields[field]);
      console.log(`Found ad_set_name in field "${field}": ${ad_set_name}`);
      break;
    }
  }
  
  // Check custom fields for ad ID/name
  for (const field of adIdFields) {
    if (customFields[field]) {
      ad_id = String(customFields[field]);
      console.log(`Found ad_id in field "${field}": ${ad_id}`);
      break;
    }
  }
  
  // Fallback to attributionSource
  if (!campaign_name && contact.attributionSource?.utm_campaign) {
    campaign_name = contact.attributionSource.utm_campaign;
    console.log(`Using attributionSource.utm_campaign: ${campaign_name}`);
  }
  
  if (!ad_set_name && contact.attributionSource?.utm_medium) {
    ad_set_name = contact.attributionSource.utm_medium;
    console.log(`Using attributionSource.utm_medium as ad_set: ${ad_set_name}`);
  }
  
  if (!ad_id && contact.attributionSource?.utm_content) {
    ad_id = contact.attributionSource.utm_content;
    console.log(`Using attributionSource.utm_content as ad_id: ${ad_id}`);
  }
  
  return { campaign_name, ad_set_name, ad_id };
}

// Extract pipeline value from contact custom fields or opportunities
function extractPipelineValue(contact: GHLContact, opportunity?: GHLOpportunity): number {
  // First check opportunity monetary value
  if (opportunity) {
    const oppValue = opportunity.monetaryValue ?? opportunity.monetary_value ?? 0;
    if (oppValue > 0) return oppValue;
  }
  
  // Check custom fields for capital/investment amounts
  const customFields = parseCustomFields(contact.customFields);
  for (const [key, value] of Object.entries(customFields)) {
    const keyLower = String(key).toLowerCase();
    if (keyLower.includes('capital') || keyLower.includes('deploy') || keyLower.includes('invest') || keyLower.includes('amount')) {
      const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (!isNaN(numValue) && numValue > 0) {
        return numValue;
      }
    }
  }
  
  return 0;
}

async function syncContactToDatabase(
  supabase: any,
  clientId: string,
  contact: GHLContact,
  opportunity?: GHLOpportunity
): Promise<{ action: 'created' | 'updated' | 'skipped'; leadId?: string }> {
  const externalId = contact.id;
  const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  const email = contact.email || null;
  const phone = contact.phone || null;
  
  const customFields = parseCustomFields(contact.customFields);
  const rawQuestions = extractQuestionsFromCustomFields(customFields);
  const utmFromQuestions = extractUtmFromQuestions(rawQuestions);
  const questions = utmFromQuestions.filteredQuestions;
  
  const campaignAttribution = extractCampaignAttribution(contact, customFields);
  
  const attribution = contact.attributionSource || {};
  
  const final_utm_campaign = attribution.utm_campaign || utmFromQuestions.utm_campaign;
  const final_utm_medium = attribution.utm_medium || utmFromQuestions.utm_medium;
  const final_utm_content = attribution.utm_content || utmFromQuestions.utm_content;
  const final_utm_term = attribution.utm_term || utmFromQuestions.utm_term;
  
  const isBadLead = hasBadLeadTag(contact);
  
  let existingLead = null;
  
  const { data: leadByExternalId } = await supabase
    .from('leads')
    .select('id, updated_at, is_spam, external_id, created_at')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle();
  
  if (leadByExternalId) {
    existingLead = leadByExternalId;
  } else if (email) {
    const { data: leadByEmail } = await supabase
      .from('leads')
      .select('id, updated_at, is_spam, external_id, created_at')
      .eq('client_id', clientId)
      .eq('email', email)
      .maybeSingle();
    
    if (leadByEmail) {
      existingLead = leadByEmail;
      console.log(`Matched GHL contact ${externalId} to existing lead ${leadByEmail.id} by email: ${email}`);
    }
  }
  
  if (!existingLead && phone) {
    const { data: leadByPhone } = await supabase
      .from('leads')
      .select('id, updated_at, is_spam, external_id, created_at')
      .eq('client_id', clientId)
      .eq('phone', phone)
      .maybeSingle();
    
    if (leadByPhone) {
      existingLead = leadByPhone;
      console.log(`Matched GHL contact ${externalId} to existing lead ${leadByPhone.id} by phone: ${phone}`);
    }
  }

  // Use GHL dateAdded for lead creation date if creating new lead
  let ghlCreatedAt = new Date().toISOString();
  if (contact.dateAdded) {
    try {
      const parsedDate = new Date(contact.dateAdded);
      if (!isNaN(parsedDate.getTime())) {
        ghlCreatedAt = parsedDate.toISOString();
        console.log(`Using GHL dateAdded for contact ${externalId}: ${contact.dateAdded} -> ${ghlCreatedAt}`);
      }
    } catch (e) {
      console.error(`Failed to parse GHL dateAdded for contact ${externalId}: ${contact.dateAdded}`);
    }
  } else {
    console.log(`No dateAdded for contact ${externalId}, using current time`);
  }

  // Extract opportunity data if available
  const opportunityStatus = opportunity?.status || null;
  const opportunityStage = opportunity?.stageName || opportunity?.pipelineStageName || null;
  const opportunityStageId = opportunity?.pipelineStageId || null;
  const opportunityValue = opportunity?.monetaryValue ?? opportunity?.monetary_value ?? 0;

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
    utm_medium: final_utm_medium || null,
    utm_campaign: final_utm_campaign || null,
    utm_content: final_utm_content || null,
    utm_term: final_utm_term || null,
    campaign_name: campaignAttribution.campaign_name,
    ad_set_name: campaignAttribution.ad_set_name,
    ad_id: campaignAttribution.ad_id,
    opportunity_status: opportunityStatus,
    opportunity_stage: opportunityStage,
    opportunity_stage_id: opportunityStageId,
    opportunity_value: opportunityValue,
    updated_at: new Date().toISOString(),
  };

  if (isBadLead) {
    leadData.is_spam = true;
    console.log(`Marking contact ${externalId} as bad lead (tag detected)`);
  }

  if (existingLead) {
    const updateData: Record<string, any> = {
      name: name || undefined,
      custom_fields: customFields,
      questions: questions.length > 0 ? questions : undefined,
      utm_source: attribution.utm_source || undefined,
      utm_medium: final_utm_medium || undefined,
      utm_campaign: final_utm_campaign || undefined,
      utm_content: final_utm_content || undefined,
      utm_term: final_utm_term || undefined,
      campaign_name: campaignAttribution.campaign_name || undefined,
      ad_set_name: campaignAttribution.ad_set_name || undefined,
      ad_id: campaignAttribution.ad_id || undefined,
      opportunity_status: opportunityStatus || undefined,
      opportunity_stage: opportunityStage || undefined,
      opportunity_stage_id: opportunityStageId || undefined,
      opportunity_value: opportunityValue > 0 ? opportunityValue : undefined,
      updated_at: new Date().toISOString(),
    };
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    if (isBadLead) {
      updateData.is_spam = true;
    }
    
    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', existingLead.id);

    if (error) {
      console.error(`Failed to update lead ${existingLead.id}:`, error);
      return { action: 'skipped' };
    }
    return { action: 'updated', leadId: existingLead.id };
  } else {
    // Use GHL dateAdded as created_at for new leads
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        ...leadData,
        status: 'new',
        is_spam: isBadLead,
        created_at: ghlCreatedAt,
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

async function createFundedInvestorFromContact(
  supabase: any,
  clientId: string,
  contact: GHLContact,
  leadId: string | null,
  opportunity?: GHLOpportunity
): Promise<boolean> {
  const externalId = contact.id;
  
  // Check if already exists
  const { data: existingFunded } = await supabase
    .from('funded_investors')
    .select('id')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle();
  
  if (existingFunded) {
    return false; // Already exists
  }
  
  // Extract funded amount from opportunity or contact custom fields
  const fundedAmount = extractPipelineValue(contact, opportunity);
  
  // Determine funded date - prefer opportunity's lastStageChangeAt, then contact's dateUpdated
  let fundedAt = new Date().toISOString();
  if (opportunity?.lastStageChangeAt) {
    fundedAt = opportunity.lastStageChangeAt;
  } else if (contact.dateUpdated) {
    fundedAt = contact.dateUpdated;
  } else if (opportunity?.dateAdded) {
    fundedAt = opportunity.dateAdded;
  }
  
  // Get lead creation date for first_contact_at
  let firstContactAt: string | null = null;
  let timeToFundDays: number | null = null;
  let callsToFund = 0;
  
  if (leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('created_at')
      .eq('id', leadId)
      .maybeSingle();
    
    if (lead?.created_at) {
      firstContactAt = lead.created_at;
      const leadDate = new Date(lead.created_at);
      const fundDate = new Date(fundedAt);
      timeToFundDays = Math.floor((fundDate.getTime() - leadDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    const { count } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId);
    callsToFund = count || 0;
  }
  
  const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  
  const { error } = await supabase.from('funded_investors').insert({
    client_id: clientId,
    external_id: externalId,
    name,
    lead_id: leadId,
    funded_amount: fundedAmount,
    funded_at: fundedAt,
    first_contact_at: firstContactAt,
    time_to_fund_days: timeToFundDays,
    calls_to_fund: callsToFund,
    source: 'tag_sync',
  });
  
  if (error) {
    console.error(`Failed to create funded investor for contact ${externalId}:`, error);
    return false;
  }
  
  console.log(`Created funded investor from tag: ${name} ($${fundedAmount})`);
  return true;
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
    const { count: webhookCount } = await supabase
      .from('webhook_logs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('webhook_type', 'lead')
      .eq('status', 'success')
      .gte('processed_at', yesterday.toISOString());
    
    const { count: dbCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', yesterday.toISOString());
    
    const webhookNum = webhookCount || 0;
    const dbNum = dbCount || 0;
    const difference = Math.abs(webhookNum - dbNum);
    const percentDiff = dbNum > 0 ? (difference / dbNum) * 100 : (webhookNum > 0 ? 100 : 0);
    
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
  syncLogId?: string,
  sinceDateDays?: number
): Promise<{ created: number; updated: number; skipped: number; fundedFromTags: number; errors: string[]; totalApiContacts: number; contactsInDateRange: number }> {
  const result = { created: 0, updated: 0, skipped: 0, fundedFromTags: 0, errors: [] as string[], totalApiContacts: 0, contactsInDateRange: 0 };
  
  console.log(`Starting GHL sync for client: ${client.name} (${client.id}), sinceDateDays: ${sinceDateDays || 'all'}`);
  
  // Fetch opportunities to match with contacts for funded investor creation
  const opportunities = await fetchGHLOpportunities(client.ghl_api_key, client.ghl_location_id);
  const opportunityByContactId = new Map<string, GHLOpportunity>();
  for (const opp of opportunities) {
    if (opp.contactId) {
      opportunityByContactId.set(opp.contactId, opp);
    }
  }
  console.log(`Fetched ${opportunities.length} opportunities for ${client.name}`);
  
  let hasMore = true;
  let startAfterId: string | undefined;
  let totalProcessed = 0;
  const MAX_CONTACTS = 1000;
  
  // Calculate cutoff date if sinceDateDays is specified
  const cutoffDate = sinceDateDays ? new Date(Date.now() - sinceDateDays * 24 * 60 * 60 * 1000) : null;
  
  // For discrepancy detection: count contacts added in last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  let contactsInLast24h = 0;

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
        // Track contacts added in last 24 hours for accurate discrepancy detection
        if (contact.dateAdded) {
          const contactDate = new Date(contact.dateAdded);
          if (contactDate >= yesterday) {
            contactsInLast24h++;
          }
        }
        
        // If sinceDateDays is set and contact is older than cutoff, skip (but count for total)
        if (cutoffDate && contact.dateAdded) {
          const contactDate = new Date(contact.dateAdded);
          if (contactDate < cutoffDate) {
            result.skipped++;
            totalProcessed++;
            continue;
          }
        }
        
        try {
          // Get opportunity for this contact to sync opportunity data
          const contactOpportunity = opportunityByContactId.get(contact.id);
          const syncResult = await syncContactToDatabase(supabase, client.id, contact, contactOpportunity);
          if (syncResult.action === 'created') result.created++;
          else if (syncResult.action === 'updated') result.updated++;
          else result.skipped++;
          
          // Check if contact has funded investor tag
          if (hasFundedInvestorTag(contact)) {
            const opp = opportunityByContactId.get(contact.id);
            const created = await createFundedInvestorFromContact(
              supabase, 
              client.id, 
              contact, 
              syncResult.leadId || null,
              opp
            );
            if (created) result.fundedFromTags++;
          }
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
    
    result.totalApiContacts = totalProcessed;
    result.contactsInDateRange = contactsInLast24h;
    
    // Use contactsInLast24h for discrepancy detection (not totalProcessed which could be 1000)
    await detectDiscrepancies(supabase, client.id, contactsInLast24h, syncLogId);
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Sync failed: ${errorMsg}`);
    console.error(`GHL sync error for ${client.name}:`, errorMsg);
  }

  console.log(`GHL sync complete for ${client.name}: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, fundedFromTags=${result.fundedFromTags}, contactsInLast24h=${contactsInLast24h}`);
  return result;
}

// Fetch a single contact from GHL by ID
async function fetchSingleGHLContact(
  apiKey: string,
  contactId: string
): Promise<GHLContact | null> {
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
      console.error(`GHL single contact fetch error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.contact || null;
  } catch (err) {
    console.error('Error fetching single GHL contact:', err);
    return null;
  }
}

// Fetch notes for a GHL contact
async function fetchGHLNotes(
  apiKey: string,
  contactId: string
): Promise<GHLNote[]> {
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
    
    if (!response.ok) {
      console.error(`GHL notes fetch error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.notes || [];
  } catch (err) {
    console.error('Error fetching GHL notes:', err);
    return [];
  }
}

// Fetch tasks for a GHL contact
async function fetchGHLTasks(
  apiKey: string,
  contactId: string
): Promise<any[]> {
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
    
    if (!response.ok) {
      console.error(`GHL tasks fetch error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.tasks || [];
  } catch (err) {
    console.error('Error fetching GHL tasks:', err);
    return [];
  }
}

// Fetch appointments for a GHL contact
async function fetchGHLAppointments(
  apiKey: string,
  contactId: string
): Promise<any[]> {
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
    
    if (!response.ok) {
      console.error(`GHL appointments fetch error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.appointments || data.events || [];
  } catch (err) {
    console.error('Error fetching GHL appointments:', err);
    return [];
  }
}

// Fetch conversation messages for a GHL contact (SMS, Email, Call logs)
async function fetchGHLConversationMessages(
  apiKey: string,
  locationId: string,
  contactId: string
): Promise<any[]> {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const messages: any[] = [];

  try {
    // Search for conversations with this contact
    const searchResponse = await fetch(
      `${GHL_BASE_URL}/conversations/search?locationId=${locationId}&contactId=${contactId}`, 
      { method: 'GET', headers }
    );
    
    if (!searchResponse.ok) {
      console.error(`GHL conversations search error: ${searchResponse.status}`);
      return [];
    }

    const searchData = await searchResponse.json();
    const conversations = searchData.conversations || [];

    // For each conversation, get the messages
    for (const conv of conversations.slice(0, 5)) { // Limit to 5 conversations
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
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (err) {
    console.error('Error fetching GHL conversations:', err);
  }

  return messages;
}

// Handle single contact sync mode
async function syncSingleContact(
  supabase: any,
  clientId: string,
  contactId: string,
  apiKey: string
): Promise<{ success: boolean; contact?: any; notes?: GHLNote[]; error?: string }> {
  console.log(`Single contact sync: fetching contact ${contactId} for client ${clientId}`);
  
  const contact = await fetchSingleGHLContact(apiKey, contactId);
  
  if (!contact) {
    return { success: false, error: 'Contact not found in GHL' };
  }
  
  console.log(`Found GHL contact: ${contact.name || contact.firstName || 'Unknown'}`);
  
  // Fetch notes for this contact
  const notes = await fetchGHLNotes(apiKey, contactId);
  console.log(`Fetched ${notes.length} notes for contact ${contactId}`);
  
  // Sync the contact to database
  const syncResult = await syncContactToDatabase(supabase, clientId, contact);
  
  // Update ghl_synced_at timestamp and ghl_notes for lead
  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update({ 
      ghl_synced_at: new Date().toISOString(),
      ghl_notes: notes.length > 0 ? notes : []
    })
    .eq('client_id', clientId)
    .eq('external_id', contactId)
    .select('id, name, ghl_synced_at, ghl_notes')
    .maybeSingle();
  
  if (updateError) {
    console.error('Error updating lead with sync data:', updateError);
  }
  
  // Also update any calls associated with this contact
  await supabase
    .from('calls')
    .update({ ghl_synced_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .or(`external_id.eq.${contactId},lead_id.eq.${updatedLead?.id || ''}`);
  
  console.log(`Single contact sync complete: ${syncResult.action}, notes: ${notes.length}`);
  
  return { 
    success: true, 
    contact: updatedLead || { 
      id: syncResult.leadId, 
      name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      ghl_synced_at: new Date().toISOString(),
      ghl_notes: notes
    },
    notes
  };
}

// Handle deep sync mode - pulls full timeline history for a contact
async function syncContactDeepTimeline(
  supabase: any,
  clientId: string,
  contactId: string,
  apiKey: string,
  locationId: string
): Promise<{ success: boolean; events_count: number; error?: string }> {
  console.log(`Deep timeline sync: fetching full history for contact ${contactId}`);
  
  let eventsCount = 0;
  
  try {
    // Fetch all data in parallel
    const [notes, tasks, appointments, messages] = await Promise.all([
      fetchGHLNotes(apiKey, contactId),
      fetchGHLTasks(apiKey, contactId),
      fetchGHLAppointments(apiKey, contactId),
      fetchGHLConversationMessages(apiKey, locationId, contactId),
    ]);
    
    console.log(`Fetched: ${notes.length} notes, ${tasks.length} tasks, ${appointments.length} appointments, ${messages.length} messages`);
    
    // Get lead_id if exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', clientId)
      .eq('external_id', contactId)
      .maybeSingle();
    
    const leadId = lead?.id || null;
    
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
        event_subtype: task.status || task.completed ? 'completed' : 'pending',
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
        event_at: appt.startTime || appt.selectedTimezone || appt.dateAdded || new Date().toISOString(),
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
    
    // Insert all events in batches
    if (timelineEvents.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < timelineEvents.length; i += batchSize) {
        const batch = timelineEvents.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('contact_timeline_events')
          .insert(batch);
        
        if (insertError) {
          console.error('Error inserting timeline events batch:', insertError);
        } else {
          eventsCount += batch.length;
        }
      }
    }
    
    console.log(`Deep timeline sync complete: ${eventsCount} events stored`);
    
    return { success: true, events_count: eventsCount };
  } catch (err) {
    console.error('Error in deep timeline sync:', err);
    return { 
      success: false, 
      events_count: eventsCount,
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
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
    let sinceDateDays: number | undefined;
    let singleContactId: string | null = null;
    let mode: string | null = null;
    
    try {
      const body = await req.json();
      targetClientId = body?.client_id || null;
      syncType = body?.syncType || 'all';
      singleContactId = body?.contactId || null;
      mode = body?.mode || null;
      // Support historical sync with sinceDateDays parameter (default: 7, max: 365)
      if (body?.sinceDateDays) {
        sinceDateDays = Math.min(Math.max(parseInt(body.sinceDateDays) || 7, 1), 365);
      }
    } catch {
      // No body or invalid JSON - sync all clients
    }
    
    // Handle single contact sync mode
    if (mode === 'single' && singleContactId && targetClientId) {
      console.log(`Single contact sync mode: contactId=${singleContactId}, clientId=${targetClientId}`);
      
      // Fetch client's GHL credentials
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, name, ghl_api_key, ghl_location_id')
        .eq('id', targetClientId)
        .maybeSingle();
      
      if (clientError || !client) {
        return new Response(
          JSON.stringify({ success: false, error: 'Client not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!client.ghl_api_key || !client.ghl_location_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Client has no GHL credentials configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const result = await syncSingleContact(supabase, targetClientId, singleContactId, client.ghl_api_key);
      
      return new Response(
        JSON.stringify(result),
        { 
          status: result.success ? 200 : 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Handle deep sync mode - pulls full timeline history for a contact
    if (mode === 'deep_sync' && targetClientId) {
      const contactIdForDeepSync = singleContactId;
      // Also accept contact_id parameter
      let deepSyncContactId = contactIdForDeepSync;
      try {
        const body = await req.clone().json();
        deepSyncContactId = body?.contact_id || contactIdForDeepSync;
      } catch {}
      
      if (!deepSyncContactId) {
        return new Response(
          JSON.stringify({ success: false, error: 'contact_id is required for deep_sync mode' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Deep sync mode: contactId=${deepSyncContactId}, clientId=${targetClientId}`);
      
      // Fetch client's GHL credentials
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, name, ghl_api_key, ghl_location_id')
        .eq('id', targetClientId)
        .maybeSingle();
      
      if (clientError || !client) {
        return new Response(
          JSON.stringify({ success: false, error: 'Client not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!client.ghl_api_key || !client.ghl_location_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Client has no GHL credentials configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const result = await syncContactDeepTimeline(
        supabase, 
        targetClientId, 
        deepSyncContactId, 
        client.ghl_api_key,
        client.ghl_location_id
      );
      
      return new Response(
        JSON.stringify(result),
        { 
          status: result.success ? 200 : 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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

    console.log(`Starting GHL ${syncType} sync for ${clients.length} client(s), sinceDateDays: ${sinceDateDays || 'default'}`);

    const results: Array<{
      client_id: string;
      client_name: string;
      contacts?: { created: number; updated: number; skipped: number; fundedFromTags: number; errors: string[] };
      calls?: { enriched: number; skipped: number; errors: string[] };
    }> = [];

    // Use sinceDateDays for calls if provided, otherwise default to 7 days
    const callsSinceDate = new Date();
    callsSinceDate.setDate(callsSinceDate.getDate() - (sinceDateDays || 7));

    for (const client of clients) {
      const clientResult: typeof results[0] = {
        client_id: client.id,
        client_name: client.name,
      };

      const { data: syncLog } = await supabase
        .from('sync_logs')
        .insert({
          client_id: client.id,
          sync_type: syncType === 'calls' ? 'ghl_calls' : 'ghl_contacts',
          status: 'running',
        })
        .select('id')
        .single();

      if (syncType === 'contacts' || syncType === 'all') {
        clientResult.contacts = await syncClientContacts(supabase, client as any, syncLog?.id, sinceDateDays);
        
        await supabase
          .from('client_settings')
          .update({ ghl_last_contacts_sync: new Date().toISOString() })
          .eq('client_id', client.id);
      }

      if (syncType === 'calls' || syncType === 'all') {
        clientResult.calls = await syncClientCallLogs(supabase, client as any, callsSinceDate);
        
        await supabase
          .from('client_settings')
          .update({ ghl_last_calls_sync: new Date().toISOString() })
          .eq('client_id', client.id);
      }

      results.push(clientResult);

      if (syncLog) {
        const hasErrors = (clientResult.contacts?.errors?.length || 0) > 0 || 
                         (clientResult.calls?.errors?.length || 0) > 0;
        const recordsSynced = (clientResult.contacts?.created || 0) + 
                             (clientResult.contacts?.updated || 0) +
                             (clientResult.contacts?.fundedFromTags || 0) +
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
    const totalFundedFromTags = results.reduce((sum, r) => sum + (r.contacts?.fundedFromTags || 0), 0);
    const totalCallsEnriched = results.reduce((sum, r) => sum + (r.calls?.enriched || 0), 0);

    console.log(`GHL sync complete: ${totalContactsCreated} contacts created, ${totalContactsUpdated} updated, ${totalFundedFromTags} funded from tags, ${totalCallsEnriched} calls enriched`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          clients_synced: clients.length,
          total_contacts_created: totalContactsCreated,
          total_contacts_updated: totalContactsUpdated,
          total_funded_from_tags: totalFundedFromTags,
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
