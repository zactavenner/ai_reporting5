
# Plan: Fix Public Links & Enhance Facebook Ads Library Integration

## Problem Summary
1. **Public report pages are blank** for `/public/legacy-capital` and potentially other clients
2. **Facebook Ads Library integration** needs evaluation - currently implemented via Firecrawl scraping, user wants to either embed or redirect to the Ads Library

---

## Part 1: Fix Public Links

### Root Cause Analysis
After thorough investigation, I identified several potential issues:

1. **Inconsistent RLS Policy**: The `client_settings` table uses `roles:{anon,authenticated}` while all other tables use `roles:{public}`. This inconsistency could cause silent query failures for anonymous users.

2. **Silent Hook Errors**: If any data-fetching hook throws an error, React doesn't show it properly, resulting in a blank page.

3. **Debug Logging Exists**: Recent logging was added but may not be reaching the browser - indicating the issue happens before render.

### Fix Implementation

**Step 1: Fix RLS Policy Consistency**
Update the `client_settings` table RLS policy to use `TO public` instead of `TO anon, authenticated`:

```sql
DROP POLICY IF EXISTS "Public can view client_settings" ON client_settings;
CREATE POLICY "Public can view client_settings"
ON client_settings FOR SELECT
TO public
USING (true);
```

**Step 2: Add Error Boundary to PublicReport**
Wrap the entire page in an error boundary to catch and display any runtime errors:

```text
+------------------------------------------+
| Error Boundary Wrapper                   |
|  +--------------------------------------+|
|  | PublicReport Content                 ||
|  | (catches all errors and shows UI)   ||
|  +--------------------------------------+|
+------------------------------------------+
```

**Step 3: Add Try-Catch Around Hook Errors**
Ensure silent query errors don't cause blank screens by showing error states per section.

---

## Part 2: Facebook Ads Library Integration

### Current Implementation
The system already has a working Facebook Ads Library integration:
- `LiveAdsSection` component renders scraped ads
- `scrape-fb-ads` edge function uses Firecrawl to scrape the Ads Library page
- `LiveAdCard` displays ads in a Facebook-style preview format
- Stored in `client_live_ads` table

### Enhancement Options

**Option A: Embed Facebook Ads Library (NOT RECOMMENDED)**
Facebook does not allow embedding via iframe - their security headers block this approach.

**Option B: Redirect to Facebook Ads Library (Simple)**
Add a "View All in Ads Library" button that opens the full library in a new tab.

**Option C: Enhanced Scraping with High-Fidelity Preview (RECOMMENDED)**
Keep the current scraping approach but enhance the display to match the MagicBrief aesthetic shown in the screenshots.

### Recommended Implementation

**Enhance LiveAdCard Component:**
- Larger creative images with better quality
- Show full ad copy with emoji support
- Display "Started running on" dates prominently
- Add platform badges (Facebook, Instagram, Messenger)
- Include AI analysis button for each ad

**Add Bulk Actions:**
- "Open All in Ads Library" - opens all ads in separate tabs
- "Refresh All Ads" - re-scrapes the latest ads
- "AI Analyze All" - runs AI analysis on all creatives

**Data Flow:**
```text
User clicks "Sync from Ads Library"
        │
        ▼
┌─────────────────────────────┐
│ ScrapeAdsModal opens        │
│ - Enter Page ID or URL      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Edge Function: scrape-fb-ads│
│ - Uses Firecrawl API        │
│ - Parses markdown content   │
│ - Extracts ad copy, images  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ client_live_ads table       │
│ - Stores scraped ads        │
│ - Primary text, images, CTA │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ LiveAdsSection displays     │
│ - High-fidelity ad cards    │
│ - AI analysis available     │
│ - Click to view in library  │
└─────────────────────────────┘
```

---

## Files to Modify

### RLS Fix (Database Migration)
- Fix `client_settings` policy to use `TO public`

### PublicReport.tsx
- Add error boundary component wrapper
- Improve error display for individual sections
- Add graceful degradation when sections fail

### LiveAdCard.tsx
- Enhance image display quality
- Improve ad copy formatting
- Add prominent "View in Library" button

### LiveAdsSection.tsx
- Add "Open All in Library" button
- Improve empty state messaging
- Add last synced timestamp display (already exists)

---

## Expected Results

After implementation:
1. Public links like `/public/legacy-capital` will load correctly
2. Console logging will help debug any future issues
3. Facebook ads will display with high-fidelity previews
4. Users can click any ad to view it directly in Facebook Ads Library
5. AI analysis remains available for each scraped ad

---

## Technical Notes

- Facebook Ads Library URLs follow the pattern: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id={PAGE_ID}`
- The Firecrawl connector is already configured with `FIRECRAWL_API_KEY`
- Embedding Facebook content is not possible due to X-Frame-Options headers
- The scraping approach extracts markdown, images, and metadata from the Ads Library page
