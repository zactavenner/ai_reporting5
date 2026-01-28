import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to extract value from nested object using dot notation
function getValueByPath(obj: any, path: string): any {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      current = current[part];
    }
  }
  return current;
}

// Try multiple paths to extract a value
function tryExtractValue(payload: any, paths: string[], directKeys: string[] = []): any {
  // Check direct keys first
  for (const key of directKeys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  // Then try paths
  for (const path of paths) {
    const val = getValueByPath(payload, path);
    if (val !== undefined && val !== null) return val;
  }
  return null;
}

// Find existing lead by contact ID, phone, or email (priority: ID > phone > email)
async function findExistingLead(supabase: any, clientId: string, externalId: string | null, phone: string | null, email: string | null) {
  // Try by external_id first
  if (externalId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, external_id, created_at')
      .eq('client_id', clientId)
      .eq('external_id', String(externalId))
      .maybeSingle();
    if (lead) return lead;
  }
  
  // Try by phone
  if (phone) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const { data: lead } = await supabase
      .from('leads')
      .select('id, external_id, created_at')
      .eq('client_id', clientId)
      .or(`phone.eq.${phone},phone.ilike.%${normalizedPhone}%`)
      .limit(1)
      .maybeSingle();
    if (lead) return lead;
  }
  
  // Try by email
  if (email) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, external_id, created_at')
      .eq('client_id', clientId)
      .ilike('email', email)
      .maybeSingle();
    if (lead) return lead;
  }
  
  return null;
}

// Extract UTM values from questions array and return filtered questions
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
    
    // Check for UTM Campaign variations
    if (questionLower.includes('utm_campaign') || questionLower === 'utm campaign' || 
        questionLower === 'utm campaign\t' || questionLower.includes('utm campaign')) {
      result.utm_campaign = q.answer;
    } 
    // Check for UTM Medium variations
    else if (questionLower.includes('utm_medium') || questionLower === 'utm medium' ||
             questionLower.includes('utm medium')) {
      result.utm_medium = q.answer;
    } 
    // Check for UTM Content variations
    else if (questionLower.includes('utm_content') || questionLower === 'utm content' ||
             questionLower.includes('utm content')) {
      result.utm_content = q.answer;
    } 
    // Check for UTM Term variations
    else if (questionLower.includes('utm_term') || questionLower === 'utm term' ||
             questionLower.includes('utm term')) {
      result.utm_term = q.answer;
    } 
    // Keep non-UTM questions
    else {
      result.filteredQuestions.push(q);
    }
  }
  
  return result;
}

// Extract all questions/form responses from payload
// In GHL, survey/form questions are often at the ROOT level of the payload
function extractQuestions(payload: any): any[] {
  const questions: any[] = [];
  
  // Common field names to EXCLUDE from questions (these are contact/system fields)
  const excludedFields = new Set([
    'id', 'contact_id', 'contactId', 'first_name', 'last_name', 'full_name', 'name',
    'email', 'phone', 'tags', 'state', 'country', 'city', 'address', 'postalCode',
    'timezone', 'date_created', 'contact_source', 'full_address', 'contact_type',
    'location', 'user', 'calendar', 'workflow', 'appointment', 'opportunity',
    'source', 'medium', 'campaign', 'content', 'term', 'referrer',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'campaign_name', 'ad_set_name', 'ad_id', 'adCampaign', 'adSet', 'ad',
    'dnd', 'ssn', 'gender', 'dateOfBirth', 'website', 'company', 'attribution',
    'customFields', 'custom_fields', 'formSubmission', 'form', 'questions',
    'pipeline', 'pipelineStage', 'pipelineId', 'pipelineStageId',
    // Campaign tracking fields to exclude
    'Campaign Tracker', 'Date Contact Created',
  ]);
  
  // First, extract ROOT-LEVEL questions (GHL sends survey responses at root level)
  for (const [key, value] of Object.entries(payload)) {
    // Skip excluded fields and empty values
    if (excludedFields.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    // Skip objects and arrays (these are nested structures, not question answers)
    if (typeof value === 'object') continue;
    
    // This is likely a question/survey response
    questions.push({
      question: key,
      answer: value,
      source: 'root'
    });
  }
  
  // Extract from customFields
  const customFields = payload.customFields || payload.contact?.customFields || payload.custom_fields || {};
  for (const [key, value] of Object.entries(customFields)) {
    if (value !== null && value !== undefined && value !== '') {
      questions.push({
        question: key,
        answer: value,
        source: 'customFields'
      });
    }
  }
  
  // Extract from formSubmission/form
  if (payload.formSubmission || payload.form) {
    const form = payload.formSubmission || payload.form;
    if (form.responses || form.fields) {
      const responses = form.responses || form.fields;
      for (const [key, value] of Object.entries(responses)) {
        if (value !== null && value !== undefined && value !== '') {
          questions.push({
            question: key,
            answer: value,
            source: 'form'
          });
        }
      }
    }
    // Handle questions array format
    if (form.questions && Array.isArray(form.questions)) {
      form.questions.forEach((q: any) => {
        questions.push({
          question: q.label || q.question || q.name || 'Unknown Question',
          answer: q.answer || q.value || q.response || '',
          source: 'form'
        });
      });
    }
  }
  
  // Extract from opportunity custom fields
  if (payload.opportunity?.customFields) {
    for (const [key, value] of Object.entries(payload.opportunity.customFields)) {
      if (value !== null && value !== undefined && value !== '') {
        questions.push({
          question: key,
          answer: value,
          source: 'opportunity'
        });
      }
    }
  }
  
  // Extract from contact.questions array (GHL format)
  if (payload.contact?.questions && Array.isArray(payload.contact.questions)) {
    payload.contact.questions.forEach((q: any) => {
      questions.push({
        question: q.label || q.question || q.name || 'Unknown Question',
        answer: q.answer || q.value || q.response || '',
        source: 'contact'
      });
    });
  }
  
  // Extract from root level questions array
  if (payload.questions && Array.isArray(payload.questions)) {
    payload.questions.forEach((q: any) => {
      questions.push({
        question: q.label || q.question || q.name || 'Unknown Question',
        answer: q.answer || q.value || q.response || '',
        source: 'root_array'
      });
    });
  }
  
  return questions;
}

// Sync contact data back to GHL
async function syncContactToGHL(
  ghlApiKey: string,
  ghlLocationId: string,
  contactId: string,
  contactData: {
    name?: string;
    email?: string;
    phone?: string;
    customFields?: Record<string, any>;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!ghlApiKey || !ghlLocationId || !contactId) {
    console.log('Missing GHL credentials or contact ID for sync');
    return { success: false, error: 'Missing GHL credentials or contact ID' };
  }

  // Skip if contactId looks like a generated webhook ID
  if (contactId.startsWith('wh_')) {
    console.log('Skipping GHL sync for webhook-generated contact ID');
    return { success: false, error: 'Generated contact ID, not a GHL contact' };
  }

  try {
    const baseUrl = 'https://services.leadconnectorhq.com';
    const headers = {
      'Authorization': `Bearer ${ghlApiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Build update payload - only include fields that have values
    const updatePayload: Record<string, any> = {};
    
    if (contactData.name) {
      const nameParts = contactData.name.split(' ');
      updatePayload.firstName = nameParts[0] || '';
      updatePayload.lastName = nameParts.slice(1).join(' ') || '';
    }
    if (contactData.email) updatePayload.email = contactData.email;
    if (contactData.phone) updatePayload.phone = contactData.phone;
    
    // Add custom fields if present
    if (contactData.customFields && Object.keys(contactData.customFields).length > 0) {
      updatePayload.customFields = contactData.customFields;
    }

    // Only proceed if we have something to update
    if (Object.keys(updatePayload).length === 0) {
      console.log('No contact data to sync to GHL');
      return { success: true };
    }

    console.log(`Syncing contact ${contactId} to GHL:`, JSON.stringify(updatePayload).substring(0, 500));

    const response = await fetch(
      `${baseUrl}/contacts/${contactId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatePayload),
      }
    );

    if (response.ok) {
      console.log(`Successfully synced contact ${contactId} to GHL`);
      return { success: true };
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('GHL contact sync failed:', errorData);
      return { success: false, error: errorData.message || `HTTP ${response.status}` };
    }
  } catch (error: unknown) {
    console.error('GHL sync error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const clientId = pathParts[1];
    const webhookType = pathParts[2];

    if (!clientId || !webhookType) {
      return new Response(
        JSON.stringify({ error: 'Missing clientId or webhookType in URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, ghl_api_key, ghl_location_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ghlCredentials = {
      apiKey: client.ghl_api_key || null,
      locationId: client.ghl_location_id || null,
    };

    console.log(`Received ${webhookType} webhook for client ${client.name} (${clientId})`);
    console.log('GHL sync enabled:', !!(ghlCredentials.apiKey && ghlCredentials.locationId));
    console.log('Payload:', JSON.stringify(payload).substring(0, 2000));

    const { data: settings } = await supabase
      .from('client_settings')
      .select('webhook_mappings')
      .eq('client_id', clientId)
      .maybeSingle();

    const mappings = settings?.webhook_mappings?.[webhookType] || {};

    let result: any;
    switch (webhookType) {
      case 'lead':
        result = await processLead(supabase, clientId, payload, mappings, ghlCredentials);
        break;
      case 'booked':
        result = await processBookedCall(supabase, clientId, payload, mappings);
        break;
      case 'showed':
        result = await processShowedCall(supabase, clientId, payload, mappings);
        break;
      case 'reconnect':
        result = await processReconnectCall(supabase, clientId, payload, mappings, false);
        break;
      case 'reconnect-showed':
        result = await processReconnectCall(supabase, clientId, payload, mappings, true);
        break;
      case 'committed':
        result = await processCommitment(supabase, clientId, payload, mappings);
        break;
      case 'funded':
        result = await processFunded(supabase, clientId, payload, mappings);
        break;
      case 'ad-spend':
        result = await processAdSpend(supabase, clientId, payload, mappings);
        break;
      case 'bad-lead':
        result = await processBadLead(supabase, clientId, payload, mappings);
        break;
      case 'call':
        result = await processCall(supabase, clientId, payload, mappings);
        break;
      default:
        await logWebhook(supabase, clientId, webhookType, 'error', payload, `Unknown webhook type: ${webhookType}`);
        return new Response(
          JSON.stringify({ error: `Unknown webhook type: ${webhookType}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    await logWebhook(supabase, clientId, webhookType, 'success', payload, null);
    await updateDailyMetrics(supabase, clientId);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function logWebhook(supabase: any, clientId: string, webhookType: string, status: string, payload: any, errorMessage: string | null) {
  await supabase.from('webhook_logs').insert({
    client_id: clientId,
    webhook_type: webhookType,
    status,
    payload: payload ? JSON.stringify(payload).substring(0, 5000) : null,
    error_message: errorMessage,
  });
}

async function processLead(supabase: any, clientId: string, payload: any, mappings: any, ghlCredentials?: { apiKey: string | null; locationId: string | null }) {
  // GHL standard contact fields - try multiple paths
  const externalId = tryExtractValue(payload, ['contact.id', 'id', 'contactId'], ['id', 'contactId']) || `wh_${Date.now()}`;
  
  // Extract name - GHL sends first_name, last_name, full_name
  let name = mappings?.nameField ? getValueByPath(payload, mappings.nameField) : null;
  if (!name) {
    name = tryExtractValue(payload, ['full_name', 'contact.name', 'contact.full_name'], ['full_name', 'name']);
    if (!name) {
      const firstName = tryExtractValue(payload, ['first_name', 'contact.firstName'], ['first_name', 'firstName']) || '';
      const lastName = tryExtractValue(payload, ['last_name', 'contact.lastName'], ['last_name', 'lastName']) || '';
      name = `${firstName} ${lastName}`.trim() || 'Unknown';
    }
  }
  
  // Email and phone
  const email = mappings?.emailField ? getValueByPath(payload, mappings.emailField) 
    : tryExtractValue(payload, ['email', 'contact.email'], ['email']);
  const phone = mappings?.phoneField ? getValueByPath(payload, mappings.phoneField) 
    : tryExtractValue(payload, ['phone', 'contact.phone'], ['phone']);
  
  // Assigned user from GHL
  const assignedUser = tryExtractValue(payload, ['user.firstName', 'user.email'], []) 
    ? `${payload.user?.firstName || ''} ${payload.user?.lastName || ''}`.trim() || payload.user?.email 
    : null;

  // UTM parameters - GHL sends these at root level or in contact
  const utm_source = mappings?.utmSourceField ? getValueByPath(payload, mappings.utmSourceField) 
    : tryExtractValue(payload, ['contact_source', 'source', 'contact.attribution.utm_source'], ['utm_source', 'contact_source']);
  const utm_medium = mappings?.utmMediumField ? getValueByPath(payload, mappings.utmMediumField) 
    : tryExtractValue(payload, ['contact.attribution.utm_medium'], ['utm_medium']);
  const utm_campaign = mappings?.utmCampaignField ? getValueByPath(payload, mappings.utmCampaignField) 
    : tryExtractValue(payload, ['campaign.name', 'contact.attribution.utm_campaign'], ['utm_campaign']);
  const utm_content = mappings?.utmContentField ? getValueByPath(payload, mappings.utmContentField) 
    : tryExtractValue(payload, ['contact.attribution.utm_content'], ['utm_content']);
  const utm_term = mappings?.utmTermField ? getValueByPath(payload, mappings.utmTermField) 
    : tryExtractValue(payload, ['contact.attribution.utm_term'], ['utm_term']);

  // Campaign attribution fields from Meta/GHL
  // GHL often sends these as root-level fields OR in attribution object
  // Also check for "Campaign Tracker" which is a common GHL custom field name
  let campaign_name = tryExtractValue(payload, ['campaign.name', 'adCampaign.name', 'attribution.campaignName', 'attribution.campaign'], ['campaign_name', 'campaignName', 'Campaign Tracker', 'campaign']);
  let ad_set_name = tryExtractValue(payload, ['adSet.name', 'adGroup.name', 'attribution.adSetName', 'attribution.adSet'], ['ad_set_name', 'adSetName', 'adGroupName', 'Ad Set Name', 'adset_name']);
  let ad_id = tryExtractValue(payload, ['ad.id', 'adId', 'attribution.adId', 'attribution.ad'], ['ad_id', 'adId', 'Ad ID', 'ad']);
  
  // If still no campaign name, try to extract from contact_source for Meta leads
  if (!campaign_name) {
    const contactSource = payload.contact_source || payload.source || payload.contact?.source;
    if (contactSource && contactSource !== 'manual' && contactSource !== 'webhook') {
      campaign_name = contactSource;
    }
  }

  // Pipeline value from opportunity - check for "Capital to deploy" question answer
  let pipelineValue = mappings?.pipelineValueField 
    ? parseFloat(getValueByPath(payload, mappings.pipelineValueField)) || 0
    : parseFloat(tryExtractValue(payload, ['lead_value', 'opportunity.monetary_value'], ['lead_value', 'pipeline_value'])) || 0;
  
  // Try to extract from custom fields / questions like "Capital to deploy"
  const customFieldsRaw = payload.customFields || payload.contact?.customFields || payload.custom_fields || {};
  if (!pipelineValue) {
    for (const [key, value] of Object.entries(customFieldsRaw)) {
      const keyLower = String(key).toLowerCase();
      if (keyLower.includes('capital') || keyLower.includes('deploy') || keyLower.includes('invest')) {
        const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numValue) && numValue > 0) {
          pipelineValue = numValue;
          break;
        }
      }
    }
  }

// Extract all questions from the payload
  const rawQuestions = extractQuestions(payload);
  
  // Extract UTM values from questions and filter them out
  const utmFromQuestions = extractUtmFromQuestions(rawQuestions);
  const questions = utmFromQuestions.filteredQuestions;
  
  // Use UTM from questions as fallback if direct fields are empty
  const final_utm_campaign = utm_campaign || utmFromQuestions.utm_campaign;
  const final_utm_medium = utm_medium || utmFromQuestions.utm_medium;
  const final_utm_content = utm_content || utmFromQuestions.utm_content;
  const final_utm_term = utm_term || utmFromQuestions.utm_term;

  // Store all custom fields from the payload
  const customFields: Record<string, any> = {};
  
  // Collect custom fields from various possible locations in the payload
  for (const [key, value] of Object.entries(customFieldsRaw)) {
    if (value !== null && value !== undefined && value !== '') {
      customFields[key] = value;
    }
  }
  
  // Also capture opportunity/deal information
  if (payload.opportunity) {
    customFields['opportunity_name'] = payload.opportunity.name;
    customFields['opportunity_stage'] = payload.opportunity.pipelineStageId || payload.opportunity.stage || payload.opportunity.stageName;
    customFields['opportunity_value'] = payload.opportunity.monetary_value || payload.opportunity.monetaryValue;
    customFields['opportunity_status'] = payload.opportunity.status;
    customFields['opportunity_source'] = payload.opportunity.source;
    customFields['pipeline_id'] = payload.opportunity.pipelineId;
    customFields['pipeline_stage_id'] = payload.opportunity.pipelineStageId;
  }

  // Capture pipeline information from various locations
  if (payload.pipeline || payload.pipelineStage) {
    customFields['pipeline_name'] = payload.pipeline?.name || payload.pipelineName;
    customFields['pipeline_stage'] = payload.pipelineStage?.name || payload.pipelineStageName || payload.stage;
  }

  // Extract from workflow/automation data
  if (payload.workflow) {
    customFields['workflow_name'] = payload.workflow.name;
    customFields['workflow_id'] = payload.workflow.id;
  }

  // Extract calendar/appointment data
  if (payload.calendar || payload.appointment) {
    const cal = payload.calendar || payload.appointment;
    customFields['appointment_title'] = cal.title || cal.name;
    customFields['appointment_time'] = cal.startTime || cal.start_time;
    customFields['calendar_name'] = cal.calendarName || cal.calendar_name;
  }
  
  // Capture additional contact fields that might be useful
  const additionalFields = ['company', 'address', 'city', 'state', 'country', 'postalCode', 'website', 'tags', 'dnd', 'dateOfBirth', 'timezone', 'ssn', 'gender'];
  for (const field of additionalFields) {
    const value = payload[field] || payload.contact?.[field];
    if (value !== null && value !== undefined && value !== '') {
      customFields[field] = value;
    }
  }

  // Capture attribution data
  if (payload.attribution || payload.contact?.attribution) {
    const attr = payload.attribution || payload.contact?.attribution;
    customFields['attribution_source'] = attr.source || attr.utm_source;
    customFields['attribution_medium'] = attr.medium || attr.utm_medium;
    customFields['attribution_campaign'] = attr.campaign || attr.utm_campaign;
    customFields['referrer'] = attr.referrer;
    customFields['landing_page'] = attr.landingPage || attr.landing_page;
  }

  // Capture form/survey responses
  if (payload.formSubmission || payload.form) {
    const form = payload.formSubmission || payload.form;
    customFields['form_name'] = form.name || form.formName;
    if (form.responses || form.fields) {
      const responses = form.responses || form.fields;
      for (const [key, value] of Object.entries(responses)) {
        if (value !== null && value !== undefined && value !== '') {
          customFields[`form_${key}`] = value;
        }
      }
    }
  }

  // Check if email domain is blacklisted
  let is_spam = false;
  if (email) {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain) {
      const { data: blacklisted } = await supabase
        .from('spam_blacklist')
        .select('id')
        .eq('type', 'email_domain')
        .eq('value', emailDomain)
        .maybeSingle();
      
      if (blacklisted) {
        is_spam = true;
        console.log(`Lead marked as spam - blacklisted domain: ${emailDomain}`);
      }
    }
  }

  // Check for existing lead by ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, externalId, phone, email);

  const leadData = {
    client_id: clientId,
    external_id: existingLead?.external_id || String(externalId),
    source: 'webhook',
    name, email, phone, utm_source, 
    utm_medium: final_utm_medium, 
    utm_campaign: final_utm_campaign, 
    utm_content: final_utm_content, 
    utm_term: final_utm_term,
    campaign_name, ad_set_name, ad_id,
    pipeline_value: pipelineValue,
    assigned_user: assignedUser,
    status: 'new',
    is_spam,
    custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    questions: questions.length > 0 ? questions : null,
  };

  const { data, error } = await supabase
    .from('leads')
    .upsert(leadData, { onConflict: 'client_id,external_id,source', ignoreDuplicates: false })
    .select().single();

  if (error) throw error;

  // Sync contact info back to GHL if credentials are configured
  let ghlSyncResult = { success: false, synced: false };
  if (ghlCredentials?.apiKey && ghlCredentials?.locationId && externalId && !String(externalId).startsWith('wh_')) {
    const syncResult = await syncContactToGHL(
      ghlCredentials.apiKey,
      ghlCredentials.locationId,
      String(externalId),
      {
        name,
        email: email || undefined,
        phone: phone || undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      }
    );
    ghlSyncResult = { success: syncResult.success, synced: true };
  }

  return { 
    lead_id: data.id, 
    action: existingLead ? 'updated' : 'created', 
    name, email, phone, campaign_name, ad_set_name, ad_id, is_spam, 
    questions_count: questions.length,
    ghl_sync: ghlSyncResult,
  };
}

// New webhook type for inbound/outbound calls
async function processCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['call.id', 'id', 'callId'], ['id', 'callId']) || `wh_call_${Date.now()}`;
  const contactId = tryExtractValue(payload, ['contact.id', 'contactId', 'call.contactId'], ['contactId', 'contact_id']);
  const phone = tryExtractValue(payload, ['phone', 'contact.phone', 'call.to', 'call.from'], ['phone']);
  const email = tryExtractValue(payload, ['email', 'contact.email'], ['email']);
  
  // Determine call direction
  const direction = tryExtractValue(payload, ['call.direction', 'direction', 'type'], ['direction']) || 
    (payload.call?.type === 'inbound' || payload.type === 'inbound' ? 'inbound' : 'outbound');
  
  const recordingUrl = tryExtractValue(payload, ['call.recordingUrl', 'recording_url', 'recordingUrl'], ['recording_url', 'recordingUrl']);
  const duration = tryExtractValue(payload, ['call.duration', 'duration'], ['duration']);
  const outcome = tryExtractValue(payload, ['call.status', 'status', 'outcome'], ['outcome', 'status']) || 'completed';
  
  // Find existing lead by contact ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, contactId, phone, email);
  
  const callData = {
    client_id: clientId,
    external_id: String(externalId),
    lead_id: existingLead?.id || null,
    scheduled_at: new Date().toISOString(),
    showed: true,
    outcome,
    is_reconnect: false,
    direction,
    recording_url: recordingUrl || null,
    summary: duration ? `Duration: ${duration}s` : null,
  };

  const { data, error } = await supabase
    .from('calls')
    .upsert(callData, { onConflict: 'client_id,external_id', ignoreDuplicates: false })
    .select().single();

  if (error) throw error;
  return { call_id: data.id, action: 'created', direction, lead_matched: !!existingLead };
}

async function processBookedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'appointmentId']) || `wh_call_${Date.now()}`;
  const scheduledAt = tryExtractValue(payload, ['calendar.startTime', 'appointment.meta.start_time'], ['scheduled_at', 'startTime']) || new Date().toISOString();
  const contactId = tryExtractValue(payload, ['contact.id', 'appointment.contactId'], ['contactId', 'contact_id']);
  const phone = tryExtractValue(payload, ['phone', 'contact.phone'], ['phone']);
  const email = tryExtractValue(payload, ['email', 'contact.email'], ['email']);

  // Find existing lead by contact ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, contactId, phone, email);

  const { data, error } = await supabase.from('calls').upsert({
    client_id: clientId, external_id: String(externalId), lead_id: existingLead?.id || null,
    scheduled_at: scheduledAt, showed: false, outcome: 'booked', is_reconnect: false, direction: 'outbound',
  }, { onConflict: 'client_id,external_id', ignoreDuplicates: false }).select().single();

  if (error) throw error;
  return { call_id: data.id, action: 'booked', lead_matched: !!existingLead };
}

async function processReconnectCall(supabase: any, clientId: string, payload: any, mappings: any, isShowedWebhook: boolean = false) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'appointmentId']) || `wh_reconnect_${Date.now()}`;
  const scheduledAt = tryExtractValue(payload, ['calendar.startTime', 'appointment.meta.start_time'], ['scheduled_at', 'startTime']) || new Date().toISOString();
  const contactId = tryExtractValue(payload, ['contact.id', 'appointment.contactId'], ['contactId', 'contact_id']);
  const phone = tryExtractValue(payload, ['phone', 'contact.phone'], ['phone']);
  const email = tryExtractValue(payload, ['email', 'contact.email'], ['email']);
  
  // Determine showed status - if called via reconnect-showed endpoint, mark as showed
  const showed = isShowedWebhook || payload.calendar?.status === 'showed' || payload.showed === true;

  // Find existing lead by contact ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, contactId, phone, email);

  const { data, error } = await supabase.from('calls').upsert({
    client_id: clientId, external_id: String(externalId), lead_id: existingLead?.id || null,
    scheduled_at: scheduledAt, showed, outcome: showed ? 'reconnect_showed' : 'reconnect_booked', is_reconnect: true, direction: 'outbound',
  }, { onConflict: 'client_id,external_id', ignoreDuplicates: false }).select().single();

  if (error) throw error;
  return { call_id: data.id, action: isShowedWebhook ? 'reconnect_showed' : 'reconnect_booked', showed, lead_matched: !!existingLead };
}

async function processShowedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'call_id']);
  if (!externalId) throw new Error('Missing appointment/call ID');

  const { data } = await supabase.from('calls').update({ showed: true, outcome: 'showed' })
    .eq('client_id', clientId).eq('external_id', String(externalId)).select().maybeSingle();

  if (!data) {
    const { data: newCall, error } = await supabase.from('calls').insert({
      client_id: clientId, external_id: String(externalId), showed: true, outcome: 'showed', scheduled_at: new Date().toISOString(), direction: 'outbound',
    }).select().single();
    if (error) throw error;
    return { call_id: newCall.id, action: 'created_as_showed' };
  }
  return { call_id: data.id, action: 'marked_showed' };
}

async function processCommitment(supabase: any, clientId: string, payload: any, mappings: any) {
  const valueField = mappings?.valueField || 'lead_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || parseFloat(payload.lead_value) || 0;
  const today = new Date().toISOString().split('T')[0];
  
  const { data: existing } = await supabase.from('daily_metrics').select('commitments, commitment_dollars')
    .eq('client_id', clientId).eq('date', today).maybeSingle();

  await supabase.from('daily_metrics').upsert({
    client_id: clientId, date: today,
    commitments: (existing?.commitments || 0) + 1,
    commitment_dollars: (existing?.commitment_dollars || 0) + amount,
  }, { onConflict: 'client_id,date', ignoreDuplicates: false });

  return { commitments: (existing?.commitments || 0) + 1, amount };
}

async function processFunded(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['opportunity.id', 'id'], ['id']) || `wh_funded_${Date.now()}`;
  const valueField = mappings?.valueField || 'lead_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || parseFloat(payload.lead_value) || 0;
  const contactId = tryExtractValue(payload, ['contact.id', 'opportunity.contactId'], ['contactId']);
  const phone = tryExtractValue(payload, ['phone', 'contact.phone'], ['phone']);
  const email = tryExtractValue(payload, ['email', 'contact.email'], ['email']);
  const investorName = tryExtractValue(payload, ['full_name', 'opportunity.name', 'name'], ['name']);

  // Find existing lead by contact ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, contactId, phone, email);
  const leadId = existingLead?.id || null;
  const firstContactAt = existingLead?.created_at || null;

  let timeToFundDays = null;
  if (firstContactAt) {
    timeToFundDays = Math.floor((Date.now() - new Date(firstContactAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  let callsToFund = 0;
  if (leadId) {
    const { count } = await supabase.from('calls').select('*', { count: 'exact', head: true }).eq('lead_id', leadId);
    callsToFund = count || 0;
  }

  const { data, error } = await supabase.from('funded_investors').upsert({
    client_id: clientId, external_id: String(externalId), name: investorName, lead_id: leadId,
    funded_amount: amount, funded_at: new Date().toISOString(), first_contact_at: firstContactAt,
    time_to_fund_days: timeToFundDays, calls_to_fund: callsToFund,
  }, { onConflict: 'client_id,external_id', ignoreDuplicates: false }).select().single();

  if (error) throw error;
  return { funded_investor_id: data.id, amount, name: investorName, lead_matched: !!existingLead };
}

async function processAdSpend(supabase: any, clientId: string, payload: any, mappings: any) {
  console.log('Processing ad-spend webhook:', JSON.stringify(payload));
  
  const extractNumber = (value: any): number => {
    if (value === undefined || value === null) return 0;
    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  // Extract values - prioritize direct fields then mapped paths
  const spend = extractNumber(payload.spend ?? payload.ad_spend ?? payload.amount ?? payload.cost ?? 
    (mappings?.valueField ? getValueByPath(payload, mappings.valueField) : null));
  const date = payload.date ?? payload.report_date ?? (mappings?.dateField ? getValueByPath(payload, mappings.dateField) : null) ?? new Date().toISOString().split('T')[0];
  const impressions = extractNumber(payload.impressions ?? (mappings?.impressionsField ? getValueByPath(payload, mappings.impressionsField) : null));
  const clicks = extractNumber(payload.clicks ?? (mappings?.clicksField ? getValueByPath(payload, mappings.clicksField) : null));
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  
  // NEW: Extract time/reported_at for granular tracking
  const timeValue = payload.time ?? payload.reported_at ?? payload.report_time ?? null;
  const platform = payload.platform ?? 'meta';
  const campaignName = payload.campaign_name ?? payload.campaignName ?? null;
  const adSetName = payload.ad_set_name ?? payload.adSetName ?? null;
  
  // Build full timestamp: if time is provided, combine with date; otherwise use noon
  let reportedAt: string;
  if (timeValue) {
    // Check if time includes date already
    if (timeValue.includes('T') || timeValue.includes('-')) {
      reportedAt = new Date(timeValue).toISOString();
    } else {
      // Combine date + time
      reportedAt = new Date(`${date}T${timeValue}:00`).toISOString();
    }
  } else {
    // Default to noon of the date
    reportedAt = new Date(`${date}T12:00:00`).toISOString();
  }

  console.log('Extracted ad-spend values:', { date, spend, impressions, clicks, ctr, reportedAt, platform });

  // Insert into ad_spend_reports for granular time tracking
  if (spend > 0 || impressions > 0 || clicks > 0) {
    await supabase.from('ad_spend_reports').insert({
      client_id: clientId,
      reported_at: reportedAt,
      platform,
      spend,
      impressions,
      clicks,
      campaign_name: campaignName,
      ad_set_name: adSetName,
    });
  }

  // Also update daily_metrics for dashboard compatibility
  const { data: existing } = await supabase.from('daily_metrics').select('*').eq('client_id', clientId).eq('date', date).maybeSingle();

  await supabase.from('daily_metrics').upsert({
    client_id: clientId, date, ad_spend: spend, impressions: impressions || existing?.impressions || 0,
    clicks: clicks || existing?.clicks || 0, ctr: ctr || existing?.ctr || 0,
    leads: existing?.leads || 0, spam_leads: existing?.spam_leads || 0, calls: existing?.calls || 0,
    showed_calls: existing?.showed_calls || 0, funded_investors: existing?.funded_investors || 0,
    funded_dollars: existing?.funded_dollars || 0, commitments: existing?.commitments || 0,
    commitment_dollars: existing?.commitment_dollars || 0,
  }, { onConflict: 'client_id,date', ignoreDuplicates: false });

  return { date, spend, impressions, clicks, ctr, reported_at: reportedAt, platform };
}

async function processBadLead(supabase: any, clientId: string, payload: any, mappings: any) {
  const contactId = tryExtractValue(payload, ['contact.id', 'event.contact_id'], ['contact_id', 'id', 'contactId']);
  const phone = tryExtractValue(payload, ['phone', 'contact.phone'], ['phone']);
  const email = tryExtractValue(payload, ['email', 'contact.email'], ['email']);
  
  // Find existing lead by contact ID, phone, or email
  const existingLead = await findExistingLead(supabase, clientId, contactId, phone, email);
  
  if (!existingLead) throw new Error(`Lead not found with provided identifiers`);

  const { data, error } = await supabase.from('leads').update({ is_spam: true, status: 'bad_lead' })
    .eq('id', existingLead.id).select().maybeSingle();

  if (error) throw error;
  return { lead_id: data.id, action: 'marked_bad' };
}

async function updateDailyMetrics(supabase: any, clientId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  const [leadsResult, spamResult, callsResult, showedResult, reconnectResult, reconnectShowedResult, fundedResult] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_spam', true).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('showed', true).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_reconnect', true).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_reconnect', true).eq('showed', true).gte('created_at', today),
    supabase.from('funded_investors').select('funded_amount').eq('client_id', clientId).gte('created_at', today),
  ]);

  const { data: existing } = await supabase.from('daily_metrics').select('*').eq('client_id', clientId).eq('date', today).maybeSingle();

  await supabase.from('daily_metrics').upsert({
    client_id: clientId, date: today,
    leads: leadsResult.count || 0, spam_leads: spamResult.count || 0,
    calls: callsResult.count || 0, showed_calls: showedResult.count || 0,
    reconnect_calls: reconnectResult.count || 0, reconnect_showed: reconnectShowedResult.count || 0,
    funded_investors: fundedResult.data?.length || 0,
    funded_dollars: fundedResult.data?.reduce((sum: number, f: any) => sum + (f.funded_amount || 0), 0) || 0,
    ad_spend: existing?.ad_spend || 0, impressions: existing?.impressions || 0,
    clicks: existing?.clicks || 0, ctr: existing?.ctr || 0,
    commitments: existing?.commitments || 0, commitment_dollars: existing?.commitment_dollars || 0,
  }, { onConflict: 'client_id,date', ignoreDuplicates: false });
}