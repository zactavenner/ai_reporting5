
# Plan: Formalize Hybrid Data Ingestion Architecture

## Status: ✅ IMPLEMENTED

## Summary

Lock in the clean separation of concerns for the data ingestion system with three distinct layers: **Webhooks** for real-time funnel events, **GHL API** for reconciliation/enrichment, and **Make.com** for client-level ad spend. This plan also adds data confidence flags and a sync status UI.

### Implementation Completed:
- ✅ Database migration: Added `call_connected`, `call_duration_seconds`, `ghl_synced_at` to calls table
- ✅ Database migration: Added `ghl_sync_*_enabled` and `ghl_last_*_sync` columns to client_settings
- ✅ Edge function: Extended `sync-ghl-contacts` with `syncClientCallLogs()` for call validation
- ✅ Types: Created `src/lib/metricConfidence.ts` with confidence level definitions
- ✅ UI: Updated `KPICard.tsx` with confidence indicator tooltip
- ✅ UI: Updated `ClientSettingsModal.tsx` with sync status display

---

## Current State Analysis

Your architecture is already 90% correct. Here's what exists:

| Layer | Status | Purpose |
|-------|--------|---------|
| `webhook-ingest` | Complete | Real-time funnel events (lead, booked, showed, reconnect, funded, etc.) |
| `sync-ghl-contacts` | Partial | Contact sync - needs call logs and conversation reconciliation |
| Make.com ad spend | Complete | Client-level spend via `ad-spend` webhook type |

**Gap identified**: API sync layer is missing call logs and conversation enrichment for validation.

---

## Architecture to Lock In

```text
WEBHOOKS (REAL-TIME EVENTS)
- lead → creates/updates leads table
- booked → creates calls table entry (showed=false)
- showed → updates calls table (showed=true)
- reconnect / reconnect-showed → creates calls with is_reconnect=true
- committed → updates daily_metrics
- funded → creates funded_investors entry
- bad-lead → marks lead as spam
- call → logs inbound/outbound call events
- ad-spend → updates daily_metrics (client-level only)

              ↓

SUPABASE TABLES
- leads (with deduplication by external_id)
- calls (with deduplication by external_id)
- daily_metrics (aggregated counts)
- funded_investors

              ↓

GHL API SYNC (RECONCILIATION)
- Contacts: Hourly/nightly - sync name, phone, email, tags, UTMs, custom fields
- Calls: Hourly/nightly - validate call happened, capture duration, recording URL
- Conversations: Daily (optional) - context for QA, not counting

              ↓

REPORTING
- Metrics computed at CLIENT level
- Campaign-level CPL is NOT computed (intentional)
- UTMs used for directional attribution only
```

---

## Implementation Details

### 1. Extend `sync-ghl-contacts` to Include Call Logs

Add call sync functionality to the existing edge function:

```typescript
// New function to sync call logs from GHL
async function syncClientCallLogs(
  supabase: any,
  client: { id: string; name: string; ghl_api_key: string; ghl_location_id: string },
  sinceDate: Date
): Promise<{ synced: number; updated: number; errors: string[] }> {
  // Fetch conversations with call messages from GHL
  // Update calls table with:
  // - call_connected (boolean validation flag)
  // - call_duration_seconds (from recording metadata)
  // - recording_url (if available)
  // Do NOT override 'showed' - just add validation flags
}
```

**Fields to add to calls table:**
- `call_connected` (boolean) - API-verified that call actually occurred
- `call_duration_seconds` (integer) - Duration from recording metadata
- `ghl_synced_at` (timestamp) - Last sync from API

### 2. Add Data Confidence Flags

Add a `data_confidence` column or computed property for each metric:

| Metric | Confidence | Reason |
|--------|------------|--------|
| Leads | High | Webhook-driven, deduplicated |
| Booked | High | Webhook-driven, appointment ID |
| Showed | Medium | Auto-mark + manual override |
| Connected Show | High | API-validated (call_connected=true) |
| Commit | High | Webhook-driven |
| Funded | Very High | Multiple validation layers |
| Campaign CPL | Not Reported | Intentionally excluded |
| Client CPL | High | Total spend / Total leads |

### 3. Add Sync Status UI in Client Settings

Enhance the Integrations tab:

```text
+----------------------------------------------------------+
| GHL Integration                                          |
+----------------------------------------------------------+
| Location ID: [__________________]                         |
| API Key: [__________________]                             |
|                                                           |
| [Test Connection] [Sync Now ↻]                           |
|                                                           |
| Last Sync: Jan 27, 2026 2:00 AM                          |
| Status: ✓ Success (Created: 12, Updated: 45)             |
|                                                           |
| Sync Schedule:                                            |
| [✓] Contacts - Hourly                                    |
| [✓] Calls - Hourly                                       |
| [ ] Conversations - Daily (optional)                     |
+----------------------------------------------------------+
```

### 4. Add Manual "Sync Calls" Button

Allow agency to trigger call reconciliation on demand, separate from contact sync.

### 5. Display Confidence Indicators on KPIs

Add subtle indicators next to metrics:

```text
CPL: $45.23 [High ●]
Cost/Show: $124.50 [Medium ◐]
```

---

## Database Changes

### Migration: Add call validation fields

```sql
-- Add API validation fields to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS call_connected BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add sync schedule settings to client_settings
ALTER TABLE public.client_settings
ADD COLUMN IF NOT EXISTS ghl_sync_contacts_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ghl_sync_calls_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ghl_sync_conversations_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ghl_last_contacts_sync TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_last_calls_sync TIMESTAMP WITH TIME ZONE DEFAULT NULL;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-ghl-contacts/index.ts` | Add `syncClientCallLogs()` function, update main handler to sync calls |
| `src/components/settings/ClientSettingsModal.tsx` | Add sync status display, sync schedule toggles |
| `src/hooks/useMetrics.ts` | Add confidence level computation to `AggregatedMetrics` |
| `src/components/dashboard/KPICard.tsx` | Display confidence indicator |
| New migration | Add call validation columns |

---

## Edge Function: Call Log Sync Logic

```typescript
// Within sync-ghl-contacts/index.ts

interface GHLCall {
  id: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration?: number;
  recordingUrl?: string;
  dateAdded: string;
}

async function fetchGHLCalls(
  apiKey: string,
  locationId: string,
  sinceDate: Date
): Promise<GHLCall[]> {
  // GET /conversations/messages filtered by TYPE_CALL
  // Return parsed call records
}

async function syncCallToDatabase(
  supabase: any,
  clientId: string,
  ghlCall: GHLCall
): Promise<{ action: 'enriched' | 'skipped' }> {
  // Find matching call by external_id or contact_id
  // Update with:
  // - call_connected = true (if call status indicates connection)
  // - call_duration_seconds = ghlCall.duration
  // - recording_url = ghlCall.recordingUrl (if missing)
  // - ghl_synced_at = now()
  // DO NOT change 'showed' field - this is webhook-driven
}
```

---

## Confidence Level Display

Add to `AggregatedMetrics` interface:

```typescript
export interface MetricConfidence {
  metric: string;
  level: 'very_high' | 'high' | 'medium' | 'low' | 'not_reported';
  description: string;
}

export const METRIC_CONFIDENCE: MetricConfidence[] = [
  { metric: 'leads', level: 'high', description: 'Webhook-driven, deduplicated' },
  { metric: 'booked', level: 'high', description: 'Appointment webhook' },
  { metric: 'showed', level: 'medium', description: 'Auto-mark + manual override' },
  { metric: 'connected_show', level: 'high', description: 'API-validated' },
  { metric: 'committed', level: 'high', description: 'Webhook-driven' },
  { metric: 'funded', level: 'very_high', description: 'Multiple validation' },
  { metric: 'campaign_cpl', level: 'not_reported', description: 'Not computed' },
];
```

---

## UI for Confidence Indicator

Small badge next to KPI values:

```tsx
function ConfidenceBadge({ level }: { level: string }) {
  const config = {
    very_high: { icon: '●', color: 'text-chart-4', label: 'Very High' },
    high: { icon: '●', color: 'text-chart-2', label: 'High' },
    medium: { icon: '◐', color: 'text-chart-3', label: 'Medium' },
    low: { icon: '○', color: 'text-muted-foreground', label: 'Low' },
  };
  
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={cn('text-xs ml-1', config[level].color)}>
          {config[level].icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{config[level].label} Confidence</TooltipContent>
    </Tooltip>
  );
}
```

---

## Cron Schedule (Optional Enhancement)

Set up daily/hourly sync via `pg_cron`:

```sql
-- Daily contacts sync at 2 AM UTC
SELECT cron.schedule(
  'ghl-contacts-sync',
  '0 2 * * *',
  $$SELECT net.http_post(
    url:='https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/sync-ghl-contacts',
    headers:='{"Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{"syncType": "contacts"}'::jsonb
  )$$
);

-- Hourly calls sync
SELECT cron.schedule(
  'ghl-calls-sync',
  '0 * * * *',
  $$SELECT net.http_post(
    url:='https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/sync-ghl-contacts',
    headers:='{"Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{"syncType": "calls"}'::jsonb
  )$$
);
```

---

## Expected Outcome

1. **Clean architecture** - Each system does one job only
2. **Call validation layer** - API confirms call actually happened without overriding webhook data
3. **Sync status visibility** - Agency can see last sync time and results
4. **Confidence indicators** - Dashboard shows data reliability per metric
5. **Campaign CPL intentionally excluded** - Spend reported at client level only
6. **Defensible reporting** - Capital raises are multi-touch; per-campaign attribution is misleading

---

## Why This Design is Defensible

| Question | Answer |
|----------|--------|
| "Why isn't spend broken down by campaign?" | Capital raises are multi-touch. Campaign-level spend attribution is misleading. We report cost of capital, not vanity metrics. |
| "How accurate are the showed numbers?" | Medium confidence (auto-mark). High confidence available when API-validated (call_connected=true). |
| "What if a webhook is missed?" | Daily API reconciliation catches missed events and enriches records. |
