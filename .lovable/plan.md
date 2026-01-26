

# Comprehensive Funnel Metrics & GHL Integration Plan

## Executive Summary

This plan outlines a cohesive approach to create the most accurate and user-friendly capital raising performance dashboard. The system will track the complete advertising funnel from Ad Spend through Funded Investors, with detailed cost metrics at each stage and direct GHL record links.

---

## Current State Analysis

### What's Already Working
1. **Webhook ingestion** for all funnel stages (lead, booked, showed, reconnect, funded, ad-spend)
2. **GHL sync function** that can pull contacts in bulk
3. **KPI Grid** displaying cost metrics (CPL, Cost/Call, Cost/Show, Cost/Investor, CoC%)
4. **Detailed Records tabs** with 8 funnel stages (just reorganized)
5. **Attribution dashboard** for campaign-level analysis

### Current Gaps
1. **Missing KPIs**: Cost per Reconnect Call, Cost per Reconnect Showed
2. **No GHL links**: Can't click directly to view contact in GHL
3. **API vs Webhook clarity**: No guidance on best approach per use case
4. **Incomplete cost breakdown**: Some stages don't have cost metrics visible

---

## Data Ingestion Strategy: API vs Webhooks

### Recommendation: Hybrid Approach

| Data Type | Best Method | Rationale |
|-----------|-------------|-----------|
| **Ad Spend** | Webhook (Make.com) | Meta API requires complex OAuth; webhooks from Make/Zapier are simpler |
| **New Leads** | Webhook | Real-time, GHL workflow-triggered, immediate capture |
| **Call Booked** | Webhook | Triggered by GHL calendar events |
| **Call Showed** | Webhook | Triggered by GHL appointment status change |
| **Reconnect Calls** | Webhook | Workflow-triggered when tagged as reconnect |
| **Commitments/Funded** | Webhook | Pipeline stage triggers in GHL |
| **Historical Backfill** | GHL API Sync | One-time or periodic pull of all contacts |
| **Contact Attribution** | GHL API Sync | Better extraction of UTM/campaign data from GHL |

### Why Webhooks Are Primary
- **Real-time**: Data appears instantly
- **Simple setup**: No OAuth, no API key management per platform
- **Reliable**: GHL workflows are battle-tested
- **Client-friendly**: They can set up workflows themselves

### When to Use GHL API Sync
- **Initial onboarding**: Backfill all historical contacts
- **Data enrichment**: Pull missing attribution data
- **Periodic validation**: Ensure webhook data matches GHL

---

## Implementation Plan

### Phase 1: Add Missing Cost Metrics

**File: `src/hooks/useMetrics.ts`**

Add new calculated metrics to `AggregatedMetrics` interface:

```typescript
// Add to AggregatedMetrics interface
costPerReconnectCall: number;
costPerReconnectShowed: number;
costPerBooked: number;  // Alias for costPerCall for clarity
costPerShowed: number;  // Alias for costPerShow for clarity

// In aggregateMetrics function, add calculations:
costPerReconnectCall: totals.reconnectCalls > 0 
  ? totals.totalAdSpend / totals.reconnectCalls 
  : 0,
costPerReconnectShowed: totals.reconnectShowed > 0 
  ? totals.totalAdSpend / totals.reconnectShowed 
  : 0,
```

**File: `src/components/dashboard/KPIGrid.tsx`**

Add new KPI cards for reconnect cost metrics in the KPIs array.

---

### Phase 2: Add GHL Quick Links

**File: `src/hooks/useClients.ts`**

The `ghl_location_id` field is already available - this enables constructing GHL contact URLs.

**File: `src/components/dashboard/InlineRecordsView.tsx`**

Add a clickable GHL link column to Leads, Calls, and Funded tables:

```typescript
// GHL contact link format:
const getGHLContactUrl = (locationId: string, contactId: string) => {
  return `https://app.gohighlevel.com/location/${locationId}/contacts/detail/${contactId}`;
};

// In table rows, add action column:
<TableCell>
  {record.external_id && !record.external_id.startsWith('wh_') && locationId && (
    <a 
      href={getGHLContactUrl(locationId, record.external_id)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline flex items-center gap-1"
    >
      <ExternalLink className="h-3 w-3" />
      View in GHL
    </a>
  )}
</TableCell>
```

**Props Update**: Pass `ghlLocationId` to `InlineRecordsView` from `ClientDetail.tsx`.

---

### Phase 3: Complete Funnel Metrics Display

**File: `src/components/dashboard/PeriodicStatsTable.tsx`**

Add columns for the complete funnel with cost metrics:

```text
Current columns: Ad Spend | Leads | CPL | Calls | $/Call | Showed | Show% | Recon | Recon Showed | Commits | Commit$ | Funded# | Funded$ | CPA | CoC%

Add: $/Showed | $/Recon | $/Recon Showed
```

Update the table to include:
- Cost per Showed = Ad Spend / Showed Calls
- Cost per Reconnect = Ad Spend / Reconnect Calls  
- Cost per Reconnect Showed = Ad Spend / Reconnect Showed

---

### Phase 4: Enhanced Record Details Panel

**File: `src/components/dashboard/InlineRecordsView.tsx`**

When a record is selected, display a comprehensive side panel with:

1. **Contact Info**: Name, Email, Phone (clickable)
2. **Timeline**: Lead created → Booked → Showed → Reconnects → Commitment → Funded
3. **Attribution**: Campaign, Ad Set, Ad ID
4. **Questions/Survey**: All captured form responses
5. **Quick Actions**:
   - View in GHL (external link)
   - View recordings (if call has recording_url)
   - Mark as spam

---

### Phase 5: Improve Data Accuracy

**File: `supabase/functions/webhook-ingest/index.ts`**

Ensure `updateDailyMetrics` function accurately counts all stages:

```typescript
async function updateDailyMetrics(supabase: any, clientId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Count leads created today
  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59.999');

  // Count spam leads
  const { count: spamCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_spam', true)
    .gte('created_at', today + 'T00:00:00');

  // Count booked calls (non-reconnect)
  const { count: bookedCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_reconnect', false)
    .gte('created_at', today + 'T00:00:00');

  // Count showed calls (non-reconnect, showed=true)
  const { count: showedCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_reconnect', false)
    .eq('showed', true)
    .gte('created_at', today + 'T00:00:00');

  // Count reconnect calls
  const { count: reconnectCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_reconnect', true)
    .gte('created_at', today + 'T00:00:00');

  // Count reconnect showed
  const { count: reconnectShowedCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_reconnect', true)
    .eq('showed', true)
    .gte('created_at', today + 'T00:00:00');

  // Upsert daily metrics
  await supabase.from('daily_metrics').upsert({
    client_id: clientId,
    date: today,
    leads: leadsCount || 0,
    spam_leads: spamCount || 0,
    calls: bookedCount || 0,
    showed_calls: showedCount || 0,
    reconnect_calls: reconnectCount || 0,
    reconnect_showed: reconnectShowedCount || 0,
  }, { onConflict: 'client_id,date', ignoreDuplicates: false });
}
```

---

## Client Setup Guide

### For Each New Client

1. **In Dashboard**: Add client with name

2. **Configure GHL Integration**:
   - Go to Client Settings → Integrations
   - Enter GHL Location ID
   - Create Private Integration in GHL with scopes: Contacts, Calendars, Opportunities
   - Enter Private Integration Key
   - Click "Test Connection"
   - Click "Sync Contacts Now" for initial backfill

3. **Set Up GHL Webhooks** (in GoHighLevel):
   
   | Webhook Type | GHL Trigger | Dashboard URL |
   |--------------|-------------|---------------|
   | Lead | New Contact Created | `/webhook-ingest/{clientId}/lead` |
   | Booked Call | Calendar Event Created | `/webhook-ingest/{clientId}/booked` |
   | Showed Call | Appointment Status = Showed | `/webhook-ingest/{clientId}/showed` |
   | Reconnect | Tag Added: "reconnect" | `/webhook-ingest/{clientId}/reconnect` |
   | Reconnect Showed | Appointment Showed + Tag "reconnect" | `/webhook-ingest/{clientId}/reconnect-showed` |
   | Commitment | Pipeline Stage = "Committed" | `/webhook-ingest/{clientId}/committed` |
   | Funded | Pipeline Stage = "Funded" | `/webhook-ingest/{clientId}/funded` |

4. **Ad Spend** (via Make.com or manual):
   - Set up Make.com scenario to pull Meta Ads data daily
   - Send to `/webhook-ingest/{clientId}/ad-spend`
   - Fields: `date`, `spend`, `impressions`, `clicks`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useMetrics.ts` | Add costPerReconnectCall, costPerReconnectShowed metrics |
| `src/components/dashboard/KPIGrid.tsx` | Add new KPI cards for reconnect costs |
| `src/components/dashboard/PeriodicStatsTable.tsx` | Add cost per showed, reconnect columns |
| `src/components/dashboard/InlineRecordsView.tsx` | Add GHL quick link column, pass locationId |
| `src/pages/ClientDetail.tsx` | Pass ghlLocationId to InlineRecordsView |
| `supabase/functions/webhook-ingest/index.ts` | Improve updateDailyMetrics accuracy |

---

## Cost Metrics Summary

After implementation, the dashboard will display these cost metrics across the funnel:

| Stage | Metric | Calculation |
|-------|--------|-------------|
| Leads | Cost Per Lead (CPL) | Ad Spend / Leads |
| Booked Calls | Cost Per Booked | Ad Spend / Booked Calls |
| Showed Calls | Cost Per Showed | Ad Spend / Showed Calls |
| Reconnect Calls | Cost Per Reconnect | Ad Spend / Reconnect Calls |
| Reconnect Showed | Cost Per Recon Showed | Ad Spend / Reconnect Showed |
| Funded Investors | Cost Per Investor (CPA) | Ad Spend / Funded Investors |
| Funded Dollars | Cost of Capital (CoC%) | (Ad Spend / Funded $) * 100 |

---

## Expected Outcome

After implementation:

1. **Agency View**: See aggregated funnel metrics across all clients with cost breakdowns
2. **Client View**: Detailed records with GHL quick links, complete cost metrics
3. **Public Report**: Client-facing dashboard with all the same data
4. **Simple Setup**: Webhook-based ingestion with optional API backfill
5. **One-Click GHL Access**: Every record links directly to GHL contact

