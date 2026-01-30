
# Plan: Improved Live Ad Preview System

## Current Issues

Based on analysis of the scraped data and the reference image you provided:

1. **Scraping limitations**: The Firecrawl scrape captures a page screenshot rather than individual ad creative images
2. **Data quality**: Page names show as "Ad Library" instead of actual advertiser names like "Lansing Capital Group"
3. **Media extraction**: The scraped media URLs are small thumbnails (60x60), not the full-resolution ad creatives
4. **Missing details**: Start dates, platforms, and full ad copy aren't being parsed correctly

## Proposed Solution

Since Facebook Ads Library has complex dynamic content that's difficult to scrape reliably, we'll implement a **hybrid approach**:

### Option A: Link-Only Mode (Quick Win)
For each ad, display a clean preview card that links directly to the Facebook Ads Library view. This ensures users always see the actual ad as Facebook renders it.

**Components:**
- Show page name, basic info from scrape
- Display the Firecrawl page screenshot as a thumbnail
- "View in Ads Library" as the primary action opens the exact ad

### Option B: Enhanced Scraping (Recommended)
Improve the Edge Function to:
1. Request Firecrawl to capture specific elements
2. Parse the structured markdown more intelligently
3. Extract the 600x600 images (which ARE being captured) as primary media
4. Better parse page names from the page title/meta

**Plus** redesign the card to match your reference exactly:

```text
┌─────────────────────────────────────────────────────────┐
│  [Avatar] Page Name                              [···]  │
│           Sponsored                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Full ad copy text here with emoji support like ✅      │
│  Multiple paragraphs of the primary text...             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              ┌─────────────────────┐                    │
│              │                     │                    │
│              │    AD CREATIVE      │                    │
│              │      IMAGE          │                    │
│              │                     │                    │
│              └─────────────────────┘                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Started running on Jun 10, 2025                        │
│  [Facebook] [Instagram]                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. Update Edge Function: Better Parsing

**File: `supabase/functions/scrape-fb-ads/index.ts`**

Changes:
- Extract page name from markdown header or title tag (look for patterns like `# Page Name` or title containing the advertiser)
- Parse "Started running on [DATE]" patterns to get actual start dates
- Use the 600x600 image URLs (already being captured) as the primary display image
- Extract full primary text blocks more accurately
- Detect platforms from badge text (Facebook, Instagram, Messenger)

### 2. Redesign LiveAdCard Component

**File: `src/components/funnel/LiveAdCard.tsx`**

Updates to match your reference:
- Larger card width (max-w-md instead of max-w-sm)
- Page avatar with proper initials from actual page name
- "Sponsored" label styled like Facebook
- Full primary text with emoji support and proper line breaks
- Large creative image display (use 600x600 URL)
- Metadata footer with formatted date and platform badges
- Dropdown menu for actions (View in Library, Analyze, Remove)

### 3. Add "View in Ads Library" Fallback

For any ad where we don't have complete data, provide a prominent button to open the original Facebook Ads Library page where the user can see the ad rendered perfectly.

### 4. Improve Grid Layout

**File: `src/components/funnel/LiveAdsSection.tsx`**

- Reduce columns to fit larger cards (3-4 per row instead of 5)
- Add proper spacing
- Consider horizontal scroll option for many ads

---

## Technical Details

### Improved Markdown Parsing

The scraped markdown contains patterns like:
```
Started running on Jun 10, 2025
California Accredited Investors: Our fund identifies...
Learn More
```

We'll parse these more intelligently to extract:
- **Start date**: Regex for "Started running on [DATE]"
- **Primary text**: Longest paragraph blocks
- **CTA**: Match known CTA button text
- **Page name**: From page title or first header

### Image URL Selection

Currently we have:
- `thumbnail_url`: Firecrawl's page screenshot (full page)
- `media_urls[0]`: Small 60x60 thumbnail
- `media_urls[1]`: Larger 600x600 image (this is what we want)

We'll update the display logic to prefer the larger image when available.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/scrape-fb-ads/index.ts` | Modify | Improved parsing logic for page names, dates, full text, image selection |
| `src/components/funnel/LiveAdCard.tsx` | Modify | Redesign to match reference - larger card, proper layout, platform badges |
| `src/components/funnel/LiveAdsSection.tsx` | Modify | Adjust grid layout for larger cards |
| `src/hooks/useLiveAds.ts` | Minor | Add helper for best image URL selection |

---

## Expected Result

After implementation, live ad cards will display:
- **Page name**: "Lansing Capital Group" (parsed from scrape)
- **Full ad copy**: Complete primary text with emojis preserved
- **Clear creative**: 600x600 resolution ad image
- **Metadata**: "Started running on Jun 10, 2025" + platform badges
- **Fallback**: "View in Ads Library" button opens original page

This matches your MagicBrief reference while working within the constraints of what Firecrawl can extract from Facebook Ads Library.
