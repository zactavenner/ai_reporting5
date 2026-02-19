import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("Scraping branding for:", formattedUrl);

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      console.error("Firecrawl error:", data);
      return new Response(JSON.stringify({ error: data.error || "Scrape failed" }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract useful info
    const branding = data.data?.branding || data.branding || {};
    const metadata = data.data?.metadata || data.metadata || {};
    const markdown = data.data?.markdown || data.markdown || "";

    // Build a concise summary description from the markdown (first ~500 chars)
    const cleanText = markdown.replace(/[#\*\[\]()!]/g, "").replace(/\n+/g, " ").trim();
    const description = cleanText.substring(0, 500);

    const result = {
      company_name: metadata.title || "",
      description,
      logo_url: branding.images?.logo || branding.logo || metadata.ogImage || "",
      brand_colors: [] as string[],
      brand_fonts: [] as string[],
    };

    // Extract colors
    if (branding.colors) {
      const colorObj = branding.colors;
      const colors = new Set<string>();
      for (const val of Object.values(colorObj)) {
        if (typeof val === "string" && val.startsWith("#")) {
          colors.add(val);
        }
      }
      result.brand_colors = Array.from(colors).slice(0, 6);
    }

    // Extract fonts
    if (branding.fonts) {
      result.brand_fonts = branding.fonts
        .map((f: any) => f.family || f.name || f)
        .filter((f: string) => typeof f === "string")
        .slice(0, 4);
    } else if (branding.typography?.fontFamilies) {
      const ff = branding.typography.fontFamilies;
      result.brand_fonts = [...new Set(Object.values(ff).filter((v: any) => typeof v === "string"))].slice(0, 4) as string[];
    }

    console.log("Brand scrape result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scrape-brand-info error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
