
# Accurate Historical Reporting System Plan

## Problem Summary

After analyzing the database and sync code, I found **three critical issues** causing inaccurate reporting:

1. **Calls `created_at` = sync time, not GHL creation time** - Despite code setting `created_at: ghlCreatedAt`, the database default `now()` overrides it during INSERT. This causes all historical calls to appear as "today's calls."

2. **No historical daily_metrics recalculation** - The current system only updates TODAY's metrics. When syncing 365 days of history, it doesn't populate metrics for Dec 15, Jan 3, etc.

3. **Inconsistent date column usage** - Leads/Calls use different columns for filtering (`created_at` vs `booked_at`), creating confusion.

---

## Solution Architecture

```text
+------------------+     +-------------------+     +------------------+
| GHL Historical   |     | Source Tables     |     | Reporting Layer  |
| Sync             | --> | (leads, calls,    | --> | (daily_metrics)  |
| (365 days)       |     | funded_investors) |     |                  |
+------------------+     +-------------------+     +------------------+
        |                        |                         ^
        v                        v                         |
  Use dateAdded         Filter by correct         Recalculate for
  for created_at        timestamp column          each historical day
```

---

## Implementation Phases

### Phase 1: Fix Call Record Date Insertion (Database Fix)

**Problem**: Supabase's default `now()` overrides explicit `created_at` values during INSERT.

**Solution**: Modify the calls table to NOT have a default on `created_at` when using upsert, or explicitly handle in the sync function.

**Database Migration:**
```sql
-- Option 1: Create a function to handle proper date insertion
-- The sync will explicitly set created_at and we prevent default override

-- Add index for booked_at since we'll filter by it
CREATE INDEX IF NOT EXISTS idx_calls_booked_at ON calls(booked_at);
CREATE INDEX IF NOT EXISTS idx_calls_client_booked ON calls(client_id, booked_at);
```

**Edge Function Fix:**
- Update `syncAppointmentToCall` to explicitly set timestamps before insert
- Ensure upsert doesn't trigger default values

### Phase 2: Add `booked_at` Column Usage for Calls Filtering

**Current State**: Calls filtering uses `created_at` which is wrong for historical data.

**Solution**: Change call queries to use `booked_at` for date filtering (when the call was BOOKED in GHL), not when it was synced.

**Files to Update:**
- `src/hooks/useLeadsAndCalls.ts` - Filter calls by `booked_at`
- `src/hooks/useMetrics.ts` - Any call-related metric queries
- `src/components/dashboard/InlineRecordsView.tsx` - Display booked date

### Phase 3: Historical Daily Metrics Recalculation

**Problem**: Only TODAY's metrics are updated after sync.

**Solution**: Create a comprehensive metrics recalculation function that:
1. Groups leads by DATE(created_at) 
2. Groups calls by DATE(booked_at)
3. Groups funded_investors by DATE(funded_at)
4. Upserts daily_metrics for each date

**New Edge Function Logic:**
```typescript
async function recalculateHistoricalMetrics(
  supabase: any,
  clientId: string,
  startDate: string,  // e.g., '2025-12-01'
  endDate: string     // e.g., '2026-02-03'
): Promise<{ daysUpdated: number }> {
  // 1. Get all unique dates with activity
  // 2. For each date, count leads, calls, showed, funded
  // 3. Upsert daily_metrics
}
```

### Phase 4: Master Sync Integration

**Update the master_sync flow to:**
1. Sync contacts (using GHL dateAdded) ✓ Already done
2. Sync calendar appointments (using GHL dateAdded for booked_at)
3. Sync pipeline opportunities (using lastStageChangeAt for funded_at)
4. **NEW**: Recalculate daily_metrics for all affected dates
5. Link orphaned calls to leads

### Phase 5: Fix Existing Data

**One-time data repair:**
```sql
-- Update calls: set created_at = booked_at where they differ
UPDATE calls 
SET created_at = booked_at 
WHERE booked_at IS NOT NULL 
  AND DATE(created_at) != DATE(booked_at);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-ghl-contacts/index.ts` | Add `recalculateHistoricalMetrics()`, call after master_sync |
| `src/hooks/useLeadsAndCalls.ts` | Change calls to filter by `booked_at` instead of `created_at` |
| `src/hooks/useMetrics.ts` | Update call queries to use `booked_at` |
| `supabase/migrations/` | Add indexes, one-time data fix |
| `src/components/dashboard/InlineRecordsView.tsx` | Display "Booked" date prominently |

---

## Detailed Function: recalculateHistoricalMetrics

```typescript
async function recalculateHistoricalMetrics(
  supabase: any,
  clientId: string
): Promise<{ daysUpdated: number; errors: string[] }> {
  const result = { daysUpdated: 0, errors: [] as string[] };
  
  // Get date range from data
  const { data: dateRange } = await supabase.rpc('get_client_date_range', { 
    p_client_id: clientId 
  });
  
  // For each day in range
  for (const date of eachDayOfRange) {
    // Count leads created on this date
    const { count: leads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${nextDate}T00:00:00`);
    
    // Count calls BOOKED on this date  
    const { count: calls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('booked_at', `${date}T00:00:00`)
      .lt('booked_at', `${nextDate}T00:00:00`);
    
    // Count showed calls BOOKED on this date
    const { count: showed } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('showed', true)
      .gte('booked_at', `${date}T00:00:00`)
      .lt('booked_at', `${nextDate}T00:00:00`);
    
    // Get funded investors for this date
    const { data: funded } = await supabase
      .from('funded_investors')
      .select('funded_amount')
      .eq('client_id', clientId)
      .gte('funded_at', `${date}T00:00:00`)
      .lt('funded_at', `${nextDate}T00:00:00`);
    
    // Upsert daily_metrics
    await supabase.from('daily_metrics').upsert({
      client_id: clientId,
      date: date,
      leads: leads || 0,
      calls: calls || 0,
      showed_calls: showed || 0,
      funded_investors: funded?.length || 0,
      funded_dollars: funded?.reduce((s, f) => s + f.funded_amount, 0) || 0,
    }, { onConflict: 'client_id,date' });
    
    result.daysUpdated++;
  }
  
  return result;
}
```

---

## Configuration Validation Display

When settings are missing, the sync will show clear warnings:

| Missing Setting | Warning Message |
|-----------------|-----------------|
| No tracked calendars | "Booked calls will not sync - configure tracked calendars" |
| No reconnect calendars | "Reconnect calls will not sync" |
| No funded pipeline | "Funded investors will not sync from pipeline stages" |
| No funded stages | "Pipeline set but no funded stages configured" |

---

## Expected Outcomes

After implementation:

1. **Leads**: Show on the date they were ADDED in GHL (not synced)
2. **Calls**: Show on the date they were BOOKED in GHL (not synced)
3. **Funded Investors**: Show on the date they reached funded stage (lastStageChangeAt)
4. **Daily Metrics**: Automatically populated for ALL historical dates
5. **No Over-Reporting**: Historical records won't inflate today's numbers

---

## Technical Notes

### Why `created_at` Gets Wrong Value

Supabase INSERT behavior:
```sql
-- Table definition
created_at TIMESTAMP WITH TIME ZONE DEFAULT now()

-- When you INSERT with explicit value
INSERT INTO calls (created_at, ...) VALUES ('2025-12-16', ...)
-- Supabase respects the value ✓

-- BUT if INSERT happens via SDK upsert and column has trigger/default
-- The default can still apply in some cases
```

**Fix**: Explicitly handle in the insert payload AND ensure no trigger overrides it.

### Date Column Strategy

| Table | Date Column | Usage |
|-------|-------------|-------|
| leads | created_at | When lead entered GHL (dateAdded) |
| calls | booked_at | When appointment was booked (dateAdded) |
| calls | scheduled_at | When appointment is scheduled to occur |
| funded_investors | funded_at | When they reached funded stage |
| daily_metrics | date | Aggregation date (date only, no time) |
