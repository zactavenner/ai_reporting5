import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

interface HubSpotMeeting {
  id: string;
  properties: Record<string, string | null>;
}

interface SyncSummary {
  contacts: number;
  deals: number;
  meetings: number;
  fundedFromDeals: number;
  committedFromDeals: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { client_id, mode, hubspot_portal_id, hubspot_access_token } = body;

    console.log(`[HubSpot Sync] Mode: ${mode}, Client: ${client_id}`);

    // Fetch client and settings
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      throw new Error(`Client not found: ${client_id}`);
    }

    const { data: settings } = await supabase
      .from('client_settings')
      .select('*')
      .eq('client_id', client_id)
      .maybeSingle();

    // Use passed credentials or stored ones
    const portalId = hubspot_portal_id || client.hubspot_portal_id;
    const accessToken = hubspot_access_token || client.hubspot_access_token;

    if (!portalId || !accessToken) {
      throw new Error('HubSpot credentials not configured');
    }

    // Handle different modes
    switch (mode) {
      case 'test':
        return await handleTestConnection(accessToken, corsHeaders);
      
      case 'fetch_pipelines':
        return await handleFetchPipelines(accessToken, corsHeaders);
      
      case 'sync':
      default:
        return await handleFullSync(supabase, client, settings, accessToken, corsHeaders);
    }
  } catch (error) {
    console.error('[HubSpot Sync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function hubspotRequest(endpoint: string, accessToken: string, options: RequestInit = {}) {
  const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`HubSpot API error: ${response.status} - ${errorText}`);
    throw new Error(`HubSpot API error: ${response.status}`);
  }

  return response.json();
}

async function handleTestConnection(accessToken: string, corsHeaders: Record<string, string>) {
  try {
    // Test by fetching account info
    await hubspotRequest('/crm/v3/objects/contacts?limit=1', accessToken);
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleFetchPipelines(accessToken: string, corsHeaders: Record<string, string>) {
  try {
    const data = await hubspotRequest('/crm/v3/pipelines/deals', accessToken);
    
    const pipelines = data.results.map((p: any) => ({
      id: p.id,
      label: p.label,
      stages: p.stages.map((s: any) => ({
        id: s.id,
        label: s.label,
      })),
    }));

    return new Response(
      JSON.stringify({ pipelines }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

async function handleFullSync(
  supabase: any,
  client: any,
  settings: any,
  accessToken: string,
  corsHeaders: Record<string, string>
) {
  const summary: SyncSummary = {
    contacts: 0,
    deals: 0,
    meetings: 0,
    fundedFromDeals: 0,
    committedFromDeals: 0,
  };

  // Update sync status
  await supabase
    .from('clients')
    .update({ hubspot_sync_status: 'syncing' })
    .eq('id', client.id);

  try {
    // 1. Sync contacts
    console.log('[HubSpot Sync] Syncing contacts...');
    summary.contacts = await syncContacts(supabase, client.id, accessToken);

    // 2. Sync deals (for funded/committed investors)
    if (settings?.hubspot_funded_pipeline_id) {
      console.log('[HubSpot Sync] Syncing deals...');
      const dealResults = await syncDeals(supabase, client.id, accessToken, settings);
      summary.deals = dealResults.total;
      summary.fundedFromDeals = dealResults.funded;
      summary.committedFromDeals = dealResults.committed;
    }

    // 3. Sync meetings (for calls)
    if (settings?.hubspot_booked_meeting_types?.length > 0) {
      console.log('[HubSpot Sync] Syncing meetings...');
      summary.meetings = await syncMeetings(supabase, client.id, accessToken, settings);
    }

    // 4. Recalculate daily_metrics to ensure KPIs are accurate
    console.log('[HubSpot Sync] Recalculating daily metrics...');
    const metricsResult = await recalculateRecentMetrics(supabase, client.id, 7);
    console.log(`[HubSpot Sync] Metrics updated: ${metricsResult.daysUpdated} days`);

    // Update sync status and timestamps
    await supabase
      .from('clients')
      .update({
        hubspot_sync_status: 'healthy',
        hubspot_sync_error: null,
        last_hubspot_sync_at: new Date().toISOString(),
      })
      .eq('id', client.id);

    await supabase
      .from('client_settings')
      .update({
        hubspot_last_contacts_sync: new Date().toISOString(),
        hubspot_last_deals_sync: new Date().toISOString(),
      })
      .eq('client_id', client.id);

    console.log('[HubSpot Sync] Complete:', summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // Update error status
    await supabase
      .from('clients')
      .update({
        hubspot_sync_status: 'error',
        hubspot_sync_error: error.message,
      })
      .eq('id', client.id);

    throw error;
  }
}

async function syncContacts(supabase: any, clientId: string, accessToken: string): Promise<number> {
  const properties = [
    'email', 'firstname', 'lastname', 'phone',
    'lifecyclestage', 'hs_lead_status',
    'hs_analytics_source', 'hs_analytics_source_data_1',
    'utm_campaign', 'utm_source', 'utm_medium', 'utm_content', 'utm_term',
    'createdate',
  ];

  let after: string | undefined;
  let totalSynced = 0;
  const batchSize = 100;

  do {
    const endpoint = `/crm/v3/objects/contacts?limit=${batchSize}&properties=${properties.join(',')}`
      + (after ? `&after=${after}` : '');
    
    const data = await hubspotRequest(endpoint, accessToken);
    const contacts: HubSpotContact[] = data.results || [];

    for (const contact of contacts) {
      const props = contact.properties;
      
      // Map to leads table
      const lead = {
        client_id: clientId,
        external_id: `hubspot_${contact.id}`,
        name: [props.firstname, props.lastname].filter(Boolean).join(' ') || null,
        email: props.email || null,
        phone: props.phone || null,
        status: mapLifecycleStage(props.lifecyclestage),
        source: normalizeSource(props.hs_analytics_source),
        utm_source: props.utm_source || null,
        utm_medium: props.utm_medium || null,
        utm_campaign: props.utm_campaign || null,
        utm_content: props.utm_content || null,
        utm_term: props.utm_term || null,
        created_at: props.createdate || contact.createdAt,
      };

      await supabase
        .from('leads')
        .upsert(lead, { onConflict: 'client_id,external_id' });
      
      totalSynced++;
    }

    after = data.paging?.next?.after;
    
    // Rate limiting: 100ms delay between requests
    if (after) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } while (after);

  return totalSynced;
}

async function syncDeals(
  supabase: any,
  clientId: string,
  accessToken: string,
  settings: any
): Promise<{ total: number; funded: number; committed: number }> {
  const fundedStageIds = settings.hubspot_funded_stage_ids || [];
  const committedStageIds = settings.hubspot_committed_stage_ids || [];
  const pipelineId = settings.hubspot_funded_pipeline_id;

  const properties = [
    'dealname', 'amount', 'dealstage', 'pipeline',
    'closedate', 'createdate', 'hs_object_id',
  ];

  let after: string | undefined;
  let total = 0;
  let funded = 0;
  let committed = 0;

  do {
    const endpoint = `/crm/v3/objects/deals?limit=100&properties=${properties.join(',')}`
      + (after ? `&after=${after}` : '');
    
    const data = await hubspotRequest(endpoint, accessToken);
    const deals: HubSpotDeal[] = data.results || [];

    for (const deal of deals) {
      const props = deal.properties;
      
      // Skip if not in tracked pipeline
      if (props.pipeline !== pipelineId) continue;

      const isFunded = fundedStageIds.includes(props.dealstage);
      const isCommitted = committedStageIds.includes(props.dealstage);

      if (!isFunded && !isCommitted) continue;

      total++;

      // Get associated contact
      let contactId: string | null = null;
      try {
        const assocData = await hubspotRequest(
          `/crm/v4/objects/deals/${deal.id}/associations/contacts`,
          accessToken
        );
        if (assocData.results?.[0]?.toObjectId) {
          contactId = `hubspot_${assocData.results[0].toObjectId}`;
        }
      } catch (e) {
        console.warn(`Failed to get contact for deal ${deal.id}:`, e);
      }

      // Find lead ID
      let leadId: string | null = null;
      if (contactId) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('client_id', clientId)
          .eq('external_id', contactId)
          .maybeSingle();
        leadId = lead?.id || null;
      }

      const amount = parseFloat(props.amount || '0');

      const investor = {
        client_id: clientId,
        external_id: `hubspot_deal_${deal.id}`,
        name: props.dealname || null,
        lead_id: leadId,
        funded_amount: isFunded ? amount : 0,
        commitment_amount: isCommitted ? amount : 0,
        funded_at: props.closedate || deal.createdAt,
        source: 'hubspot',
      };

      await supabase
        .from('funded_investors')
        .upsert(investor, { onConflict: 'client_id,external_id' });

      if (isFunded) funded++;
      if (isCommitted) committed++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    after = data.paging?.next?.after;
  } while (after);

  return { total, funded, committed };
}

async function syncMeetings(
  supabase: any,
  clientId: string,
  accessToken: string,
  settings: any
): Promise<number> {
  const bookedTypes = settings.hubspot_booked_meeting_types || [];
  const reconnectTypes = settings.hubspot_reconnect_meeting_types || [];

  const properties = [
    'hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_end_time',
    'hs_meeting_outcome', 'hs_timestamp', 'hs_meeting_external_url',
  ];

  let after: string | undefined;
  let totalSynced = 0;

  do {
    const endpoint = `/crm/v3/objects/meetings?limit=100&properties=${properties.join(',')}`
      + (after ? `&after=${after}` : '');
    
    const data = await hubspotRequest(endpoint, accessToken);
    const meetings: HubSpotMeeting[] = data.results || [];

    for (const meeting of meetings) {
      const props = meeting.properties;
      const title = props.hs_meeting_title || '';

      // Check if meeting type matches
      const isBookedCall = bookedTypes.some((t: string) => 
        title.toLowerCase().includes(t.toLowerCase())
      );
      const isReconnect = reconnectTypes.some((t: string) => 
        title.toLowerCase().includes(t.toLowerCase())
      );

      if (!isBookedCall && !isReconnect) continue;

      // Get associated contact
      let contactId: string | null = null;
      try {
        const assocData = await hubspotRequest(
          `/crm/v4/objects/meetings/${meeting.id}/associations/contacts`,
          accessToken
        );
        if (assocData.results?.[0]?.toObjectId) {
          contactId = `hubspot_${assocData.results[0].toObjectId}`;
        }
      } catch (e) {
        console.warn(`Failed to get contact for meeting ${meeting.id}:`, e);
      }

      // Find lead
      let leadId: string | null = null;
      let contactName: string | null = null;
      let contactEmail: string | null = null;
      if (contactId) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, email')
          .eq('client_id', clientId)
          .eq('external_id', contactId)
          .maybeSingle();
        leadId = lead?.id || null;
        contactName = lead?.name || null;
        contactEmail = lead?.email || null;
      }

      // Calculate duration
      const startTime = props.hs_meeting_start_time ? new Date(props.hs_meeting_start_time) : null;
      const endTime = props.hs_meeting_end_time ? new Date(props.hs_meeting_end_time) : null;
      const durationSeconds = startTime && endTime 
        ? Math.round((endTime.getTime() - startTime.getTime()) / 1000)
        : null;

      const showed = props.hs_meeting_outcome === 'COMPLETED' || 
                     props.hs_meeting_outcome === 'SCHEDULED';

      const call = {
        client_id: clientId,
        external_id: `hubspot_meeting_${meeting.id}`,
        lead_id: leadId,
        contact_name: contactName,
        contact_email: contactEmail,
        scheduled_at: props.hs_meeting_start_time || props.hs_timestamp,
        booked_at: props.hs_timestamp,
        showed: showed,
        is_reconnect: isReconnect,
        outcome: props.hs_meeting_outcome || null,
        call_duration_seconds: durationSeconds,
      };

      await supabase
        .from('calls')
        .upsert(call, { onConflict: 'client_id,external_id' });

      totalSynced++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    after = data.paging?.next?.after;
  } while (after);

  return totalSynced;
}

function mapLifecycleStage(stage: string | null): string {
  const stageMap: Record<string, string> = {
    'subscriber': 'new',
    'lead': 'lead',
    'marketingqualifiedlead': 'qualified',
    'salesqualifiedlead': 'qualified',
    'opportunity': 'opportunity',
    'customer': 'customer',
    'evangelist': 'customer',
  };
  return stageMap[stage?.toLowerCase() || ''] || 'new';
}

function normalizeSource(source: string | null): string {
  if (!source) return 'unknown';
  const sourceMap: Record<string, string> = {
    'ORGANIC_SEARCH': 'organic',
    'PAID_SEARCH': 'paid',
    'PAID_SOCIAL': 'paid_social',
    'SOCIAL_MEDIA': 'social',
    'EMAIL_MARKETING': 'email',
    'REFERRALS': 'referral',
    'DIRECT_TRAFFIC': 'direct',
    'OTHER_CAMPAIGNS': 'other',
    'OFFLINE': 'offline',
  };
  return sourceMap[source.toUpperCase()] || source.toLowerCase();
}

// =======================================
// RECENT METRICS RECALCULATION
// =======================================
// Updates daily_metrics for the last N days to keep KPIs current
// =======================================
async function recalculateRecentMetrics(
  supabase: any,
  clientId: string,
  daysBack: number = 7
): Promise<{ daysUpdated: number; errors: string[] }> {
  const result = { daysUpdated: 0, errors: [] as string[] };
  
  console.log(`[HubSpot] Starting recent metrics recalculation for client ${clientId}, last ${daysBack} days`);
  
  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - daysBack);
    startDate.setUTCHours(0, 0, 0, 0);
    
    // Delete existing metrics for the date range
    const startDateStr = startDate.toISOString().split('T')[0];
    await supabase
      .from('daily_metrics')
      .delete()
      .eq('client_id', clientId)
      .gte('date', startDateStr);
    
    // Iterate through each day
    const currentDate = new Date(startDate);
    const metricsToInsert: any[] = [];
    
    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;
      
      try {
        // Count leads
        const { count: leadsCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('is_spam', false)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);
        
        const { count: nullSpamCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .is('is_spam', null)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);
        
        const { count: spamCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('is_spam', true)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);
        
        const totalValidLeads = (leadsCount || 0) + (nullSpamCount || 0);
        
        // Count calls
        const { count: callsCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .neq('is_reconnect', true)
          .gte('booked_at', dayStart)
          .lte('booked_at', dayEnd);
        
        const { count: showedCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('showed', true)
          .neq('is_reconnect', true)
          .gte('booked_at', dayStart)
          .lte('booked_at', dayEnd);
        
        const { count: reconnectCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('is_reconnect', true)
          .gte('booked_at', dayStart)
          .lte('booked_at', dayEnd);
        
        const { count: reconnectShowedCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('is_reconnect', true)
          .eq('showed', true)
          .gte('booked_at', dayStart)
          .lte('booked_at', dayEnd);
        
        // Get funded investors
        const { data: fundedData, count: fundedCount } = await supabase
          .from('funded_investors')
          .select('funded_amount, commitment_amount', { count: 'exact' })
          .eq('client_id', clientId)
          .gte('funded_at', dayStart)
          .lte('funded_at', dayEnd);
        
        const fundedDollars = (fundedData || []).reduce((sum: number, f: any) => sum + (f.funded_amount || 0), 0);
        const commitmentDollars = (fundedData || []).reduce((sum: number, f: any) => sum + (f.commitment_amount || 0), 0);
        const commitmentCount = (fundedData || []).filter((f: any) => f.commitment_amount && f.commitment_amount > 0).length;
        
        if (totalValidLeads > 0 || (spamCount || 0) > 0 || (callsCount || 0) > 0 || (reconnectCount || 0) > 0 || (fundedCount || 0) > 0) {
          metricsToInsert.push({
            client_id: clientId,
            date: dateStr,
            leads: totalValidLeads,
            spam_leads: spamCount || 0,
            calls: callsCount || 0,
            showed_calls: showedCount || 0,
            reconnect_calls: reconnectCount || 0,
            reconnect_showed: reconnectShowedCount || 0,
            funded_investors: fundedCount || 0,
            funded_dollars: fundedDollars,
            commitments: commitmentCount,
            commitment_dollars: commitmentDollars,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        result.errors.push(`Date ${dateStr}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    
    if (metricsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('daily_metrics')
        .insert(metricsToInsert);
      
      if (insertError) {
        result.errors.push(`Insert error: ${insertError.message}`);
      } else {
        result.daysUpdated = metricsToInsert.length;
      }
    }
    
    console.log(`[HubSpot] Recent metrics recalculation complete: ${result.daysUpdated} days updated`);
  } catch (err) {
    result.errors.push(`Metrics recalculation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  return result;
}
