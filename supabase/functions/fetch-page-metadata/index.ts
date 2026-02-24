import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, stepId, forceRefresh } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Check cache if stepId provided
    if (stepId && !forceRefresh) {
      const { data: cached } = await sb
        .from("funnel_step_metadata")
        .select("*")
        .eq("step_id", stepId)
        .maybeSingle();

      if (cached) {
        const fetchedAt = new Date(cached.fetched_at);
        const hoursSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);
        // Return cache if less than 24 hours old and URL hasn't changed
        if (hoursSince < 24 && cached.url === url) {
          return new Response(JSON.stringify({
            title: cached.title,
            description: cached.description,
            image: cached.image,
            siteName: cached.site_name,
            favicon: cached.favicon,
            fetchedAt: cached.fetched_at,
            cached: true,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fetch fresh metadata
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MetadataBot/1.0)",
        Accept: "text/html",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await response.text();

    const getMetaContent = (name: string): string | null => {
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i"),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return match[1];
      }
      return null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    const metadata = {
      title: getMetaContent("og:title") || titleMatch?.[1]?.trim() || null,
      description: getMetaContent("og:description") || getMetaContent("description") || null,
      image: getMetaContent("og:image") || null,
      siteName: getMetaContent("og:site_name") || null,
      favicon: null as string | null,
    };

    // Extract favicon
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i)
      || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
    if (faviconMatch?.[1]) {
      let favicon = faviconMatch[1];
      if (favicon.startsWith("//")) favicon = "https:" + favicon;
      else if (favicon.startsWith("/")) {
        const origin = new URL(url).origin;
        favicon = origin + favicon;
      }
      metadata.favicon = favicon;
    }

    // Resolve relative OG image
    if (metadata.image && !metadata.image.startsWith("http")) {
      if (metadata.image.startsWith("//")) {
        metadata.image = "https:" + metadata.image;
      } else if (metadata.image.startsWith("/")) {
        metadata.image = new URL(url).origin + metadata.image;
      }
    }

    // Save to cache if stepId provided
    const now = new Date().toISOString();
    if (stepId) {
      await sb
        .from("funnel_step_metadata")
        .upsert({
          step_id: stepId,
          url,
          title: metadata.title,
          description: metadata.description,
          image: metadata.image,
          site_name: metadata.siteName,
          favicon: metadata.favicon,
          fetched_at: now,
        }, { onConflict: "step_id" });
    }

    return new Response(JSON.stringify({ ...metadata, fetchedAt: now, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Metadata fetch error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
