import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Get all clients with website_url that don't have branding yet
    const { data: clients, error: fetchErr } = await sb
      .from("clients")
      .select("id, name, website_url, description, brand_colors, logo_url")
      .not("website_url", "is", null)
      .order("name");

    if (fetchErr) throw fetchErr;

    const results: { name: string; status: string; error?: string }[] = [];

    for (const client of clients || []) {
      if (!client.website_url) continue;

      // Skip if already has description and colors
      if (client.description && (client.brand_colors as any[])?.length > 0 && client.logo_url) {
        results.push({ name: client.name, status: "skipped (already has branding)" });
        continue;
      }

      try {
        console.log(`Scraping branding for ${client.name}: ${client.website_url}`);

        let formattedUrl = client.website_url.trim();
        if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
          formattedUrl = `https://${formattedUrl}`;
        }

        const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ["branding", "markdown"],
            onlyMainContent: true,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`Firecrawl error for ${client.name}:`, data);
          results.push({ name: client.name, status: "error", error: data.error || `HTTP ${response.status}` });
          continue;
        }

        const branding = data.data?.branding || data.branding || {};
        const metadata = data.data?.metadata || data.metadata || {};
        const markdown = data.data?.markdown || data.markdown || "";

        // Build description
        const cleanText = markdown.replace(/[#\*\[\]()!]/g, "").replace(/\n+/g, " ").trim();
        const description = cleanText.substring(0, 500) || metadata.description || "";

        // Extract colors
        const brandColors: string[] = [];
        if (branding.colors) {
          const colors = new Set<string>();
          for (const val of Object.values(branding.colors)) {
            if (typeof val === "string" && val.startsWith("#")) {
              colors.add(val);
            }
          }
          brandColors.push(...Array.from(colors).slice(0, 6));
        }

        // Extract fonts
        const brandFonts: string[] = [];
        if (branding.fonts) {
          brandFonts.push(
            ...branding.fonts
              .map((f: any) => f.family || f.name || f)
              .filter((f: string) => typeof f === "string")
              .slice(0, 4)
          );
        } else if (branding.typography?.fontFamilies) {
          const ff = branding.typography.fontFamilies;
          brandFonts.push(
            ...[...new Set(Object.values(ff).filter((v: any) => typeof v === "string"))].slice(0, 4) as string[]
          );
        }

        // Logo
        const logoUrl = branding.images?.logo || branding.logo || metadata.ogImage || "";

        // Update client
        const updateData: any = {};
        if (!client.description && description) updateData.description = description;
        if (!(client.brand_colors as any[])?.length && brandColors.length > 0) updateData.brand_colors = brandColors;
        if (!client.logo_url && logoUrl) updateData.logo_url = logoUrl;
        if (brandFonts.length > 0) updateData.brand_fonts = brandFonts;

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await sb
            .from("clients")
            .update(updateData)
            .eq("id", client.id);

          if (updateErr) {
            results.push({ name: client.name, status: "update_error", error: updateErr.message });
          } else {
            results.push({ name: client.name, status: "updated", ...updateData });
          }
        } else {
          results.push({ name: client.name, status: "no_new_data" });
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.error(`Error processing ${client.name}:`, e);
        results.push({ name: client.name, status: "error", error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("batch-scrape-branding error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
