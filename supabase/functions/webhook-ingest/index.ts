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
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Received ${webhookType} webhook for client ${client.name} (${clientId})`);
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
        result = await processLead(supabase, clientId, payload, mappings);
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

async function processLead(supabase: any, clientId: string, payload: any, mappings: any) {
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

  // Pipeline value from opportunity - check for "Capital to deploy" question answer
  let pipelineValue = mappings?.pipelineValueField 
    ? parseFloat(getValueByPath(payload, mappings.pipelineValueField)) || 0
    : parseFloat(tryExtractValue(payload, ['lead_value', 'opportunity.monetary_value'], ['lead_value', 'pipeline_value'])) || 0;
  
  // Try to extract from custom fields / questions like "Capital to deploy"
  if (!pipelineValue) {
    const customFields = payload.customFields || payload.contact?.customFields || payload.custom_fields || {};
    for (const [key, value] of Object.entries(customFields)) {
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

  // Store all custom fields from the payload
  const customFields: Record<string, any> = {};
  
  // Collect custom fields from various possible locations in the payload
  const rawCustomFields = payload.customFields || payload.contact?.customFields || payload.custom_fields || {};
  for (const [key, value] of Object.entries(rawCustomFields)) {
    if (value !== null && value !== undefined && value !== '') {
      customFields[key] = value;
    }
  }
  
  // Also capture opportunity/deal information
  if (payload.opportunity) {
    customFields['opportunity_name'] = payload.opportunity.name;
    customFields['opportunity_stage'] = payload.opportunity.pipelineStageId || payload.opportunity.stage;
    customFields['opportunity_value'] = payload.opportunity.monetary_value;
  }
  
  // Capture additional contact fields that might be useful
  const additionalFields = ['company', 'address', 'city', 'state', 'country', 'postalCode', 'website', 'tags', 'dnd'];
  for (const field of additionalFields) {
    const value = payload[field] || payload.contact?.[field];
    if (value !== null && value !== undefined && value !== '') {
      customFields[field] = value;
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      source: 'webhook',
      name, email, phone, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      pipeline_value: pipelineValue,
      assigned_user: assignedUser,
      status: 'new',
      is_spam: false,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    }, { onConflict: 'client_id,external_id,source', ignoreDuplicates: false })
    .select().single();

  if (error) throw error;
  return { lead_id: data.id, action: 'upserted', name, email, phone };
}

async function processBookedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'appointmentId']) || `wh_call_${Date.now()}`;
  const scheduledAt = tryExtractValue(payload, ['calendar.startTime', 'appointment.meta.start_time'], ['scheduled_at', 'startTime']) || new Date().toISOString();
  const contactId = tryExtractValue(payload, ['contact.id', 'appointment.contactId'], ['contactId', 'contact_id']);

  let leadId = null;
  if (contactId) {
    const { data: lead } = await supabase.from('leads').select('id').eq('client_id', clientId).eq('external_id', String(contactId)).maybeSingle();
    leadId = lead?.id;
  }

  const { data, error } = await supabase.from('calls').upsert({
    client_id: clientId, external_id: String(externalId), lead_id: leadId,
    scheduled_at: scheduledAt, showed: false, outcome: 'booked', is_reconnect: false,
  }, { onConflict: 'client_id,external_id', ignoreDuplicates: false }).select().single();

  if (error) throw error;
  return { call_id: data.id, action: 'booked' };
}

async function processReconnectCall(supabase: any, clientId: string, payload: any, mappings: any, isShowedWebhook: boolean = false) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'appointmentId']) || `wh_reconnect_${Date.now()}`;
  const scheduledAt = tryExtractValue(payload, ['calendar.startTime', 'appointment.meta.start_time'], ['scheduled_at', 'startTime']) || new Date().toISOString();
  const contactId = tryExtractValue(payload, ['contact.id', 'appointment.contactId'], ['contactId', 'contact_id']);
  
  // Determine showed status - if called via reconnect-showed endpoint, mark as showed
  const showed = isShowedWebhook || payload.calendar?.status === 'showed' || payload.showed === true;

  let leadId = null;
  if (contactId) {
    const { data: lead } = await supabase.from('leads').select('id').eq('client_id', clientId).eq('external_id', String(contactId)).maybeSingle();
    leadId = lead?.id;
  }

  const { data, error } = await supabase.from('calls').upsert({
    client_id: clientId, external_id: String(externalId), lead_id: leadId,
    scheduled_at: scheduledAt, showed, outcome: showed ? 'reconnect_showed' : 'reconnect_booked', is_reconnect: true,
  }, { onConflict: 'client_id,external_id', ignoreDuplicates: false }).select().single();

  if (error) throw error;
  return { call_id: data.id, action: isShowedWebhook ? 'reconnect_showed' : 'reconnect_booked', showed };
}

async function processShowedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = tryExtractValue(payload, ['calendar.appointmentId', 'appointment.id'], ['id', 'call_id']);
  if (!externalId) throw new Error('Missing appointment/call ID');

  const { data } = await supabase.from('calls').update({ showed: true, outcome: 'showed' })
    .eq('client_id', clientId).eq('external_id', String(externalId)).select().maybeSingle();

  if (!data) {
    const { data: newCall, error } = await supabase.from('calls').insert({
      client_id: clientId, external_id: String(externalId), showed: true, outcome: 'showed', scheduled_at: new Date().toISOString(),
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
  const investorName = tryExtractValue(payload, ['full_name', 'opportunity.name', 'name'], ['name']);

  let leadId = null, firstContactAt = null;
  if (contactId) {
    const { data: lead } = await supabase.from('leads').select('id, created_at').eq('client_id', clientId).eq('external_id', String(contactId)).maybeSingle();
    leadId = lead?.id;
    firstContactAt = lead?.created_at;
  }

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
  return { funded_investor_id: data.id, amount, name: investorName };
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

  console.log('Extracted ad-spend values:', { date, spend, impressions, clicks, ctr });

  const { data: existing } = await supabase.from('daily_metrics').select('*').eq('client_id', clientId).eq('date', date).maybeSingle();

  await supabase.from('daily_metrics').upsert({
    client_id: clientId, date, ad_spend: spend, impressions: impressions || existing?.impressions || 0,
    clicks: clicks || existing?.clicks || 0, ctr: ctr || existing?.ctr || 0,
    leads: existing?.leads || 0, spam_leads: existing?.spam_leads || 0, calls: existing?.calls || 0,
    showed_calls: existing?.showed_calls || 0, funded_investors: existing?.funded_investors || 0,
    funded_dollars: existing?.funded_dollars || 0, commitments: existing?.commitments || 0,
    commitment_dollars: existing?.commitment_dollars || 0,
  }, { onConflict: 'client_id,date', ignoreDuplicates: false });

  return { date, spend, impressions, clicks, ctr };
}

async function processBadLead(supabase: any, clientId: string, payload: any, mappings: any) {
  const contactId = tryExtractValue(payload, ['contact.id', 'event.contact_id'], ['contact_id', 'id', 'contactId']);
  if (!contactId) throw new Error('Missing contact_id');

  const { data, error } = await supabase.from('leads').update({ is_spam: true, status: 'bad_lead' })
    .eq('client_id', clientId).eq('external_id', String(contactId)).select().maybeSingle();

  if (!data) throw new Error(`Lead not found with external_id: ${contactId}`);
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
