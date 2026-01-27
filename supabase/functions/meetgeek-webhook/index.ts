import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MeetGeekMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration: number;
  participants: Array<{
    email: string;
    name: string;
    role?: string;
  }>;
  recording_url?: string;
  meetgeek_url?: string;
}

interface MeetGeekTranscript {
  transcript: string;
}

interface MeetGeekSummary {
  summary: string;
}

interface MeetGeekInsights {
  action_items: Array<{
    text: string;
    assignee?: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get agency settings for MeetGeek API key
    const { data: settings, error: settingsError } = await supabase
      .from('agency_settings')
      .select('meetgeek_api_key, meetgeek_webhook_secret')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching agency settings:', settingsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meetgeekApiKey = settings?.meetgeek_api_key;
    if (!meetgeekApiKey) {
      console.error('MeetGeek API key not configured');
      return new Response(JSON.stringify({ error: 'MeetGeek API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    console.log('Received webhook/request:', JSON.stringify(body));

    // Handle manual sync request
    if (body.action === 'sync') {
      console.log('Manual sync requested');
      const syncResult = await syncRecentMeetings(supabase, meetgeekApiKey);
      return new Response(JSON.stringify(syncResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle MeetGeek webhook (meeting analyzed)
    if (body.meeting_id) {
      console.log('Processing meeting:', body.meeting_id);
      const result = await processMeeting(supabase, meetgeekApiKey, body.meeting_id);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'No action taken' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error processing webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function syncRecentMeetings(supabase: any, apiKey: string) {
  try {
    // Fetch recent meetings from MeetGeek API
    const response = await fetch('https://api.meetgeek.ai/v1/meetings?limit=20', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('MeetGeek API error:', response.status, errorText);
      throw new Error(`MeetGeek API error: ${response.status}`);
    }

    const data = await response.json();
    const meetings = data.meetings || data.data || [];
    console.log(`Found ${meetings.length} meetings to sync`);

    let synced = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      // Check if already synced
      const { data: existing } = await supabase
        .from('agency_meetings')
        .select('id')
        .eq('meeting_id', meeting.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      await processMeeting(supabase, apiKey, meeting.id);
      synced++;
    }

    return { success: true, synced, skipped, total: meetings.length };
  } catch (error: unknown) {
    console.error('Error syncing meetings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

async function matchClientByTitle(supabase: any, title: string): Promise<string | null> {
  try {
    // Fetch all clients
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name');
    
    if (error || !clients || clients.length === 0) {
      return null;
    }
    
    const titleLower = title.toLowerCase();
    
    // Try to find a client match in the meeting title
    for (const client of clients) {
      const clientName = client.name.toLowerCase();
      
      // Split client name into words for partial matching
      const clientWords = clientName.split(/\s+/).filter((w: string) => w.length > 2);
      
      // Check if any significant word from client name appears in title
      for (const word of clientWords) {
        // Skip common words
        if (['the', 'and', 'inc', 'llc', 'corp', 'group', 'capital', 'investments', 'management'].includes(word)) {
          continue;
        }
        if (titleLower.includes(word)) {
          console.log(`Auto-matched meeting "${title}" to client "${client.name}" via word "${word}"`);
          return client.id;
        }
      }
      
      // Also check if first word (often unique identifier) matches
      const firstWord = clientWords[0];
      if (firstWord && firstWord.length > 3 && titleLower.includes(firstWord)) {
        console.log(`Auto-matched meeting "${title}" to client "${client.name}" via first word "${firstWord}"`);
        return client.id;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error matching client by title:', e);
    return null;
  }
}

async function processMeeting(supabase: any, apiKey: string, meetingId: string) {
  try {
    // Fetch meeting details
    const meetingResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!meetingResponse.ok) {
      throw new Error(`Failed to fetch meeting: ${meetingResponse.status}`);
    }

    const meeting: MeetGeekMeeting = await meetingResponse.json();
    console.log('Meeting details:', meeting.title);

    // Fetch transcript
    let transcript = '';
    try {
      const transcriptResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}/transcript`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (transcriptResponse.ok) {
        const transcriptData: MeetGeekTranscript = await transcriptResponse.json();
        transcript = transcriptData.transcript || '';
      }
    } catch (e) {
      console.log('Could not fetch transcript:', e);
    }

    // Fetch summary
    let summary = '';
    try {
      const summaryResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}/summary`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (summaryResponse.ok) {
        const summaryData: MeetGeekSummary = await summaryResponse.json();
        summary = summaryData.summary || '';
      }
    } catch (e) {
      console.log('Could not fetch summary:', e);
    }

    // Fetch action items/insights
    let actionItems: any[] = [];
    try {
      const insightsResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}/insights`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (insightsResponse.ok) {
        const insightsData: MeetGeekInsights = await insightsResponse.json();
        actionItems = insightsData.action_items || [];
      }
    } catch (e) {
      console.log('Could not fetch insights:', e);
    }

    // Calculate duration in minutes
    let durationMinutes = meeting.duration;
    if (meeting.start_time && meeting.end_time) {
      const startTime = new Date(meeting.start_time);
      const endTime = new Date(meeting.end_time);
      durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    }

    // Use meeting start_time, or fallback to current timestamp
    const meetingDate = meeting.start_time || new Date().toISOString();

    // Auto-match client by title
    const matchedClientId = await matchClientByTitle(supabase, meeting.title || '');

    // Store meeting in database
    const { data: insertedMeeting, error: insertError } = await supabase
      .from('agency_meetings')
      .upsert({
        meeting_id: meetingId,
        title: meeting.title || 'Untitled Meeting',
        meeting_date: meetingDate,
        duration_minutes: durationMinutes,
        participants: meeting.participants || [],
        summary: summary,
        transcript: transcript,
        action_items: actionItems,
        recording_url: meeting.recording_url,
        meetgeek_url: meeting.meetgeek_url || `https://app.meetgeek.ai/meetings/${meetingId}`,
        client_id: matchedClientId,
      }, { onConflict: 'meeting_id' })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting meeting:', insertError);
      throw insertError;
    }

    console.log('Meeting stored:', insertedMeeting.id);

    // Create pending tasks from action items
    if (actionItems.length > 0) {
      const pendingTasks = actionItems.map((item: any) => ({
        meeting_id: insertedMeeting.id,
        client_id: null, // Will be assigned manually
        title: item.text || item.content || 'Action Item',
        description: item.notes || item.context || '',
        priority: 'medium',
        status: 'pending',
      }));

      const { error: tasksError } = await supabase
        .from('pending_meeting_tasks')
        .insert(pendingTasks);

      if (tasksError) {
        console.error('Error creating pending tasks:', tasksError);
      } else {
        console.log(`Created ${pendingTasks.length} pending tasks`);
      }
    }

    return { success: true, meetingId: insertedMeeting.id, actionItems: actionItems.length };
  } catch (error: unknown) {
    console.error('Error processing meeting:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
