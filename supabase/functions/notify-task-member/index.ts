import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/slack/api';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { memberId, message, taskId, triggeredBy } = await req.json();

    if (!memberId || !message) {
      return new Response(
        JSON.stringify({ error: 'memberId and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Create in-app notification
    const { error: notifError } = await supabase
      .from('task_notifications')
      .insert({
        task_id: taskId || null,
        member_id: memberId,
        triggered_by: triggeredBy || null,
        message,
      });

    if (notifError) {
      console.error('Failed to create notification:', notifError);
    }

    // 2. Send Slack DM if configured
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SLACK_API_KEY = Deno.env.get('SLACK_API_KEY');

    if (LOVABLE_API_KEY && SLACK_API_KEY) {
      // Get member email to find their Slack user
      const { data: member } = await supabase
        .from('agency_members')
        .select('email, name')
        .eq('id', memberId)
        .single();

      if (member?.email) {
        try {
          // Look up Slack user by email
          const lookupRes = await fetch(`${GATEWAY_URL}/users.lookupByEmail?email=${encodeURIComponent(member.email)}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': SLACK_API_KEY,
            },
          });

          const lookupData = await lookupRes.json();

          if (lookupData.ok && lookupData.user?.id) {
            const slackUserId = lookupData.user.id;

            // Open DM channel
            const dmRes = await fetch(`${GATEWAY_URL}/conversations.open`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'X-Connection-Api-Key': SLACK_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ users: slackUserId }),
            });

            const dmData = await dmRes.json();

            if (dmData.ok && dmData.channel?.id) {
              // Send the DM
              const taskUrl = taskId
                ? `https://aireporting.lovable.app/?task=${taskId}`
                : 'https://aireporting.lovable.app/';

              const slackMessage = `🔔 *Task Notification*\n${message}${triggeredBy ? `\n_from ${triggeredBy}_` : ''}\n<${taskUrl}|View Task>`;

              await fetch(`${GATEWAY_URL}/chat.postMessage`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                  'X-Connection-Api-Key': SLACK_API_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  channel: dmData.channel.id,
                  text: slackMessage,
                  username: 'Funding Sonar',
                  icon_emoji: ':bell:',
                }),
              });

              console.log(`Slack DM sent to ${member.email}`);
            }
          } else {
            console.log(`Slack user not found for ${member.email}`);
          }
        } catch (slackErr) {
          console.error('Slack DM error:', slackErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Notify error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
