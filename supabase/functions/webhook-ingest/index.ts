import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Helper to extract value from nested object using dot notation
function getValueByPath(obj: any, path: string): any {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    // Handle array notation like items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      current = current[part];
    }
  }
  return current;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse URL to get client ID and webhook type
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Expected format: /webhook-ingest/{clientId}/{webhookType}
    const clientId = pathParts[1];
    const webhookType = pathParts[2];

    if (!clientId || !webhookType) {
      return new Response(
        JSON.stringify({ error: 'Missing clientId or webhookType in URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate webhook secret
    const providedSecret = req.headers.get('x-webhook-secret');
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, webhook_secret')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate secret if provided (optional for flexibility, but recommended)
    if (providedSecret && providedSecret !== client.webhook_secret) {
      await logWebhook(supabase, clientId, webhookType, 'error', null, 'Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      await logWebhook(supabase, clientId, webhookType, 'error', null, 'Invalid JSON payload');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client's webhook mappings
    const { data: settings } = await supabase
      .from('client_settings')
      .select('webhook_mappings')
      .eq('client_id', clientId)
      .maybeSingle();

    const mappings = settings?.webhook_mappings?.[webhookType] || {};

    // Process based on webhook type
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

    // Log successful webhook
    await logWebhook(supabase, clientId, webhookType, 'success', payload, null);

    // Update daily metrics
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

async function logWebhook(
  supabase: any,
  clientId: string,
  webhookType: string,
  status: string,
  payload: any,
  errorMessage: string | null
) {
  await supabase.from('webhook_logs').insert({
    client_id: clientId,
    webhook_type: webhookType,
    status,
    payload: payload ? JSON.stringify(payload).substring(0, 5000) : null,
    error_message: errorMessage,
  });
}

async function processLead(supabase: any, clientId: string, payload: any, mappings: any) {
  // Extract contact ID
  const externalId = payload.contact?.id || payload.id || payload.contactId || `wh_${Date.now()}`;
  
  // Extract name using mapping or common paths
  let name = mappings?.nameField ? getValueByPath(payload, mappings.nameField) : null;
  if (!name) {
    name = payload.contact?.name || payload.name || 
           `${payload.contact?.firstName || payload.firstName || ''} ${payload.contact?.lastName || payload.lastName || ''}`.trim() || 
           'Unknown';
  }
  
  // Extract email
  const email = mappings?.emailField 
    ? getValueByPath(payload, mappings.emailField) 
    : (payload.contact?.email || payload.email);
  
  // Extract phone
  const phone = mappings?.phoneField 
    ? getValueByPath(payload, mappings.phoneField) 
    : (payload.contact?.phone || payload.phone);
  
  // Extract UTM parameters
  const utm_source = mappings?.utmSourceField 
    ? getValueByPath(payload, mappings.utmSourceField) 
    : (payload.contact?.attribution?.utm_source || payload.utm_source);
  const utm_medium = mappings?.utmMediumField 
    ? getValueByPath(payload, mappings.utmMediumField) 
    : (payload.contact?.attribution?.utm_medium || payload.utm_medium);
  const utm_campaign = mappings?.utmCampaignField 
    ? getValueByPath(payload, mappings.utmCampaignField) 
    : (payload.contact?.attribution?.utm_campaign || payload.utm_campaign);
  const utm_content = mappings?.utmContentField 
    ? getValueByPath(payload, mappings.utmContentField) 
    : (payload.contact?.attribution?.utm_content || payload.utm_content);
  const utm_term = mappings?.utmTermField 
    ? getValueByPath(payload, mappings.utmTermField) 
    : (payload.contact?.attribution?.utm_term || payload.utm_term);

  // Extract pipeline value
  const pipelineValue = mappings?.pipelineValueField 
    ? parseFloat(getValueByPath(payload, mappings.pipelineValueField)) || 0
    : (mappings?.valueField ? parseFloat(getValueByPath(payload, mappings.valueField)) || 0 : 0);

  // Extract custom fields
  const customFieldsData: Record<string, any> = {};
  if (mappings?.customFields && Array.isArray(mappings.customFields)) {
    for (const cf of mappings.customFields) {
      if (cf.name && cf.path) {
        customFieldsData[cf.name] = getValueByPath(payload, cf.path);
      }
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      source: 'webhook',
      name,
      email,
      phone,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      pipeline_value: pipelineValue,
      custom_fields: Object.keys(customFieldsData).length > 0 ? customFieldsData : null,
      status: 'new',
      is_spam: false,
    }, {
      onConflict: 'client_id,external_id,source',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { lead_id: data.id, action: 'upserted', name, email, phone, utm_source, utm_campaign, pipeline_value: pipelineValue };
}

async function processBookedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.appointment?.id || payload.id || `wh_call_${Date.now()}`;
  const scheduledAt = payload.appointment?.meta?.start_time || payload.scheduled_at || payload.startTime || new Date().toISOString();
  const contactId = payload.appointment?.contactId || payload.contact_id || payload.contactId;

  // Find matching lead
  let leadId = null;
  if (contactId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', clientId)
      .eq('external_id', String(contactId))
      .maybeSingle();
    leadId = lead?.id;
  }

  const { data, error } = await supabase
    .from('calls')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      lead_id: leadId,
      scheduled_at: scheduledAt,
      showed: false,
      outcome: 'booked',
    }, {
      onConflict: 'client_id,external_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { call_id: data.id, action: 'booked' };
}

async function processShowedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.appointment?.id || payload.id || payload.call_id;

  if (!externalId) {
    throw new Error('Missing appointment/call ID');
  }

  const { data, error } = await supabase
    .from('calls')
    .update({ showed: true, outcome: 'showed' })
    .eq('client_id', clientId)
    .eq('external_id', String(externalId))
    .select()
    .maybeSingle();

  if (!data) {
    // If call doesn't exist, create it as showed
    const { data: newCall, error: insertError } = await supabase
      .from('calls')
      .insert({
        client_id: clientId,
        external_id: String(externalId),
        showed: true,
        outcome: 'showed',
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    return { call_id: newCall.id, action: 'created_as_showed' };
  }

  if (error) throw error;
  return { call_id: data.id, action: 'marked_showed' };
}

async function processCommitment(supabase: any, clientId: string, payload: any, mappings: any) {
  // Get commitment amount
  const valueField = mappings?.valueField || 'opportunity.details.monetary_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || 0;

  const today = new Date().toISOString().split('T')[0];
  
  // Get current values
  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('commitments, commitment_dollars')
    .eq('client_id', clientId)
    .eq('date', today)
    .maybeSingle();

  const currentCommitments = existing?.commitments || 0;
  const currentDollars = existing?.commitment_dollars || 0;

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date: today,
      commitments: currentCommitments + 1,
      commitment_dollars: currentDollars + amount,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });

  return { commitments: currentCommitments + 1, amount };
}

async function processFunded(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.opportunity?.id || payload.id || `wh_funded_${Date.now()}`;
  const valueField = mappings?.valueField || 'opportunity.details.monetary_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || 0;
  const contactId = payload.opportunity?.contactId || payload.contact_id || payload.contactId;
  const investorName = payload.opportunity?.name || payload.name || payload.contact?.name;

  // Find matching lead
  let leadId = null;
  let firstContactAt = null;
  if (contactId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, created_at, name')
      .eq('client_id', clientId)
      .eq('external_id', String(contactId))
      .maybeSingle();
    leadId = lead?.id;
    firstContactAt = lead?.created_at;
  }

  // Calculate time to fund
  let timeToFundDays = null;
  if (firstContactAt) {
    const leadDate = new Date(firstContactAt);
    const fundedDate = new Date();
    timeToFundDays = Math.floor((fundedDate.getTime() - leadDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Count calls for this lead
  let callsToFund = 0;
  if (leadId) {
    const { count } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId);
    callsToFund = count || 0;
  }

  const { data, error } = await supabase
    .from('funded_investors')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      name: investorName,
      lead_id: leadId,
      funded_amount: amount,
      funded_at: new Date().toISOString(),
      first_contact_at: firstContactAt,
      time_to_fund_days: timeToFundDays,
      calls_to_fund: callsToFund,
    }, {
      onConflict: 'client_id,external_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { funded_investor_id: data.id, amount, name: investorName };
}

async function processAdSpend(supabase: any, clientId: string, payload: any, mappings: any) {
  const valueField = mappings?.valueField || 'report.metrics.spend';
  const dateField = mappings?.dateField || 'report.date';
  const impressionsField = mappings?.impressionsField || 'report.metrics.impressions';
  const clicksField = mappings?.clicksField || 'report.metrics.clicks';
  const frequencyField = mappings?.frequencyField || 'report.metrics.frequency';
  
  const spend = parseFloat(getValueByPath(payload, valueField)) || 0;
  const date = getValueByPath(payload, dateField) || new Date().toISOString().split('T')[0];

  // Extract all ad metrics using mappings or fallbacks
  const impressions = parseInt(getValueByPath(payload, impressionsField) || payload.impressions || '0');
  const clicks = parseInt(getValueByPath(payload, clicksField) || payload.clicks || '0');
  const frequency = parseFloat(getValueByPath(payload, frequencyField) || payload.frequency || '0');
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .eq('date', date)
    .maybeSingle();

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date,
      ad_spend: spend,
      impressions: impressions || existing?.impressions || 0,
      clicks: clicks || existing?.clicks || 0,
      ctr: ctr || existing?.ctr || 0,
      // Preserve existing values
      leads: existing?.leads || 0,
      spam_leads: existing?.spam_leads || 0,
      calls: existing?.calls || 0,
      showed_calls: existing?.showed_calls || 0,
      funded_investors: existing?.funded_investors || 0,
      funded_dollars: existing?.funded_dollars || 0,
      commitments: existing?.commitments || 0,
      commitment_dollars: existing?.commitment_dollars || 0,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });

  return { date, spend, impressions, clicks, frequency, ctr };
}

async function processBadLead(supabase: any, clientId: string, payload: any, mappings: any) {
  const contactId = payload.event?.contact_id || payload.contact_id || payload.id || payload.contactId;

  if (!contactId) {
    throw new Error('Missing contact_id');
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ is_spam: true, status: 'bad_lead' })
    .eq('client_id', clientId)
    .eq('external_id', String(contactId))
    .select()
    .maybeSingle();

  if (!data) {
    throw new Error(`Lead not found with external_id: ${contactId}`);
  }
  if (error) throw error;
  return { lead_id: data.id, action: 'marked_bad' };
}

async function updateDailyMetrics(supabase: any, clientId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's counts
  const [leadsResult, spamResult, callsResult, showedResult, fundedResult] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_spam', true).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('showed', true).gte('created_at', today),
    supabase.from('funded_investors').select('funded_amount').eq('client_id', clientId).gte('created_at', today),
  ]);

  const fundedCount = fundedResult.data?.length || 0;
  const fundedDollars = fundedResult.data?.reduce((sum: number, f: any) => sum + (f.funded_amount || 0), 0) || 0;

  // Get existing metrics to preserve ad_spend and other fields
  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .eq('date', today)
    .maybeSingle();

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date: today,
      leads: leadsResult.count || 0,
      spam_leads: spamResult.count || 0,
      calls: callsResult.count || 0,
      showed_calls: showedResult.count || 0,
      funded_investors: fundedCount,
      funded_dollars: fundedDollars,
      // Preserve existing values
      ad_spend: existing?.ad_spend || 0,
      impressions: existing?.impressions || 0,
      clicks: existing?.clicks || 0,
      ctr: existing?.ctr || 0,
      commitments: existing?.commitments || 0,
      commitment_dollars: existing?.commitment_dollars || 0,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });
}
