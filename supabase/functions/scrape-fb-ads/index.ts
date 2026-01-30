import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApifyAdResult {
  id?: string;
  adArchiveID?: string;
  adId?: string;
  pageId?: string;
  pageName?: string;
  advertiserName?: string;
  startDate?: string;
  startedRunningOn?: string;
  endDate?: string;
  isActive?: boolean;
  status?: string;
  primaryText?: string;
  bodyText?: string;
  body?: string;
  adCreativeBody?: string;
  headline?: string;
  linkTitle?: string;
  description?: string;
  linkDescription?: string;
  callToAction?: string;
  ctaType?: string;
  ctaText?: string;
  cta?: string;
  platforms?: string[];
  publisherPlatforms?: string[];
  mediaType?: string;
  type?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  videoHdUrl?: string;
  videoSdUrl?: string;
  images?: string[];
  videos?: { url?: string; hdUrl?: string; sdUrl?: string }[];
  snapshot?: {
    images?: { url?: string; resized_image_url?: string }[];
    videos?: { video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }[];
    body?: { text?: string };
    title?: string;
    link_description?: string;
    cta_text?: string;
  };
  adLibraryUrl?: string;
  libraryId?: string;
  impressionsText?: string;
  spendText?: string;
}

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

    const apiKey = Deno.env.get("APIFY_API_KEY");
    if (!apiKey) {
      console.error("APIFY_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Apify API key not configured. Please add your Apify API key in settings." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract page ID from URL if needed
    const targetPageId = pageId || extractPageIdFromUrl(adsLibraryUrl);
    
    if (!targetPageId) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract page ID from URL. Please provide a valid page ID." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping Facebook Ads Library with Apify for page:", targetPageId);

    // Call Apify's Facebook Ads Library Scraper
    const apifyResponse = await fetch(
      "https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=" + apiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageIds: [targetPageId],
          country: "US",
          adType: "all",
          adActiveStatus: "active",
          mediaType: "all",
          maxAds: 50, // Reasonable limit per scrape
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
          },
        }),
      }
    );

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      console.error("Apify API error:", apifyResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Apify API error: ${apifyResponse.status}. ${errorText.substring(0, 200)}` 
        }),
        { status: apifyResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apifyData: ApifyAdResult[] = await apifyResponse.json();
    
    console.log(`Apify returned ${apifyData.length} ads`);

    if (!Array.isArray(apifyData) || apifyData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          adsCount: 0, 
          ads: [],
          message: "No ads found for this page. The page may not have any active ads." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Construct ads library URL for reference
    const adsLibraryBaseUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id=${targetPageId}`;

    // Process and store each ad
    const storedAds = [];
    for (const ad of apifyData) {
      try {
        const parsedAd = parseApifyAd(ad, targetPageId, adsLibraryBaseUrl);
        
        // Generate a unique key for deduplication based on ad content
        const adLibraryId = ad.adArchiveID || ad.id || ad.libraryId || generateAdHash(parsedAd);

        const { data: insertedAd, error: insertError } = await supabase
          .from("client_live_ads")
          .upsert({
            client_id: clientId,
            ad_library_id: adLibraryId,
            page_id: parsedAd.pageId,
            page_name: parsedAd.pageName,
            ad_library_url: parsedAd.adLibraryUrl || adsLibraryBaseUrl,
            primary_text: parsedAd.primaryText,
            headline: parsedAd.headline,
            description: parsedAd.description,
            cta_type: parsedAd.ctaType,
            media_type: parsedAd.mediaType,
            media_urls: parsedAd.mediaUrls,
            thumbnail_url: parsedAd.thumbnailUrl,
            status: "active",
            platforms: parsedAd.platforms,
            started_running_on: parsedAd.startedRunningOn,
            impressions_bucket: parsedAd.impressionsBucket,
            scraped_at: new Date().toISOString(),
          }, {
            onConflict: "ad_library_id",
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error inserting ad:", insertError, "Ad ID:", adLibraryId);
        } else if (insertedAd) {
          storedAds.push(insertedAd);
        }
      } catch (adError) {
        console.error("Error processing ad:", adError);
      }
    }

    console.log(`Successfully stored ${storedAds.length} ads`);

    return new Response(
      JSON.stringify({
        success: true,
        adsCount: storedAds.length,
        ads: storedAds,
        totalFromApify: apifyData.length,
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

function extractPageIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get("view_all_page_id") || urlObj.searchParams.get("id");
  } catch {
    // Try regex as fallback
    const match = url.match(/view_all_page_id=(\d+)/);
    return match ? match[1] : null;
  }
}

interface ParsedAd {
  pageId: string;
  pageName: string;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  ctaType: string | null;
  mediaType: string;
  mediaUrls: string[];
  thumbnailUrl: string | null;
  platforms: string[];
  startedRunningOn: string | null;
  adLibraryUrl: string | null;
  impressionsBucket: string | null;
}

function parseApifyAd(ad: ApifyAdResult, pageId: string, baseUrl: string): ParsedAd {
  // Extract page name from various possible fields
  const pageName = ad.pageName || ad.advertiserName || "Facebook Ad";
  
  // Extract primary text (ad copy) from various possible fields
  const primaryText = 
    ad.primaryText || 
    ad.bodyText || 
    ad.body ||
    ad.adCreativeBody ||
    ad.snapshot?.body?.text ||
    null;
  
  // Extract headline
  const headline = 
    ad.headline || 
    ad.linkTitle ||
    ad.snapshot?.title ||
    null;
  
  // Extract description
  const description = 
    ad.description || 
    ad.linkDescription ||
    ad.snapshot?.link_description ||
    null;
  
  // Extract CTA
  const ctaType = 
    ad.callToAction || 
    ad.ctaType ||
    ad.ctaText ||
    ad.cta ||
    ad.snapshot?.cta_text ||
    null;
  
  // Extract platforms
  const platforms = ad.platforms || ad.publisherPlatforms || ["facebook"];
  
  // Extract media type
  let mediaType = "image";
  if (ad.mediaType) {
    mediaType = ad.mediaType.toLowerCase();
  } else if (ad.type) {
    mediaType = ad.type.toLowerCase();
  } else if (ad.videoUrl || ad.videoHdUrl || ad.videoSdUrl || (ad.videos && ad.videos.length > 0)) {
    mediaType = "video";
  } else if (ad.snapshot?.videos && ad.snapshot.videos.length > 0) {
    mediaType = "video";
  }
  
  // Collect all media URLs
  const mediaUrls: string[] = [];
  
  // Add images
  if (ad.imageUrl) mediaUrls.push(ad.imageUrl);
  if (ad.thumbnailUrl && !mediaUrls.includes(ad.thumbnailUrl)) mediaUrls.push(ad.thumbnailUrl);
  if (ad.images && Array.isArray(ad.images)) {
    for (const img of ad.images) {
      if (typeof img === "string" && !mediaUrls.includes(img)) {
        mediaUrls.push(img);
      }
    }
  }
  
  // Add snapshot images
  if (ad.snapshot?.images) {
    for (const img of ad.snapshot.images) {
      if (img.url && !mediaUrls.includes(img.url)) mediaUrls.push(img.url);
      if (img.resized_image_url && !mediaUrls.includes(img.resized_image_url)) mediaUrls.push(img.resized_image_url);
    }
  }
  
  // Add videos
  if (ad.videoUrl && !mediaUrls.includes(ad.videoUrl)) mediaUrls.push(ad.videoUrl);
  if (ad.videoHdUrl && !mediaUrls.includes(ad.videoHdUrl)) mediaUrls.push(ad.videoHdUrl);
  if (ad.videoSdUrl && !mediaUrls.includes(ad.videoSdUrl)) mediaUrls.push(ad.videoSdUrl);
  if (ad.videos && Array.isArray(ad.videos)) {
    for (const video of ad.videos) {
      if (video.hdUrl && !mediaUrls.includes(video.hdUrl)) mediaUrls.push(video.hdUrl);
      if (video.sdUrl && !mediaUrls.includes(video.sdUrl)) mediaUrls.push(video.sdUrl);
      if (video.url && !mediaUrls.includes(video.url)) mediaUrls.push(video.url);
    }
  }
  
  // Add snapshot videos
  if (ad.snapshot?.videos) {
    for (const video of ad.snapshot.videos) {
      if (video.video_hd_url && !mediaUrls.includes(video.video_hd_url)) mediaUrls.push(video.video_hd_url);
      if (video.video_sd_url && !mediaUrls.includes(video.video_sd_url)) mediaUrls.push(video.video_sd_url);
      if (video.video_preview_image_url && !mediaUrls.includes(video.video_preview_image_url)) {
        mediaUrls.push(video.video_preview_image_url);
      }
    }
  }
  
  // Determine best thumbnail
  const thumbnailUrl = 
    ad.thumbnailUrl || 
    ad.imageUrl || 
    (ad.snapshot?.images?.[0]?.url) ||
    (ad.snapshot?.videos?.[0]?.video_preview_image_url) ||
    mediaUrls[0] || 
    null;
  
  // Parse start date
  let startedRunningOn: string | null = null;
  const dateSource = ad.startDate || ad.startedRunningOn;
  if (dateSource) {
    try {
      const date = new Date(dateSource);
      if (!isNaN(date.getTime())) {
        startedRunningOn = date.toISOString().split("T")[0];
      }
    } catch {
      // Keep null
    }
  }
  
  // Build ad library URL
  const adLibraryUrl = ad.adLibraryUrl || 
    (ad.adArchiveID ? `https://www.facebook.com/ads/library/?id=${ad.adArchiveID}` : baseUrl);
  
  return {
    pageId: ad.pageId || pageId,
    pageName,
    primaryText: primaryText?.substring(0, 2000) || null,
    headline: headline?.substring(0, 500) || null,
    description: description?.substring(0, 500) || null,
    ctaType,
    mediaType,
    mediaUrls,
    thumbnailUrl,
    platforms: Array.isArray(platforms) ? platforms.map(p => p.toLowerCase()) : ["facebook"],
    startedRunningOn,
    adLibraryUrl,
    impressionsBucket: ad.impressionsText || ad.spendText || null,
  };
}

function generateAdHash(ad: ParsedAd): string {
  // Generate a simple hash for deduplication when no ID is available
  const content = `${ad.pageName}-${ad.primaryText?.substring(0, 50)}-${ad.thumbnailUrl}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `gen_${Math.abs(hash).toString(36)}`;
}
