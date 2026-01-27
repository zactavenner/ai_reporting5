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

interface MeetGeekHighlight {
  highlightText: string;
  label: string;
  timestamp?: number;
  speaker?: string;
}

interface MeetGeekHighlights {
  highlights: MeetGeekHighlight[];
}

interface ActionItem {
  text: string;
  source?: string;
  assignee?: string;
  speaker?: string;
}

// Extract action items from summary text using regex patterns
function extractActionItemsFromSummary(summary: string): ActionItem[] {
  if (!summary) return [];
  
  const actionItems: ActionItem[] = [];
  const patterns = [
    /action items?:?\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
    /next steps?:?\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
    /tasks?:?\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
    /to-?do:?\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
    /follow[- ]?ups?:?\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(summary)) !== null) {
      if (match[1]) {
        const lines = match[1].split('\n')
          .map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim())
          .filter(line => line.length > 5 && !line.match(/^(action|next|task|to-?do|follow)/i));
        
        lines.forEach(line => {
          if (!actionItems.some(item => item.text.toLowerCase() === line.toLowerCase())) {
            actionItems.push({ text: line, source: 'summary_parse' });
          }
        });
      }
    }
  }
  
  return actionItems;
}

// Extract action items using AI as a fallback
async function extractActionItemsWithAI(summary: string, transcript: string): Promise<ActionItem[]> {
  if (!summary && !transcript) return [];
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('LOVABLE_API_KEY not configured, skipping AI extraction');
    return [];
  }
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: `Extract action items and tasks from this meeting content. Return ONLY a valid JSON array.

Summary:
${summary || 'No summary available'}

${transcript ? `Transcript excerpt:\n${transcript.slice(0, 4000)}` : ''}

Return format: [{"text": "action item description", "assignee": "person name if mentioned, otherwise null"}]
Return ONLY the JSON array, no other text or markdown.`
        }],
        temperature: 0.2,
      }),
    });
    
    if (!response.ok) {
      console.log('AI extraction request failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '[]';
    
    // Clean up potential markdown formatting
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const items = JSON.parse(content);
    return items.map((item: any) => ({
      text: item.text || item.content || String(item),
      assignee: item.assignee || null,
      source: 'ai_extraction',
    }));
  } catch (e) {
    console.log('AI extraction failed:', e);
    return [];
  }
}

// Deduplicate action items by comparing text similarity
function deduplicateActionItems(items: ActionItem[]): ActionItem[] {
  const unique: ActionItem[] = [];
  
  for (const item of items) {
    const normalizedText = item.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const isDuplicate = unique.some(existing => {
      const existingNormalized = existing.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      // Check for exact match or high similarity (one contains the other)
      return existingNormalized === normalizedText ||
             existingNormalized.includes(normalizedText) ||
             normalizedText.includes(existingNormalized);
    });
    
    if (!isDuplicate && normalizedText.length > 5) {
      unique.push(item);
    }
  }
  
  return unique;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name');
    
    if (error || !clients || clients.length === 0) {
      return null;
    }
    
    const titleLower = title.toLowerCase();
    
    for (const client of clients) {
      const clientName = client.name.toLowerCase();
      const clientWords = clientName.split(/\s+/).filter((w: string) => w.length > 2);
      
      for (const word of clientWords) {
        if (['the', 'and', 'inc', 'llc', 'corp', 'group', 'capital', 'investments', 'management'].includes(word)) {
          continue;
        }
        if (titleLower.includes(word)) {
          console.log(`Auto-matched meeting "${title}" to client "${client.name}" via word "${word}"`);
          return client.id;
        }
      }
      
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

    // === MULTI-SOURCE ACTION ITEMS EXTRACTION ===
    
    // Source 1: Fetch from /insights endpoint (legacy)
    let insightsActionItems: ActionItem[] = [];
    try {
      const insightsResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}/insights`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (insightsResponse.ok) {
        const insightsData: MeetGeekInsights = await insightsResponse.json();
        insightsActionItems = (insightsData.action_items || []).map(item => ({
          text: item.text,
          assignee: item.assignee,
          source: 'insights',
        }));
        console.log(`Found ${insightsActionItems.length} action items from /insights`);
      }
    } catch (e) {
      console.log('Could not fetch insights:', e);
    }

    // Source 2: Fetch from /highlights endpoint (filter by label: "Task")
    let highlightTasks: ActionItem[] = [];
    try {
      const highlightsResponse = await fetch(`https://api.meetgeek.ai/v1/meetings/${meetingId}/highlights`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (highlightsResponse.ok) {
        const highlightsData: MeetGeekHighlights = await highlightsResponse.json();
        highlightTasks = (highlightsData.highlights || [])
          .filter((h: MeetGeekHighlight) => h.label === 'Task' || h.label === 'Action Item')
          .map((h: MeetGeekHighlight) => ({
            text: h.highlightText,
            source: 'highlights',
            speaker: h.speaker,
          }));
        console.log(`Found ${highlightTasks.length} tasks from /highlights`);
      }
    } catch (e) {
      console.log('Could not fetch highlights:', e);
    }

    // Source 3: Parse summary text for action items
    const summaryActionItems = extractActionItemsFromSummary(summary);
    console.log(`Found ${summaryActionItems.length} action items from summary parsing`);

    // Combine all sources
    let allActionItems = [
      ...insightsActionItems,
      ...highlightTasks,
      ...summaryActionItems,
    ];

    // Source 4: AI extraction fallback if no items found
    if (allActionItems.length === 0 && (summary || transcript)) {
      console.log('No action items found, attempting AI extraction...');
      const aiItems = await extractActionItemsWithAI(summary, transcript);
      console.log(`Found ${aiItems.length} action items from AI extraction`);
      allActionItems.push(...aiItems);
    }

    // Deduplicate
    const uniqueActionItems = deduplicateActionItems(allActionItems);
    console.log(`Action items total: insights=${insightsActionItems.length}, highlights=${highlightTasks.length}, summary=${summaryActionItems.length}, unique=${uniqueActionItems.length}`);

    // Calculate duration
    let durationMinutes = meeting.duration;
    if (meeting.start_time && meeting.end_time) {
      const startTime = new Date(meeting.start_time);
      const endTime = new Date(meeting.end_time);
      durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    }

    const meetingDate = meeting.start_time || new Date().toISOString();
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
        action_items: uniqueActionItems,
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
    if (uniqueActionItems.length > 0) {
      const pendingTasks = uniqueActionItems.map((item: ActionItem) => ({
        meeting_id: insertedMeeting.id,
        client_id: matchedClientId,
        title: item.text.slice(0, 200),
        description: item.assignee ? `Assigned to: ${item.assignee}` : '',
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

    return { success: true, meetingId: insertedMeeting.id, actionItems: uniqueActionItems.length };
  } catch (error: unknown) {
    console.error('Error processing meeting:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
