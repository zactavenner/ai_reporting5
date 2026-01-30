import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, pageId, adsLibraryUrl } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "clientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pageId && !adsLibraryUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "pageId or adsLibraryUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construct the Ads Library URL
    let targetUrl = adsLibraryUrl;
    if (!targetUrl && pageId) {
      targetUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=${pageId}`;
    }

    console.log("Scraping Facebook Ads Library:", targetUrl);

    // Scrape the page using Firecrawl
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown", "html", "screenshot", "links"],
        waitFor: 8000, // Increased wait for dynamic content
        onlyMainContent: false,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error("Firecrawl API error:", scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || "Failed to scrape page" }),
        { status: scrapeResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const html = scrapeData.data?.html || scrapeData.html || "";
    const screenshot = scrapeData.data?.screenshot || scrapeData.screenshot;
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};
    const links = scrapeData.data?.links || scrapeData.links || [];

    console.log("Raw markdown length:", markdown.length);
    console.log("Links found:", links.length);

    // Parse ads from the scraped content with improved logic
    const parsedAds = parseAdsFromContent(markdown, html, pageId || extractPageIdFromUrl(targetUrl), metadata, links);

    console.log(`Parsed ${parsedAds.length} ads from content`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store the scraped ads
    const storedAds = [];
    for (const ad of parsedAds) {
      const { data: insertedAd, error: insertError } = await supabase
        .from("client_live_ads")
        .upsert({
          client_id: clientId,
          page_id: ad.pageId,
          page_name: ad.pageName,
          ad_library_url: targetUrl,
          primary_text: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          cta_type: ad.ctaType,
          media_type: ad.mediaType,
          media_urls: ad.mediaUrls,
          thumbnail_url: ad.bestImageUrl || screenshot,
          status: "active",
          platforms: ad.platforms,
          started_running_on: ad.startedRunningOn,
          raw_markdown: markdown.substring(0, 10000),
          scraped_at: new Date().toISOString(),
        }, {
          onConflict: "id",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting ad:", insertError);
      } else if (insertedAd) {
        storedAds.push(insertedAd);
      }
    }

    // If no ads were parsed, still store the scrape result as a single entry
    if (parsedAds.length === 0 && (markdown || screenshot)) {
      const pageName = extractPageName(markdown, metadata);
      const startDate = extractStartDate(markdown);
      const platforms = extractPlatforms(markdown);
      const primaryText = extractFullPrimaryText(markdown);
      const imageUrls = extractImageUrls(markdown, links);
      
      const { data: insertedAd, error: insertError } = await supabase
        .from("client_live_ads")
        .insert({
          client_id: clientId,
          page_id: pageId || extractPageIdFromUrl(targetUrl),
          page_name: pageName,
          ad_library_url: targetUrl,
          primary_text: primaryText,
          thumbnail_url: imageUrls.length > 0 ? imageUrls[0] : screenshot,
          media_urls: imageUrls,
          status: "active",
          platforms: platforms,
          started_running_on: startDate,
          raw_markdown: markdown.substring(0, 10000),
          scraped_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!insertError && insertedAd) {
        storedAds.push(insertedAd);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        adsCount: storedAds.length,
        ads: storedAds,
        screenshot,
        metadata,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error scraping Facebook Ads:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to scrape ads";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractPageIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get("view_all_page_id") || urlObj.searchParams.get("id");
  } catch {
    return null;
  }
}

// Extract the advertiser/page name from markdown or metadata
function extractPageName(markdown: string, metadata: Record<string, unknown>): string {
  // Try metadata title first - often contains "Page Name - Ad Library"
  const metaTitle = metadata?.title as string || "";
  const titleMatch = metaTitle.match(/^(.+?)\s*[-–—]\s*Ad Library/i);
  if (titleMatch && titleMatch[1].trim() && titleMatch[1].trim() !== "Ad Library") {
    return titleMatch[1].trim();
  }

  // Look for page name patterns in markdown headers
  const headerMatch = markdown.match(/^#\s+(.+?)(?:\s*[-–—]|$)/m);
  if (headerMatch && headerMatch[1].trim() && !headerMatch[1].includes("Ad Library")) {
    return headerMatch[1].trim();
  }

  // Look for "About this ad" section which often has the page name
  const aboutMatch = markdown.match(/About this ad[\s\S]*?(?:by|from)\s+([A-Za-z0-9\s&]+)/i);
  if (aboutMatch) {
    return aboutMatch[1].trim();
  }

  // Look for bold text at the beginning (often page name)
  const boldMatch = markdown.match(/^\*\*([^*]+)\*\*/m);
  if (boldMatch && boldMatch[1].length > 3 && boldMatch[1].length < 100) {
    return boldMatch[1].trim();
  }

  return metaTitle.replace(/\s*[-–—]\s*Ad Library.*$/i, "").trim() || "Facebook Ad";
}

// Extract "Started running on" date
function extractStartDate(markdown: string): string | null {
  // Match various date formats
  const patterns = [
    /Started running on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /Started running on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Started\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /Running since\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      try {
        const dateStr = match[1].replace(/,/, "");
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split("T")[0]; // Return YYYY-MM-DD format
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

// Extract platforms (Facebook, Instagram, etc.)
function extractPlatforms(markdown: string): string[] {
  const platforms: string[] = [];
  const platformPatterns = [
    { pattern: /\bfacebook\b/i, name: "facebook" },
    { pattern: /\binstagram\b/i, name: "instagram" },
    { pattern: /\bmessenger\b/i, name: "messenger" },
    { pattern: /\baudience network\b/i, name: "audience_network" },
    { pattern: /\bmeta\b/i, name: "meta" },
  ];

  for (const { pattern, name } of platformPatterns) {
    if (pattern.test(markdown)) {
      platforms.push(name);
    }
  }

  // Default to facebook if no platforms detected
  return platforms.length > 0 ? platforms : ["facebook"];
}

// Extract the full primary text (ad copy)
function extractFullPrimaryText(markdown: string): string {
  // Remove headers, links, and navigation items
  const cleanedLines = markdown.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("#")) return false;
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length < 50) return false;
    if (trimmed.match(/^\[.*\]\(.*\)$/)) return false; // Skip pure links
    if (trimmed.match(/^[-•]\s*\[/)) return false; // Skip list links
    if (trimmed.length < 10) return false;
    // Skip navigation/menu items
    if (/^(Home|About|Help|Log In|Sign Up|Search|Menu|Create)/i.test(trimmed)) return false;
    return true;
  });

  // Find the longest coherent text block (likely the ad copy)
  const paragraphs: string[] = [];
  let currentParagraph = "";

  for (const line of cleanedLines) {
    const trimmed = line.trim();
    // Check if this looks like ad copy (has sentences, emojis, or promotional language)
    const looksLikeAdCopy = 
      trimmed.length > 50 ||
      /[✅🎯💰📈🔥⭐️✨🚀💪❤️]/.test(trimmed) ||
      /\b(invest|fund|capital|opportunity|learn more|sign up|free|limited|exclusive)\b/i.test(trimmed);

    if (looksLikeAdCopy) {
      currentParagraph += (currentParagraph ? " " : "") + trimmed;
    } else if (currentParagraph) {
      paragraphs.push(currentParagraph);
      currentParagraph = "";
    }
  }
  
  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }

  // Return the longest paragraph (most likely to be the main ad copy)
  const bestParagraph = paragraphs.sort((a, b) => b.length - a.length)[0] || "";
  return bestParagraph.substring(0, 1000); // Limit to 1000 chars
}

// Extract image URLs from markdown and links
function extractImageUrls(markdown: string, links: string[]): string[] {
  const imageUrls: string[] = [];
  
  // Extract from markdown image syntax
  const mdImageMatches = [...markdown.matchAll(/!\[.*?\]\((https?:\/\/[^\)]+)\)/g)];
  for (const match of mdImageMatches) {
    imageUrls.push(match[1]);
  }

  // Extract from links that look like images
  for (const link of links) {
    if (/\.(jpg|jpeg|png|gif|webp)/i.test(link) || 
        /scontent.*fbcdn/i.test(link) ||
        /external.*fbcdn/i.test(link)) {
      if (!imageUrls.includes(link)) {
        imageUrls.push(link);
      }
    }
  }

  // Sort by likely quality (prefer larger dimensions in URL)
  return imageUrls.sort((a, b) => {
    const getSizeScore = (url: string) => {
      const match600 = /600|720|1080|1200/i.test(url);
      const match300 = /300|400|500/i.test(url);
      const matchSmall = /60|100|150/i.test(url);
      if (match600) return 3;
      if (match300) return 2;
      if (matchSmall) return 0;
      return 1;
    };
    return getSizeScore(b) - getSizeScore(a);
  });
}

// Extract CTA button type
function extractCTA(markdown: string): string | null {
  const ctaPatterns = [
    "Learn More",
    "Sign Up",
    "Shop Now",
    "Book Now",
    "Contact Us",
    "Get Quote",
    "Apply Now",
    "Download",
    "Get Started",
    "Subscribe",
    "Watch More",
    "See More",
    "Get Offer",
    "Request Time",
  ];

  for (const cta of ctaPatterns) {
    if (markdown.toLowerCase().includes(cta.toLowerCase())) {
      return cta;
    }
  }
  return null;
}

interface ParsedAd {
  pageId: string | null;
  pageName: string;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  ctaType: string | null;
  mediaType: string;
  mediaUrls: string[];
  bestImageUrl: string | null;
  platforms: string[];
  startedRunningOn: string | null;
}

function parseAdsFromContent(
  markdown: string, 
  html: string, 
  pageId: string | null,
  metadata: Record<string, unknown>,
  links: string[]
): ParsedAd[] {
  const ads: ParsedAd[] = [];

  // Try to find ad section markers
  const adSections = markdown.split(/(?=Started running on|Active\s+(?:on|since)|Ad Details)/gi);

  // If no clear sections, treat as single ad
  if (adSections.length <= 1) {
    const pageName = extractPageName(markdown, metadata);
    const startDate = extractStartDate(markdown);
    const platforms = extractPlatforms(markdown);
    const primaryText = extractFullPrimaryText(markdown);
    const imageUrls = extractImageUrls(markdown, links);
    const ctaType = extractCTA(markdown);

    if (primaryText || imageUrls.length > 0) {
      ads.push({
        pageId,
        pageName,
        primaryText,
        headline: null,
        description: null,
        ctaType,
        mediaType: detectMediaType(markdown),
        mediaUrls: imageUrls,
        bestImageUrl: imageUrls[0] || null,
        platforms,
        startedRunningOn: startDate,
      });
    }
    return ads;
  }

  // Process each section
  for (const section of adSections) {
    if (section.length < 100) continue;

    const ad: ParsedAd = {
      pageId,
      pageName: extractPageName(section, metadata),
      primaryText: extractFullPrimaryText(section),
      headline: null,
      description: null,
      ctaType: extractCTA(section),
      mediaType: detectMediaType(section),
      mediaUrls: extractImageUrls(section, []),
      bestImageUrl: null,
      platforms: extractPlatforms(section),
      startedRunningOn: extractStartDate(section),
    };

    ad.bestImageUrl = ad.mediaUrls[0] || null;

    // Look for headline patterns
    const headlineMatch = section.match(/(?:headline|title)[:\s]*(.+)/i);
    if (headlineMatch) {
      ad.headline = headlineMatch[1].trim().substring(0, 200);
    }

    if (ad.primaryText || ad.mediaUrls.length > 0) {
      ads.push(ad);
    }
  }

  return ads;
}

function detectMediaType(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("video") || lower.includes("watch")) return "video";
  if (lower.includes("carousel") || lower.includes("multiple images")) return "carousel";
  return "image";
}
