
# Comprehensive Data Sync & API Status Plan

## Summary
This plan addresses three critical issues:
1. **API Connection Status**: Implement a unified "green indicator" when all three API modules (Contacts, Calendars, Opportunities) are connected
2. **Contact Record Details**: Fix records showing random IDs instead of actual contact names/details
3. **Data Sync Based on Settings**: Ensure leads, calls, commitments, and funded investors are properly synced using configured calendar and pipeline mappings

---

## Issue Analysis

### Current State
Based on database analysis:
- Many clients have calls but **zero leads** (e.g., Lansing Capital: 15 calls, 0 leads)
- Most clients have **empty calendar/pipeline settings** - only Blue Capital has proper configuration
- Calls display external IDs instead of names because:
  - `lead_id` is NULL on call records
  - No leads exist to match with
  - The `linkOrphanedCallsToLeads` function can't match because leads were never synced

### Root Cause
The sync process isn't pulling contacts (leads) from GHL before syncing appointments. Without leads, calls can't be linked, and records show cryptic IDs.

---

## Implementation Plan

### Phase 1: Unified API Connection Status Indicator

**What it does**: Shows a single green checkmark when all three APIs (Contacts, Calendars, Opportunities) are connected and working.

**Changes Required**:

**1. Update ApiConnectionStatus Component** (`src/components/settings/ApiConnectionStatus.tsx`)
- Add an "overall status" mode that shows:
  - Green checkmark if ALL three are successful
  - Yellow warning if any are pending/not configured
  - Red X if any have errors
- Keep compact mode for detailed breakdown

**2. Update DraggableClientTable** (`src/components/dashboard/DraggableClientTable.tsx`)
- Replace the current C/Cal/O indicators with a single unified status icon
- Add tooltip showing detailed breakdown on hover

```text
+------------------+     +-----------+
| Test API Button  | --> | Per-client|
+------------------+     | Results   |
                         +-----------+
                               |
                         +-----v-----+
                         | Overall   |
                         | Green/Red |
                         +-----------+
```

---

### Phase 2: Fix Contact Record Details (No More Random Numbers)

**What it does**: Ensures call records display actual contact names, emails, and phone numbers instead of cryptic IDs.

**Changes Required**:

**1. Enhance Sync Function** (`supabase/functions/sync-ghl-contacts/index.ts`)
- In `syncAppointmentToCall`, fetch contact details from GHL when creating/updating calls
- Store contact name, email, phone directly on call records
- This ensures calls have data even without a linked lead

**2. Add Contact Fields to Calls Table**
```sql
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_phone TEXT;
```

**3. Update UI to Use Embedded Contact Data** (`src/components/dashboard/InlineRecordsView.tsx`)
- Update `getLeadName` function to fallback to call's embedded contact fields
- Display: `call.contact_name || getLeadName(call.lead_id) || call.external_id`

**4. Improve linkOrphanedCallsToLeads Function**
- After linking calls to leads, copy the lead's contact details to the call record
- This creates denormalized but reliable display data

---

### Phase 3: Data Sync Based on Settings

**What it does**: Ensures leads, calls (booked/showed), commitments, and funded investors are pulled based on client settings.

**Changes Required**:

**1. Master Sync Enhancement** (`supabase/functions/sync-ghl-contacts/index.ts`)

Ensure the sync process follows this order:
```text
Phase 1: Contacts → Creates leads in database
Phase 2: Calendars → Creates calls, links to leads
Phase 3: Pipelines → Creates funded_investors, commitments
Phase 4: Link orphans → Ensures all records are connected
```

**2. Update Sync to Use Calendar Settings**
```typescript
// Fetch client settings BEFORE syncing
const { data: settings } = await supabase
  .from('client_settings')
  .select('tracked_calendar_ids, reconnect_calendar_ids, funded_pipeline_id, funded_stage_ids, committed_stage_ids')
  .eq('client_id', clientId)
  .single();

// Only sync calendars that are configured
if (settings?.tracked_calendar_ids?.length > 0) {
  await syncAllCalendarAppointments(supabase, client, 
    settings.tracked_calendar_ids, 
    settings.reconnect_calendar_ids || []);
}
```

**3. Use Correct Timestamps**
- Leads: Use GHL's `dateAdded` field for `created_at`
- Calls: Use appointment's `startTime` for `scheduled_at`, `dateAdded` for `booked_at`
- Funded Investors: Use `lastStageChangeAt` or `dateUpdated` for `funded_at`

**4. Add Date/Time Display Fix** (`src/components/dashboard/InlineRecordsView.tsx`)
- Ensure all record tables show both date AND time
- Format: `Jan 15, 2026 2:30 PM` (not just `Jan 15, 2026`)

---

### Phase 4: Pipeline-Based Commitment & Funded Tracking

**What it does**: Correctly pulls commitments and funded investors based on configured pipeline stage mappings.

**Changes Required**:

**1. Commitment Detection** (`supabase/functions/sync-ghl-contacts/index.ts`)
- When opportunity moves to a stage in `committed_stage_ids`:
  - Create `funded_investors` record with `commitment_amount` = monetary value
  - Set `funded_amount` = 0

**2. Funded Detection**
- When opportunity moves to a stage in `funded_stage_ids`:
  - Update `funded_investors` record with `funded_amount` = monetary value
  - Use `lastStageChangeAt` as `funded_at` date

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/settings/ApiConnectionStatus.tsx` | Add unified overall status mode |
| `src/components/dashboard/DraggableClientTable.tsx` | Use unified status indicator |
| `supabase/functions/sync-ghl-contacts/index.ts` | Enhanced contact sync, calendar settings usage |
| `src/components/dashboard/InlineRecordsView.tsx` | Fallback to embedded contact data, date/time formatting |
| `supabase/migrations/` | Add contact fields to calls table |

---

## Technical Details

### Database Migration
```sql
-- Add contact fields to calls for denormalized display
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Create index for faster orphan linking
CREATE INDEX IF NOT EXISTS idx_calls_external_id ON calls(external_id);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id);
```

### Sync Flow Diagram
```text
Master Sync Triggered
        |
        v
+-------------------+
| 1. Sync Contacts  |-----> Creates/Updates LEADS table
+-------------------+
        |
        v
+-------------------+
| 2. Sync Calendars |-----> Creates CALLS linked to leads
| (tracked + recon) |       Uses tracked_calendar_ids setting
+-------------------+
        |
        v
+-------------------+
| 3. Sync Pipelines |-----> Creates FUNDED_INVESTORS
| (committed+funded)|       Uses funded_stage_ids setting
+-------------------+
        |
        v
+-------------------+
| 4. Link Orphans   |-----> Links unlinked calls to leads
+-------------------+
        |
        v
+-------------------+
| 5. Update Status  |-----> Sets ghl_sync_status = 'healthy'
+-------------------+
```

---

## Expected Outcomes

After implementation:
1. **Client Summary Table**: Single green/red indicator per client showing overall API health
2. **Record Details**: All calls show actual contact names (e.g., "John Smith") instead of IDs
3. **Proper Dating**: Records show correct dates/times based on when they actually occurred in GHL
4. **Settings-Based Sync**: 
   - Booked calls from configured tracked calendars
   - Reconnect calls from configured reconnect calendars
   - Commitments from configured commitment pipeline stages
   - Funded investors from configured funded pipeline stages
