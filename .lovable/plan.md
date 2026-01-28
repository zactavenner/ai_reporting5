
# Enhanced GHL Sync, Ad Spend Timing, and Funded Investor Tag Detection

This plan adds three key improvements to the data ingestion system: historical GHL sync options, ad spend time tracking, and expanded funded investor detection via contact tags.

---

## Feature 1: GHL Historical Data Sync with Date References

### Current Behavior
- Contacts sync fetches up to 1000 contacts without date filtering
- Calls sync uses a hardcoded 7-day lookback
- No UI option to specify historical date ranges

### Proposed Changes

**1.1 Update `sync-ghl-contacts` Edge Function**
- Add optional `sinceDateDays` parameter (default: 7, max: 365) to control how far back to fetch calls
- Use GHL contact's `dateAdded` field for lead creation date reference
- Track call `dateAdded` for scheduling reference in calls table

**1.2 Update `sync-client-data` Edge Function**
- Add date range parameters for historical backfill
- Preserve original `created_at` from GHL when creating new leads

**1.3 Add UI Controls in Client Settings**
- Add "Historical Sync" section in Integrations tab
- Dropdown to select sync range (7 days, 30 days, 90 days, All Time)
- "Sync Historical Data" button that triggers deep sync

---

## Feature 2: Ad Spend Time Tracking

### Current Behavior
- `daily_metrics.date` is a DATE type (no time component)
- Ad spend imports/webhooks aggregate by date only
- CSV import has no time field support

### Proposed Changes

**2.1 Database Schema Update**
Add a new `ad_spend_reports` table for granular time tracking:

```sql
CREATE TABLE public.ad_spend_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL,
  platform TEXT DEFAULT 'meta',
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  campaign_name TEXT,
  ad_set_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_ad_spend_reports_client_date ON public.ad_spend_reports(client_id, reported_at);

-- RLS policies
ALTER TABLE public.ad_spend_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view ad_spend_reports" ON public.ad_spend_reports FOR SELECT USING (true);
CREATE POLICY "Public can insert ad_spend_reports" ON public.ad_spend_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete ad_spend_reports" ON public.ad_spend_reports FOR DELETE USING (true);
```

**2.2 Update Webhook Ingestion**
- Modify `processAdSpend` to accept `time` or `reported_at` parameter
- Store granular records in `ad_spend_reports` table
- Continue aggregating to `daily_metrics` for dashboard compatibility

**2.3 Update CSV Import**
- Add `time` or `reported_at` optional column for ad spend imports
- Parse datetime when provided, default to noon of the date if not

**2.4 Optional: Display Intraday Spend**
- Add expandable section in client detail to view ad spend by hour/time

---

## Feature 3: Enhanced Funded Investor Tag Detection

### Current Behavior
- Only checks opportunity `status === 'won'` OR `pipelineStageId` containing "funded"/"closed"
- Does not check contact tags
- Uses `opp.dateAdded` as funded date (not stage move date)

### Proposed Changes

**3.1 Add Tag-Based Detection Function**
Create helper function to identify funded contacts by tags:

```typescript
function hasFundedInvestorTag(contact: GHLContact): boolean {
  if (!contact.tags || !Array.isArray(contact.tags)) return false;
  
  const fundedPatterns = [
    'funded', 
    'funded investor', 
    'fundedinvestor',
    'funded_investor',
    'active investor',
    'activeinvestor',
    'active_investor'
  ];
  
  return contact.tags.some(tag => 
    fundedPatterns.some(pattern => 
      tag.toLowerCase().trim() === pattern ||
      tag.toLowerCase().includes(pattern)
    )
  );
}
```

**3.2 Update `sync-client-data` Opportunity Filtering**
Expand the funded detection logic:

```typescript
// Current logic (too restrictive)
const fundedOpps = opportunities.filter(opp => 
  opp.status === 'won' || 
  opp.pipelineStageId?.toLowerCase().includes('funded') ||
  opp.pipelineStageId?.toLowerCase().includes('closed')
);

// Updated logic - also check stage NAME not just ID
const fundedOpps = opportunities.filter(opp => {
  const stageName = (opp.stageName || opp.pipelineStageName || '').toLowerCase();
  const stageId = (opp.pipelineStageId || '').toLowerCase();
  
  return opp.status === 'won' || 
    stageName.includes('funded') ||
    stageName.includes('active investor') ||
    stageId.includes('funded') ||
    stageId.includes('closed');
});
```

**3.3 Add Contact-Based Funded Detection**
For contacts without opportunities but with funded tags:

```typescript
// After processing opportunities, also check contacts with funded tags
for (const contact of contacts) {
  if (hasFundedInvestorTag(contact)) {
    // Check if already a funded investor
    const { data: existingFunded } = await supabase
      .from('funded_investors')
      .select('id')
      .eq('client_id', client.id)
      .eq('external_id', contact.id)
      .maybeSingle();
    
    if (!existingFunded) {
      // Extract pipeline value from custom fields or opportunities
      const pipelineValue = extractPipelineValue(contact);
      
      await supabase.from('funded_investors').insert({
        client_id: client.id,
        external_id: contact.id,
        name: contact.name,
        lead_id: leadId,
        funded_amount: pipelineValue,
        funded_at: contact.dateUpdated || contact.dateAdded,
        source: 'tag_sync'
      });
    }
  }
}
```

**3.4 Update `sync-ghl-contacts` for Tags**
Add funded investor creation during contact sync when funded tags detected:

- Check for funded investor tags during contact processing
- If found, look up or create corresponding funded_investor record
- Use opportunity `monetaryValue` as `funded_amount`
- Use the tag addition date or stage move date as `funded_at` (requires GHL activity log or approximate with `dateUpdated`)

**3.5 Opportunity Value Extraction**
Update to properly pull opportunity value:

```typescript
interface GHLOpportunity {
  id: string;
  contactId: string;
  status: string;
  monetaryValue?: number;
  monetary_value?: number; // alternate field name
  pipelineStageId?: string;
  pipelineStageName?: string;
  stageName?: string;
  dateAdded: string;
  lastStageChangeAt?: string; // Use this for accurate funded date if available
}

// Extract value with multiple field fallbacks
const fundedAmount = opp.monetaryValue ?? opp.monetary_value ?? 0;

// Use stage change date if available, otherwise dateAdded
const fundedAt = opp.lastStageChangeAt || opp.dateAdded;
```

---

## Technical Summary

| Component | Changes |
|-----------|---------|
| `supabase/migrations/` | Add `ad_spend_reports` table with timestamp tracking |
| `supabase/functions/sync-ghl-contacts/index.ts` | Add `hasFundedInvestorTag()`, historical date range param, funded investor creation from tags |
| `supabase/functions/sync-client-data/index.ts` | Expand funded detection (stage name, tags), use `lastStageChangeAt`, proper value extraction |
| `supabase/functions/webhook-ingest/index.ts` | Add time parameter to ad-spend webhook, store in `ad_spend_reports` |
| `src/components/import/CSVImportModal.tsx` | Add `time`/`reported_at` column support for ad spend imports |
| `src/components/settings/ClientSettingsModal.tsx` | Add historical sync date range selector and button |
| `src/hooks/useAdSpendReports.ts` | **NEW** - Hook to query granular ad spend data by time |

---

## Data Flow Changes

### Current Funded Investor Detection
```text
GHL Opportunity with status='won' OR stageId contains 'funded'/'closed'
    ↓
Extract monetaryValue → funded_amount
Extract dateAdded → funded_at
```

### Updated Funded Investor Detection
```text
Contact has tag: "Funded" / "funded investor" / "active investor"
    OR
Opportunity stage NAME contains: 'funded' / 'active investor'
    OR
Opportunity status = 'won' / stageId contains 'funded'/'closed'
    ↓
Extract monetaryValue/monetary_value → funded_amount
Extract lastStageChangeAt OR dateUpdated → funded_at (stage move date)
Match to lead using contactId → calculate time_to_fund_days
```

### Ad Spend Time Tracking
```text
Webhook/CSV with date + time
    ↓
Insert into ad_spend_reports (granular, with reported_at timestamp)
    ↓
Aggregate to daily_metrics (for dashboard compatibility)
```

---

## User Experience

### Historical Sync
1. Open Client Settings → Integrations tab
2. Select sync range from dropdown (7d / 30d / 90d / All)
3. Click "Sync Historical Data"
4. Progress indicator shows sync status
5. Success message with counts: leads created, calls synced, funded investors found

### Ad Spend Time Upload
- CSV format: `date,time,spend,impressions,clicks`
- Example: `2024-01-15,14:30,150.50,5000,120`
- Time is optional; if omitted, records still import by date

### Funded Investor Tags
- Contacts tagged "Funded", "funded investor", or "active investor" auto-detected
- Opportunity value pulled as funded amount
- Stage move date (or last update) used as funded date
- No manual intervention required after GHL sync
