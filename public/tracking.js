/**
 * AI Reporting — Landing Page Tracking Snippet
 *
 * Captures UTM parameters, Meta click ID (fbclid), and page views,
 * sends them to record-touchpoint for attribution.
 *
 * USAGE (paste in <head> of client landing pages):
 * <script>
 *   window.AI_TRACKING_CONFIG = {
 *     supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
 *     clientId: 'YOUR_CLIENT_UUID',
 *   };
 * </script>
 * <script src="https://YOUR_APP_URL/tracking.js" async></script>
 */
(function () {
  'use strict';

  const config = window.AI_TRACKING_CONFIG;
  if (!config || !config.supabaseUrl || !config.clientId) {
    console.warn('[ai-tracking] Missing AI_TRACKING_CONFIG with supabaseUrl and clientId');
    return;
  }

  const ENDPOINT = config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/record-touchpoint';
  const STORAGE_KEY = 'ai_tracking_attribution';

  // ── Helper: parse URL query params ──
  function getQueryParams() {
    const params = {};
    const search = window.location.search.substring(1);
    if (!search) return params;
    search.split('&').forEach(function (pair) {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    });
    return params;
  }

  // ── Capture attribution from URL on first visit, persist in localStorage ──
  function captureAttribution() {
    const params = getQueryParams();
    const utm = {
      utm_source: params.utm_source || null,
      utm_medium: params.utm_medium || null,
      utm_campaign: params.utm_campaign || null,
      utm_content: params.utm_content || null,
      utm_term: params.utm_term || null,
      fbclid: params.fbclid || null, // Meta click ID
      gclid: params.gclid || null,   // Google click ID
      landing_page_url: window.location.href,
      referrer_url: document.referrer || null,
      first_seen_at: new Date().toISOString(),
    };

    // Only persist if we have at least one tracking param
    const hasTracking = utm.utm_source || utm.utm_campaign || utm.fbclid || utm.gclid;
    if (hasTracking) {
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        // First-touch wins: don't overwrite existing attribution
        if (!existing) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
        }
      } catch (e) {
        console.warn('[ai-tracking] localStorage unavailable', e);
      }
    }

    return getStoredAttribution() || utm;
  }

  function getStoredAttribution() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  // ── Send touchpoint to backend ──
  function sendTouchpoint(touchpointType, extraData) {
    const attr = getStoredAttribution() || {};
    const payload = Object.assign(
      {
        clientId: config.clientId,
        touchpointType: touchpointType,
        utmSource: attr.utm_source,
        utmMedium: attr.utm_medium,
        utmCampaign: attr.utm_campaign,
        utmContent: attr.utm_content,
        utmTerm: attr.utm_term,
        landingPageUrl: window.location.href,
        referrerUrl: document.referrer || null,
        timestamp: new Date().toISOString(),
        metadata: {
          fbclid: attr.fbclid,
          gclid: attr.gclid,
          first_seen_at: attr.first_seen_at,
          user_agent: navigator.userAgent,
        },
      },
      extraData || {},
    );

    // Use sendBeacon if available (survives page navigation), otherwise fetch
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function (err) {
        console.warn('[ai-tracking] Failed to send touchpoint', err);
      });
    }
  }

  // ── Initialize: capture attribution + send page_view ──
  captureAttribution();
  sendTouchpoint('page_view');

  // ── Listen for form submissions ──
  document.addEventListener(
    'submit',
    function (e) {
      const form = e.target;
      if (!form || form.tagName !== 'FORM') return;

      // Try to extract email from form fields for lead matching
      const email = form.querySelector('[type="email"]')?.value;
      const phone = form.querySelector('[type="tel"]')?.value;

      sendTouchpoint('form_submit', {
        email: email || undefined,
        phone: phone || undefined,
        metadata: {
          form_id: form.id || null,
          form_action: form.action || null,
        },
      });
    },
    true,
  );

  // Expose API for manual tracking
  window.aiTracking = {
    track: sendTouchpoint,
    getAttribution: getStoredAttribution,
  };

  console.log('[ai-tracking] Initialized for client', config.clientId);
})();
