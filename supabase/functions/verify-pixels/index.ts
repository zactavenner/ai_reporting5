import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectedEvent {
  platform: 'meta' | 'google' | 'linkedin' | 'tiktok';
  event: string;
  type: 'standard' | 'custom';
  conversionId?: string;
}

interface PixelResult {
  platform: 'meta' | 'google' | 'linkedin' | 'tiktok';
  name: string;
  detected: boolean;
  pixelId?: string;
  events?: string[];
  confidence: 'high' | 'medium' | 'low';
}

// Standard events by platform
const STANDARD_EVENTS = {
  meta: ['PageView', 'Lead', 'Schedule', 'CompleteRegistration', 'Purchase', 'ViewContent', 'InitiateCheckout', 'AddToCart', 'AddPaymentInfo', 'Contact', 'FindLocation', 'CustomizeProduct', 'Donate', 'Search', 'StartTrial', 'Subscribe'],
  google: ['page_view', 'conversion', 'generate_lead', 'purchase', 'sign_up', 'add_to_cart', 'begin_checkout', 'view_item', 'search', 'login', 'add_payment_info', 'add_to_wishlist'],
  linkedin: ['conversion', 'page_load'],
  tiktok: ['PageView', 'ViewContent', 'ClickButton', 'SubmitForm', 'CompleteRegistration', 'PlaceAnOrder', 'Contact', 'Download', 'Search', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompletePayment'],
};

// Patterns to detect various tracking pixels
const PIXEL_PATTERNS = {
  meta: {
    name: 'Meta Pixel (Facebook)',
    patterns: [
      /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/gi,
      /facebook\.com\/tr/gi,
      /connect\.facebook\.net.*fbevents\.js/gi,
      /fbevents\.js/gi,
      /_fbq\s*=/gi,
    ],
    idPattern: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/i,
  },
  google: {
    name: 'Google Ads / Analytics',
    patterns: [
      /gtag\s*\(/gi,
      /googletagmanager\.com\/gtag/gi,
      /googletagmanager\.com\/gtm\.js/gi,
      /google-analytics\.com\/analytics\.js/gi,
      /googleadservices\.com\/pagead\/conversion/gi,
      /gtm\.js/gi,
      /GA_TRACKING_ID/gi,
      /G-[A-Z0-9]+/gi,
      /AW-[0-9]+/gi,
      /UA-[0-9]+-[0-9]+/gi,
    ],
    idPattern: /(G-[A-Z0-9]+|AW-[0-9]+|UA-[0-9]+-[0-9]+|GTM-[A-Z0-9]+)/i,
  },
  linkedin: {
    name: 'LinkedIn Insight Tag',
    patterns: [
      /linkedin\.com\/px/gi,
      /snap\.licdn\.com\/li\.lms-analytics/gi,
      /lintrk/gi,
      /_linkedin_partner_id/gi,
      /linkedin-ads\.js/gi,
    ],
    idPattern: /_linkedin_partner_id\s*=\s*['"]?(\d+)['"]?/i,
  },
  tiktok: {
    name: 'TikTok Pixel',
    patterns: [
      /ttq\.load/gi,
      /analytics\.tiktok\.com/gi,
      /tiktok-pixel/gi,
      /ttq\s*\(/gi,
    ],
    idPattern: /ttq\.load\s*\(\s*['"]([A-Z0-9]+)['"]/i,
  },
};

// Comprehensive event detection patterns
const EVENT_PATTERNS = {
  meta: {
    // Standard track events
    standard: [
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]PageView['"]/gi, event: 'PageView' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Lead['"]/gi, event: 'Lead' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Schedule['"]/gi, event: 'Schedule' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]CompleteRegistration['"]/gi, event: 'CompleteRegistration' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Purchase['"]/gi, event: 'Purchase' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]ViewContent['"]/gi, event: 'ViewContent' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]InitiateCheckout['"]/gi, event: 'InitiateCheckout' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]AddToCart['"]/gi, event: 'AddToCart' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]AddPaymentInfo['"]/gi, event: 'AddPaymentInfo' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Contact['"]/gi, event: 'Contact' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]FindLocation['"]/gi, event: 'FindLocation' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]CustomizeProduct['"]/gi, event: 'CustomizeProduct' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Donate['"]/gi, event: 'Donate' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Search['"]/gi, event: 'Search' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]StartTrial['"]/gi, event: 'StartTrial' },
      { pattern: /fbq\s*\(\s*['"]track['"]\s*,\s*['"]Subscribe['"]/gi, event: 'Subscribe' },
    ],
    // Custom events pattern - extracts event name dynamically
    customPattern: /fbq\s*\(\s*['"]trackCustom['"]\s*,\s*['"]([^'"]+)['"]/gi,
  },
  google: {
    // Standard gtag events
    standard: [
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]page_view['"]/gi, event: 'page_view' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]conversion['"]/gi, event: 'conversion' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]generate_lead['"]/gi, event: 'generate_lead' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]purchase['"]/gi, event: 'purchase' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]sign_up['"]/gi, event: 'sign_up' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]add_to_cart['"]/gi, event: 'add_to_cart' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]begin_checkout['"]/gi, event: 'begin_checkout' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]view_item['"]/gi, event: 'view_item' },
      { pattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]search['"]/gi, event: 'search' },
      { pattern: /gtag\s*\(\s*['"]config['"]/gi, event: 'config' },
    ],
    // All gtag events pattern - extracts event name dynamically
    customPattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/gi,
    // Google Ads conversion pattern with conversion ID
    conversionPattern: /gtag\s*\(\s*['"]event['"]\s*,\s*['"]conversion['"]\s*,\s*\{[^}]*['"]send_to['"]\s*:\s*['"]([^'"]+)['"]/gi,
  },
  linkedin: {
    standard: [
      { pattern: /lintrk\s*\(\s*['"]track['"]/gi, event: 'Track' },
      { pattern: /linkedin.*conversion/gi, event: 'Conversion' },
    ],
    // LinkedIn conversion with conversion_id
    customPattern: /lintrk\s*\(\s*['"]track['"]\s*,\s*\{[^}]*conversion_id\s*:\s*['"]?(\d+)['"]?/gi,
  },
  tiktok: {
    standard: [
      { pattern: /ttq\.page\s*\(/gi, event: 'PageView' },
      { pattern: /ttq\.track\s*\(\s*['"]ViewContent['"]/gi, event: 'ViewContent' },
      { pattern: /ttq\.track\s*\(\s*['"]ClickButton['"]/gi, event: 'ClickButton' },
      { pattern: /ttq\.track\s*\(\s*['"]SubmitForm['"]/gi, event: 'SubmitForm' },
      { pattern: /ttq\.track\s*\(\s*['"]CompleteRegistration['"]/gi, event: 'CompleteRegistration' },
      { pattern: /ttq\.track\s*\(\s*['"]PlaceAnOrder['"]/gi, event: 'PlaceAnOrder' },
      { pattern: /ttq\.track\s*\(\s*['"]Contact['"]/gi, event: 'Contact' },
      { pattern: /ttq\.track\s*\(\s*['"]Download['"]/gi, event: 'Download' },
      { pattern: /ttq\.track\s*\(\s*['"]Search['"]/gi, event: 'Search' },
      { pattern: /ttq\.track\s*\(\s*['"]AddToCart['"]/gi, event: 'AddToCart' },
    ],
    // All TikTok events pattern
    customPattern: /ttq\.track\s*\(\s*['"]([^'"]+)['"]/gi,
  },
};

async function fetchPageContent(url: string): Promise<string> {
  // First try direct fetch with a realistic browser user agent
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    
    if (response.ok) {
      return await response.text();
    }
    
    console.log(`Direct fetch returned ${response.status}, falling back to Firecrawl`);
  } catch (error) {
    console.log('Direct fetch failed, falling back to Firecrawl:', error);
  }

  // Fallback: use Firecrawl to scrape the page (handles bot protection)
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlKey) {
    throw new Error('Page blocked direct access and FIRECRAWL_API_KEY is not configured');
  }

  const fcResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['rawHtml'],
      waitFor: 3000,
    }),
  });

  if (!fcResponse.ok) {
    const errText = await fcResponse.text();
    throw new Error(`Firecrawl scrape failed (${fcResponse.status}): ${errText}`);
  }

  const fcData = await fcResponse.json();
  const html = fcData?.data?.rawHtml;
  if (!html) {
    throw new Error('Firecrawl returned no HTML content');
  }

  return html;
}

function detectAllEvents(html: string): DetectedEvent[] {
  const allEvents: DetectedEvent[] = [];
  const seenEvents = new Set<string>();
  
  for (const [platform, config] of Object.entries(EVENT_PATTERNS)) {
    const platformKey = platform as 'meta' | 'google' | 'linkedin' | 'tiktok';
    const standardEvents = STANDARD_EVENTS[platformKey];
    
    // Check standard events
    if (config.standard) {
      for (const eventConfig of config.standard) {
        if (html.match(eventConfig.pattern)) {
          const eventKey = `${platform}:${eventConfig.event}`;
          if (!seenEvents.has(eventKey)) {
            seenEvents.add(eventKey);
            allEvents.push({
              platform: platformKey,
              event: eventConfig.event,
              type: 'standard',
            });
          }
        }
      }
    }
    
    // Extract custom/all events using dynamic pattern
    if (config.customPattern) {
      const pattern = new RegExp(config.customPattern.source, config.customPattern.flags);
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const eventName = match[1];
        if (eventName) {
          const eventKey = `${platform}:${eventName}`;
          if (!seenEvents.has(eventKey)) {
            seenEvents.add(eventKey);
            const isStandard = standardEvents.some(e => 
              e.toLowerCase() === eventName.toLowerCase()
            );
            allEvents.push({
              platform: platformKey,
              event: eventName,
              type: isStandard ? 'standard' : 'custom',
            });
          }
        }
      }
    }
    
    // Google Ads conversion with conversion ID
    if (platform === 'google' && 'conversionPattern' in config) {
      const convPattern = new RegExp((config as any).conversionPattern.source, (config as any).conversionPattern.flags);
      let match;
      while ((match = convPattern.exec(html)) !== null) {
        const conversionId = match[1];
        const eventKey = `google:conversion:${conversionId}`;
        if (!seenEvents.has(eventKey)) {
          seenEvents.add(eventKey);
          allEvents.push({
            platform: 'google',
            event: 'conversion',
            type: 'standard',
            conversionId,
          });
        }
      }
    }
  }
  
  return allEvents;
}

function detectPixels(html: string, allEvents: DetectedEvent[]): PixelResult[] {
  const results: PixelResult[] = [];
  
  for (const [platform, config] of Object.entries(PIXEL_PATTERNS)) {
    let detected = false;
    let matchCount = 0;
    let pixelId: string | undefined;
    
    // Check for presence patterns
    for (const pattern of config.patterns) {
      const matches = html.match(pattern);
      if (matches) {
        detected = true;
        matchCount += matches.length;
      }
    }
    
    // Try to extract pixel ID
    if (detected && config.idPattern) {
      const idMatch = html.match(config.idPattern);
      if (idMatch && idMatch[1]) {
        pixelId = idMatch[1];
      }
    }
    
    // Get events for this platform
    const platformEvents = allEvents
      .filter(e => e.platform === platform)
      .map(e => e.event);
    
    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (pixelId && matchCount >= 2) {
      confidence = 'high';
    } else if (matchCount >= 2 || pixelId) {
      confidence = 'medium';
    }
    
    results.push({
      platform: platform as 'meta' | 'google' | 'linkedin' | 'tiktok',
      name: config.name,
      detected,
      pixelId,
      events: platformEvents.length > 0 ? platformEvents : undefined,
      confidence,
    });
  }
  
  return results;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { url, stepId, clientId, persistResults } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log('Verifying pixels for URL:', url);
    
    // Fetch the page content
    const html = await fetchPageContent(url);
    
    // Detect all events (standard + custom)
    const allEvents = detectAllEvents(html);
    
    // Detect pixels with events
    const pixels = detectPixels(html, allEvents);
    
    console.log('Pixel detection results:', pixels);
    console.log('All events detected:', allEvents);
    
    const scannedAt = new Date().toISOString();
    
    // Flatten all detected events for storage
    const eventsDetected = allEvents.map(e => `${e.platform}:${e.event}`);
    
    // Prepare response
    const response = {
      success: true,
      pixels,
      allEvents,
      scannedAt,
    };
    
    // Persist results if requested
    if (persistResults && stepId && clientId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Fetch expected events for this step
        const { data: expectedEvents } = await supabase
          .from('pixel_expected_events')
          .select('platform, event_name')
          .eq('step_id', stepId);
        
        // Calculate missing expected events
        const missingExpected: string[] = [];
        if (expectedEvents && expectedEvents.length > 0) {
          for (const expected of expectedEvents) {
            const key = `${expected.platform}:${expected.event_name}`;
            if (!eventsDetected.includes(key)) {
              missingExpected.push(key);
            }
          }
        }
        
        // Determine status
        let status: 'pass' | 'warning' | 'fail' = 'pass';
        if (missingExpected.length > 0) {
          status = 'fail';
        } else if (!pixels.some(p => p.detected)) {
          status = 'warning';
        }
        
        // Insert verification record
        await supabase.from('pixel_verifications').insert({
          step_id: stepId,
          client_id: clientId,
          scanned_at: scannedAt,
          results: response,
          status,
          events_detected: eventsDetected,
          missing_expected: missingExpected,
        });
        
        console.log('Verification results persisted');
      } catch (persistError) {
        console.error('Failed to persist results:', persistError);
        // Don't fail the request if persistence fails
      }
    }
    
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Pixel verification error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        pixels: [],
        allEvents: [],
        scannedAt: new Date().toISOString(),
        error: error.message || 'Failed to verify pixels',
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
