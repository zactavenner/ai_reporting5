import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

interface TopAd {
  ad_id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  attributed_leads: number;
  attributed_calls: number;
  attributed_funded: number;
  attributed_funded_dollars: number;
  cost_per_lead: number | null;
  headline: string | null;
  body: string | null;
  call_to_action_type: string | null;
  image_url: string | null;
  media_type: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ════════════════════════════════════════
    // ACTION: analyze_and_generate
    // Analyzes top-performing Meta ads for a client and generates a creative brief
    // ════════════════════════════════════════
    if (action === "analyze_and_generate") {
      const { client_id, brief_type, top_n, date_range_days } = body;
      if (!client_id) {
        return jsonResp({ error: "Missing client_id" }, 400);
      }

      // 1. Get client info
      const { data: client } = await supabase
        .from("clients")
        .select("id, name, description, brand_colors, brand_fonts, website_url, logo_url")
        .eq("id", client_id)
        .single();

      if (!client) {
        return jsonResp({ error: "Client not found" }, 404);
      }

      // 2. Get client offers (for context)
      const { data: offers } = await supabase
        .from("client_offers")
        .select("title, description, offer_type, target_audience, key_benefits, price_point")
        .eq("client_id", client_id)
        .limit(5);

      // 3. Fetch top-performing ads by attributed leads (or spend if no attribution)
      const limit = top_n || 10;
      const sinceDays = date_range_days || 30;
      const sinceDate = new Date();
      sinceDate.setUTCDate(sinceDate.getUTCDate() - sinceDays);

      const { data: topAds, error: adsError } = await supabase
        .from("meta_ads")
        .select(`
          meta_ad_id, name, status, spend, impressions, clicks, ctr, cpc, cpm, reach,
          conversions, cost_per_conversion, headline, body, call_to_action_type,
          image_url, video_thumbnail_url, media_type, preview_url, thumbnail_url,
          attributed_leads, attributed_calls, attributed_showed,
          attributed_funded, attributed_funded_dollars,
          cost_per_lead, cost_per_call, cost_per_funded
        `)
        .eq("client_id", client_id)
        .gt("spend", 0)
        .gte("synced_at", sinceDate.toISOString())
        .order("attributed_leads", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (adsError) {
        return jsonResp({ error: `Failed to fetch ads: ${adsError.message}` }, 500);
      }

      if (!topAds || topAds.length === 0) {
        return jsonResp({ error: "No ads with spend found for this client in the date range" }, 404);
      }

      // 4. Calculate aggregate performance
      const totals = topAds.reduce(
        (acc, ad) => ({
          spend: acc.spend + (Number(ad.spend) || 0),
          impressions: acc.impressions + (Number(ad.impressions) || 0),
          clicks: acc.clicks + (Number(ad.clicks) || 0),
          leads: acc.leads + (Number(ad.attributed_leads) || 0),
          calls: acc.calls + (Number(ad.attributed_calls) || 0),
          funded: acc.funded + (Number(ad.attributed_funded) || 0),
          funded_dollars: acc.funded_dollars + (Number(ad.attributed_funded_dollars) || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, leads: 0, calls: 0, funded: 0, funded_dollars: 0 }
      );

      const avgCPL = totals.leads > 0 ? totals.spend / totals.leads : null;
      const avgCPC = totals.clicks > 0 ? totals.spend / totals.clicks : null;
      const avgCTR = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;

      // 5. Build the performance snapshot
      const performanceSnapshot = {
        top_ads: topAds.slice(0, 5).map((ad) => ({
          ad_id: ad.meta_ad_id,
          name: ad.name,
          spend: Number(ad.spend) || 0,
          ctr: Number(ad.ctr) || 0,
          cpc: Number(ad.cpc) || 0,
          attributed_leads: Number(ad.attributed_leads) || 0,
          attributed_funded: Number(ad.attributed_funded) || 0,
          cost_per_lead: Number(ad.cost_per_lead) || null,
          headline: ad.headline,
          body: ad.body,
          cta: ad.call_to_action_type,
        })),
        totals: {
          spend: totals.spend,
          leads: totals.leads,
          calls: totals.calls,
          funded: totals.funded,
          funded_dollars: totals.funded_dollars,
          avg_cpl: avgCPL,
          avg_cpc: avgCPC,
          avg_ctr: avgCTR,
        },
        date_range: {
          start: sinceDate.toISOString().split("T")[0],
          end: new Date().toISOString().split("T")[0],
        },
        ads_analyzed: topAds.length,
      };

      // 6. Get Claude API key
      const { data: settings } = await supabase
        .from("agency_settings")
        .select("openai_api_key, xai_api_key")
        .limit(1)
        .maybeSingle();

      // Use Anthropic API key from env
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return jsonResp({ error: "ANTHROPIC_API_KEY not configured" }, 500);
      }

      // 7. Build the prompt
      const adSummaries = topAds
        .slice(0, 8)
        .map((ad, i) => {
          const lines = [`Ad ${i + 1}: "${ad.name}"`];
          if (ad.headline) lines.push(`  Headline: ${ad.headline}`);
          if (ad.body) lines.push(`  Body: ${ad.body?.substring(0, 200)}`);
          if (ad.call_to_action_type) lines.push(`  CTA: ${ad.call_to_action_type}`);
          lines.push(`  Spend: $${Number(ad.spend).toFixed(0)} | CTR: ${Number(ad.ctr).toFixed(2)}% | CPC: $${Number(ad.cpc).toFixed(2)}`);
          lines.push(`  Leads: ${ad.attributed_leads || 0} | CPL: ${ad.cost_per_lead ? '$' + Number(ad.cost_per_lead).toFixed(0) : 'N/A'} | Funded: ${ad.attributed_funded || 0}`);
          lines.push(`  Media: ${ad.media_type || 'unknown'}`);
          return lines.join("\n");
        })
        .join("\n\n");

      const offerContext = offers?.length
        ? offers.map((o) => `- ${o.title}: ${o.description || ''} (${o.offer_type || 'general'})`).join("\n")
        : "No offers configured";

      const prompt = `You are an elite performance marketing creative strategist analyzing Meta Ads data for ${client.name}.

CLIENT CONTEXT:
- Name: ${client.name}
- Description: ${client.description || 'Not specified'}
- Website: ${client.website_url || 'Not specified'}
- Current Offers:\n${offerContext}

PERFORMANCE DATA (Last ${sinceDays} days):
- Total Spend: $${totals.spend.toFixed(0)}
- Total Leads: ${totals.leads}
- Total Calls: ${totals.calls}
- Total Funded: ${totals.funded} ($${totals.funded_dollars.toFixed(0)})
- Average CPL: ${avgCPL ? '$' + avgCPL.toFixed(0) : 'N/A'}
- Average CTR: ${avgCTR ? avgCTR.toFixed(2) + '%' : 'N/A'}

TOP PERFORMING ADS:
${adSummaries}

TASK:
Analyze the performance data and top-performing ads. Generate a creative brief for the next round of ads.

Respond ONLY with valid JSON in this exact format:
{
  "title": "Brief title (concise, descriptive)",
  "target_audience": "Detailed target audience description based on what's working",
  "key_message": "Core value proposition that should anchor all creatives",
  "tone_and_style": "Voice, energy, emotional register based on winning patterns",
  "winning_hooks": ["Array of 3-5 hooks/opening lines that are working or should be tested"],
  "angles_to_test": ["Array of 3-5 new creative angles to explore based on performance gaps"],
  "visual_direction": "Art direction notes: what visual styles, formats, and production quality to aim for",
  "cta_recommendations": ["Array of 2-3 CTA variations to test"],
  "platform_specs": {
    "recommended_formats": ["video_9x16", "image_1x1", "carousel"],
    "video_length_seconds": 30,
    "key_specs": "Any platform-specific notes"
  },
  "additional_notes": "Strategic insights: patterns, fatigue signals, scaling opportunities"
}

Focus on ACTIONABLE creative direction. Reference specific winning patterns from the data. Be specific about what's working and why.`;

      // 8. Call Claude API
      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.error("[generate-creative-brief] Claude API error:", claudeResponse.status, errText);
        return jsonResp({ error: `Claude API error: ${claudeResponse.status}` }, 500);
      }

      const claudeData = await claudeResponse.json();
      const rawText = claudeData.content?.[0]?.text || "";

      // 9. Parse the response
      let briefContent: Record<string, unknown>;
      try {
        let cleaned = rawText.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
        briefContent = JSON.parse(cleaned.trim());
      } catch {
        console.error("[generate-creative-brief] Failed to parse Claude response:", rawText.substring(0, 500));
        return jsonResp({ error: "Failed to parse AI response", raw: rawText.substring(0, 1000) }, 500);
      }

      // 10. Save to creative_briefs table
      const { data: brief, error: insertError } = await supabase
        .from("creative_briefs")
        .insert({
          client_id,
          title: (briefContent.title as string) || `${client.name} — Performance Brief`,
          status: "pending",
          brief_type: brief_type || "performance",
          source_ad_ids: topAds.slice(0, 5).map((a) => a.meta_ad_id),
          performance_snapshot: performanceSnapshot,
          target_audience: briefContent.target_audience as string,
          key_message: briefContent.key_message as string,
          tone_and_style: briefContent.tone_and_style as string,
          winning_hooks: briefContent.winning_hooks as string[],
          angles_to_test: briefContent.angles_to_test as string[],
          visual_direction: briefContent.visual_direction as string,
          cta_recommendations: briefContent.cta_recommendations as string[],
          platform_specs: briefContent.platform_specs || {},
          additional_notes: briefContent.additional_notes as string,
          generated_by: "claude",
          model_used: CLAUDE_MODEL,
          generation_prompt: prompt,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[generate-creative-brief] Insert error:", insertError);
        return jsonResp({ error: `Failed to save brief: ${insertError.message}` }, 500);
      }

      return jsonResp({ success: true, brief });
    }

    // ════════════════════════════════════════
    // ACTION: generate_scripts
    // Takes a brief ID and generates 3 production-ready ad scripts
    // ════════════════════════════════════════
    if (action === "generate_scripts") {
      const { brief_id, num_scripts, script_type, platform } = body;
      if (!brief_id) {
        return jsonResp({ error: "Missing brief_id" }, 400);
      }

      // 1. Fetch the brief
      const { data: brief, error: briefError } = await supabase
        .from("creative_briefs")
        .select("*, client:clients(id, name, description, brand_colors, website_url)")
        .eq("id", brief_id)
        .single();

      if (briefError || !brief) {
        return jsonResp({ error: "Brief not found" }, 404);
      }

      // 2. Get API key
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return jsonResp({ error: "ANTHROPIC_API_KEY not configured" }, 500);
      }

      const count = num_scripts || 3;
      const type = script_type || "video";
      const plat = platform || "meta";

      // 3. Build prompt
      const prompt = `You are an elite ad copywriter creating ${count} production-ready ${type} ad scripts for ${(brief as any).client?.name || 'a client'}.

CREATIVE BRIEF:
- Title: ${brief.title}
- Target Audience: ${brief.target_audience || 'Not specified'}
- Key Message: ${brief.key_message || 'Not specified'}
- Tone & Style: ${brief.tone_and_style || 'Not specified'}
- Winning Hooks: ${(brief.winning_hooks || []).join(', ') || 'None'}
- Angles to Test: ${(brief.angles_to_test || []).join(', ') || 'None'}
- Visual Direction: ${brief.visual_direction || 'Not specified'}
- CTA Recommendations: ${(brief.cta_recommendations || []).join(', ') || 'None'}
- Additional Notes: ${brief.additional_notes || 'None'}

PERFORMANCE CONTEXT:
${JSON.stringify((brief.performance_snapshot as any)?.totals || {}, null, 2)}

Generate ${count} DISTINCT script variants. Each must have a different hook and angle.

Respond ONLY with valid JSON — an array of ${count} objects:
[
  {
    "title": "Script title",
    "hook": "Opening hook (first 3 seconds — must stop the scroll)",
    "body_copy": "Full script body with scene directions in [brackets]",
    "cta": "Call to action text",
    "visual_notes": "B-roll suggestions, scene setup, production notes",
    "audio_notes": "Music style, SFX, voiceover direction",
    "duration_seconds": 30,
    "aspect_ratio": "9:16"
  }
]

Make each script punchy, platform-native, and production-ready. The hooks MUST be different. Each variant should test a different angle from the brief.`;

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        return jsonResp({ error: `Claude API error: ${claudeResponse.status}` }, 500);
      }

      const claudeData = await claudeResponse.json();
      const rawText = claudeData.content?.[0]?.text || "";

      let scripts: Array<Record<string, unknown>>;
      try {
        let cleaned = rawText.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
        scripts = JSON.parse(cleaned.trim());
        if (!Array.isArray(scripts)) scripts = [scripts];
      } catch {
        return jsonResp({ error: "Failed to parse AI script response", raw: rawText.substring(0, 1000) }, 500);
      }

      // 4. Save scripts to ad_scripts table
      const savedScripts = [];
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        const { data: saved, error: saveErr } = await supabase
          .from("ad_scripts")
          .insert({
            brief_id,
            client_id: brief.client_id,
            title: (s.title as string) || `Script ${i + 1}`,
            status: "draft",
            script_type: type,
            platform: plat,
            variant_number: i + 1,
            hook: s.hook as string,
            body_copy: s.body_copy as string,
            cta: s.cta as string,
            visual_notes: s.visual_notes as string,
            audio_notes: s.audio_notes as string,
            duration_seconds: (s.duration_seconds as number) || 30,
            aspect_ratio: (s.aspect_ratio as string) || "9:16",
            generated_by: "claude",
            model_used: CLAUDE_MODEL,
            generation_prompt: prompt,
          })
          .select()
          .single();

        if (saveErr) {
          console.error(`[generate-creative-brief] Script ${i + 1} save error:`, saveErr);
        } else if (saved) {
          savedScripts.push(saved);
        }
      }

      // 5. Update brief status and script count
      await supabase
        .from("creative_briefs")
        .update({
          status: "in_production",
          scripts_generated: savedScripts.length,
        })
        .eq("id", brief_id);

      return jsonResp({ success: true, scripts: savedScripts, brief_id });
    }

    // ════════════════════════════════════════
    // ACTION: list_briefs
    // List briefs for a client with optional status filter
    // ════════════════════════════════════════
    if (action === "list_briefs") {
      const { client_id, status } = body;
      let query = supabase
        .from("creative_briefs")
        .select("*, scripts:ad_scripts(id, title, status, variant_number)")
        .order("created_at", { ascending: false });

      if (client_id) query = query.eq("client_id", client_id);
      if (status) query = query.eq("status", status);

      const { data, error } = await query.limit(50);
      if (error) return jsonResp({ error: error.message }, 500);
      return jsonResp({ briefs: data || [] });
    }

    // ════════════════════════════════════════
    // ACTION: get_brief
    // Get a single brief with its scripts
    // ════════════════════════════════════════
    if (action === "get_brief") {
      const { brief_id } = body;
      if (!brief_id) return jsonResp({ error: "Missing brief_id" }, 400);

      const { data, error } = await supabase
        .from("creative_briefs")
        .select("*, scripts:ad_scripts(*), client:clients(id, name, logo_url)")
        .eq("id", brief_id)
        .single();

      if (error) return jsonResp({ error: error.message }, 404);
      return jsonResp({ brief: data });
    }

    // ════════════════════════════════════════
    // ACTION: update_script_status
    // ════════════════════════════════════════
    if (action === "update_script_status") {
      const { script_id, status: newStatus, review_notes, reviewed_by } = body;
      if (!script_id || !newStatus) return jsonResp({ error: "Missing script_id or status" }, 400);

      const update: Record<string, unknown> = { status: newStatus };
      if (review_notes) update.review_notes = review_notes;
      if (reviewed_by) {
        update.reviewed_by = reviewed_by;
        update.reviewed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("ad_scripts")
        .update(update)
        .eq("id", script_id)
        .select()
        .single();

      if (error) return jsonResp({ error: error.message }, 500);

      // If all scripts for a brief are completed, mark brief as completed
      if (newStatus === "completed" && data) {
        const { count } = await supabase
          .from("ad_scripts")
          .select("*", { count: "exact", head: true })
          .eq("brief_id", (data as any).brief_id)
          .neq("status", "completed")
          .neq("status", "rejected");

        if (count === 0) {
          await supabase
            .from("creative_briefs")
            .update({ status: "completed" })
            .eq("id", (data as any).brief_id);
        }
      }

      return jsonResp({ success: true, script: data });
    }

    return jsonResp({ error: "Invalid action. Use: analyze_and_generate, generate_scripts, list_briefs, get_brief, update_script_status" }, 400);
  } catch (err) {
    console.error("[generate-creative-brief] Error:", err);
    return jsonResp({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
