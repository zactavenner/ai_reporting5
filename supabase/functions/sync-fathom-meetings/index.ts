import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FATHOM_BASE = 'https://api.fathom.ai/external/v1';

async function fetchFathomMeetings(apiKey: string, cursor?: string): Promise<{ meetings: any[]; nextCursor: string | null }> {
  let url = `${FATHOM_BASE}/meetings?limit=50&include_transcript=true`;
  if (cursor) url += `&cursor=${cursor}`;

  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fathom API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    meetings: data.meetings || data.data || [],
    nextCursor: data.next_cursor || data.pagination?.next_cursor || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, max_pages } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ success: false, error: 'client_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get Fathom API key from client_settings
    const { data: settings, error: settingsErr } = await supabase
      .from('client_settings')
      .select('fathom_api_key, fathom_enabled')
      .eq('client_id', client_id)
      .single();

    if (settingsErr || !settings) {
      return new Response(JSON.stringify({ success: false, error: 'Client settings not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = (settings as any).fathom_api_key || Deno.env.get('FATHOM_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'No Fathom API key configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all meetings (paginated)
    let allMeetings: any[] = [];
    let cursor: string | null = null;
    const maxPagesToFetch = max_pages || 10;

    for (let page = 0; page < maxPagesToFetch; page++) {
      const { meetings, nextCursor } = await fetchFathomMeetings(apiKey, cursor || undefined);
      allMeetings.push(...meetings);
      console.log(`[Fathom] Page ${page + 1}: fetched ${meetings.length} meetings`);
      if (!nextCursor || meetings.length === 0) break;
      cursor = nextCursor;
    }

    console.log(`[Fathom] Total meetings fetched: ${allMeetings.length}`);

    if (allMeetings.length === 0) {
      // Update last sync
      await supabase
        .from('client_settings')
        .update({ fathom_last_sync: new Date().toISOString() } as any)
        .eq('client_id', client_id);

      return new Response(JSON.stringify({ success: true, synced: 0, matched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let synced = 0;
    let matched = 0;
    let callsUpdated = 0;

    for (const meeting of allMeetings) {
      const meetingId = meeting.id?.toString() || meeting.recording_id?.toString() || `fathom-${Date.now()}-${Math.random()}`;
      const title = meeting.title || meeting.meeting_title || 'Untitled Meeting';
      const meetingDate = meeting.created_at || meeting.recording_start_time || null;
      const duration = meeting.duration_seconds || (
        meeting.recording_start_time && meeting.recording_end_time
          ? Math.round((new Date(meeting.recording_end_time).getTime() - new Date(meeting.recording_start_time).getTime()) / 1000 / 60)
          : null
      );

      // Extract attendees
      const attendees = meeting.attendees || meeting.participants || [];
      const participants = attendees.map((a: any) => ({
        name: a.name || a.display_name,
        email: a.email,
        is_internal: a.is_internal || false,
      }));

      // Extract action items
      const actionItems = (meeting.action_items || []).map((ai: any) => ({
        text: ai.text || ai.description || ai.content,
        assignee: ai.assignee?.name || ai.assignee,
        completed: ai.completed || false,
      }));

      // Recording URL
      const recordingUrl = meeting.url || meeting.share_url || null;
      const fathomUrl = meeting.url || `https://fathom.video/calls/${meetingId}`;

      // Summary
      const summary = meeting.summary || null;
      const transcript = meeting.transcript?.text || meeting.transcript || null;

      // Highlights
      const highlights = meeting.highlights || meeting.key_topics || null;

      // Upsert into agency_meetings
      const { error: upsertErr } = await supabase
        .from('agency_meetings')
        .upsert({
          meeting_id: `fathom-${meetingId}`,
          client_id,
          title,
          meeting_date: meetingDate,
          duration_minutes: typeof duration === 'number' ? (duration > 300 ? Math.round(duration / 60) : duration) : null,
          summary,
          transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
          action_items: actionItems.length > 0 ? actionItems : null,
          participants,
          recording_url: recordingUrl,
          meetgeek_url: fathomUrl,
          highlights,
        } as any, { onConflict: 'meeting_id' });

      if (upsertErr) {
        console.error(`[Fathom] Upsert error for meeting ${meetingId}:`, upsertErr);
        continue;
      }
      synced++;

      // Try to match attendees to contacts and update call records
      const externalEmails = participants
        .filter((p: any) => !p.is_internal && p.email)
        .map((p: any) => p.email.toLowerCase());

      if (externalEmails.length > 0 && meetingDate) {
        // Find leads with matching emails for this client
        for (const email of externalEmails) {
          const { data: leads } = await supabase
            .from('leads')
            .select('id, external_id, name')
            .eq('client_id', client_id)
            .ilike('email', email)
            .limit(1);

          if (leads && leads.length > 0) {
            matched++;
            const lead = leads[0];

            // Find matching call records (within 1 day of meeting date)
            const meetDate = new Date(meetingDate);
            const dayBefore = new Date(meetDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const dayAfter = new Date(meetDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

            const { data: calls } = await supabase
              .from('calls')
              .select('id')
              .eq('client_id', client_id)
              .eq('lead_id', lead.id)
              .gte('scheduled_at', dayBefore)
              .lte('scheduled_at', dayAfter)
              .limit(1);

            if (calls && calls.length > 0) {
              // Update call with transcript and recording
              const updateData: any = {};
              if (transcript) updateData.transcript = typeof transcript === 'string' ? transcript : JSON.stringify(transcript);
              if (summary) updateData.summary = summary;
              if (recordingUrl) updateData.recording_url = recordingUrl;

              if (Object.keys(updateData).length > 0) {
                await supabase.from('calls').update(updateData).eq('id', calls[0].id);
                callsUpdated++;
                console.log(`[Fathom] Updated call ${calls[0].id} with transcript for ${lead.name}`);
              }
            }
          }
        }
      }
    }

    // Update last sync timestamp
    await supabase
      .from('client_settings')
      .update({ fathom_last_sync: new Date().toISOString() } as any)
      .eq('client_id', client_id);

    console.log(`[Fathom] Sync complete: ${synced} meetings synced, ${matched} contacts matched, ${callsUpdated} calls updated`);

    return new Response(JSON.stringify({
      success: true,
      synced,
      matched,
      callsUpdated,
      total: allMeetings.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Fathom] Sync error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
