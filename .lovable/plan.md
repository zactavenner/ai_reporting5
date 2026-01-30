
# Plan: Fix Public Report Blank Screen & Enhance Facebook Ads Display

## Problem Summary

The public report at `/public/legacy-capital` shows "Loading report..." then goes blank. After thorough investigation:

1. **TeamMemberProvider is already added** (confirmed in the current codebase at lines 4, 376-383)
2. **RLS policies are correctly set** for all relevant tables with `roles:{public}`
3. **Client data exists in database** with correct slug `legacy-capital`

The issue appears to be a **silent runtime error during render** that occurs after the client data loads but before the full UI renders.

---

## Root Cause Analysis

After investigating the code and database, the most likely cause is:

### Issue 1: Error in data hooks without proper error boundaries per section
When one of the many data hooks fails (metrics, tasks, pipelines, etc.), the entire page crashes despite the ErrorBoundary. The error might be happening in a way that bypasses React's error boundary (e.g., async errors in useEffect).

### Issue 2: Missing null-safety in component rendering
Some child components may be accessing properties of undefined values after the client loads.

---

## Implementation Plan

### Step 1: Add Defensive Rendering in PublicReportContent

Wrap each section in individual try-catch patterns and add null checks:

```typescript
// In PublicReportContent - add early return if critical context is missing
if (!startDate || !endDate) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <CashBagLoader message="Initializing..." />
    </div>
  );
}
```

### Step 2: Add Section-Level Error Boundaries

Instead of one giant ErrorBoundary, wrap each major section in its own error boundary to prevent one failing section from blanking the entire page:

```text
Page Structure:
+------------------------------------------+
| TeamMemberProvider                       |
|  +--------------------------------------+|
|  | ErrorBoundary (Page Level)          ||
|  |  +----------------------------------+||
|  |  | Header (safe)                   |||
|  |  +----------------------------------+||
|  |  | Main Content                    |||
|  |  |  +------------------------------+|||
|  |  |  | ErrorBoundary: KPIGrid      ||||
|  |  |  +------------------------------+|||
|  |  |  | ErrorBoundary: Charts       ||||
|  |  |  +------------------------------+|||
|  |  |  | ErrorBoundary: Creatives    ||||
|  |  |  +------------------------------+|||
|  |  +----------------------------------+||
|  +--------------------------------------+|
+------------------------------------------+
```

### Step 3: Add Console Logging to Track Render Lifecycle

Add strategic logging to identify exactly where the render fails:

```typescript
// At start of component
console.log('[PublicReport] Starting render', { token, isLoading, hasClient: !!client });

// Before each major section
console.log('[PublicReport] Rendering section:', activeSection);
```

### Step 4: Handle Hook Errors Gracefully

Ensure all hooks return proper error states and the component handles them:

```typescript
// Show warning banner if any data hooks have errors
{dataErrors.length > 0 && (
  <Alert variant="warning">
    <AlertDescription>
      Some data could not be loaded. The report may be incomplete.
    </AlertDescription>
  </Alert>
)}
```

---

## Part 2: Facebook Ads Library Enhancement

### Current State
- Existing `LiveAdsSection` component in funnel tab
- `scrape-fb-ads` edge function using Firecrawl API
- `LiveAdCard` component for individual ad display
- Data stored in `client_live_ads` table

### Enhancements

#### Update LiveAdCard Component
- Display larger, higher-quality creative images
- Show full ad copy with proper text truncation and "Show More" expansion
- Add platform badges (Facebook, Instagram, Messenger, Audience Network)
- Include "View in Ads Library" direct link button
- Show "Started running on" date prominently
- Add video play overlay indicator for video ads

#### Update LiveAdsSection Component  
- Add "Open All in Ads Library" button to open all ads in new tabs
- Show sync status and last synced timestamp
- Add bulk "Analyze All" option for AI analysis
- Improve empty state messaging

#### UI Layout (matching MagicBrief style)
```text
+--------------------------------------------+
| [Ad Image/Video]                           |
| 16:9 or native aspect ratio                |
| Video play overlay if video                |
+--------------------------------------------+
| [Page Name] · Sponsored                    |
| Ad copy text with emoji support...         |
| [Show More] for truncated text             |
+--------------------------------------------+
| Platform: Facebook, Instagram              |
| Started: Jan 15, 2026                      |
+--------------------------------------------+
| [View in Library] [AI Analyze]             |
+--------------------------------------------+
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PublicReport.tsx` | Add section-level error handling, defensive rendering, enhanced logging |
| `src/components/funnel/LiveAdCard.tsx` | Enhance UI for high-fidelity ad previews, add View in Library button |
| `src/components/funnel/LiveAdsSection.tsx` | Add bulk actions (Open All, Analyze All), improve sync status display |

---

## Expected Results

After implementation:
1. Public report at `/public/legacy-capital` loads correctly
2. If individual sections fail, they show error states instead of blanking the page
3. Console logs help identify any remaining issues
4. Facebook ads display with high-fidelity previews matching MagicBrief aesthetic
5. Direct links to Facebook Ads Library for each ad
6. AI analysis available for scraped ads

---

## Technical Notes

- Facebook Ads Library URL pattern: `https://www.facebook.com/ads/library/?id={AD_ID}`
- Direct embedding is blocked by Facebook's X-Frame-Options headers
- The Firecrawl scraping approach is the only viable way to display ad content inline
- All RLS policies are correctly configured for anonymous access
