
# Comprehensive GoHighLevel Historical Sync Enhancement Plan

## Executive Summary

This plan addresses a comprehensive historical data sync requirement to ensure all records from GoHighLevel (GHL) are accurately synchronized with the platform. Current state analysis shows:
- **2,045 leads** in database
- **195 calls** (104 orphaned without lead links - 53%)
- **1 funded investor** (significantly underrepresented)
- **0 pipeline opportunities** (sync not working)
- **46 data discrepancies** (need cleanup)

The goal is to implement a robust sync that:
1. Syncs ALL GHL contacts using their `dateAdded` as the creation date
2. Syncs ALL calls from configured calendars (tracked + reconnect)
3. Creates committed/funded investor records from pipeline stages
4. Links everything by GHL Contact ID for consistency
5. Clears stale discrepancies and refreshes sync health

---

## Phase 1: Enhance Contact Sync Logic

### 1.1 Update `sync-ghl-contacts` Edge Function

**Current Issue**: The sync fetches contacts but doesn't process beyond 1000 records efficiently. The `syncClientContacts` function has a `MAX_CONTACTS` limit.

**Changes Required**:

```text
supabase/functions/sync-ghl-contacts/index.ts
├── Remove MAX_CONTACTS limit for historical syncs
├── Add pagination state preservation
├── Ensure GHL dateAdded is ALWAYS used as created_at
├── Add batch upsert for better performance
└── Process opportunities during contact sync
```

Key modifications:
- When `mode: 'historical_sync'` is passed, remove the 500/1000 contact limit
- For each contact, also check if they exist in the configured funded/committed pipeline stages
- Create `funded_investors` records for contacts in funded stages
- Create `committed_investors` or flag leads for contacts in committed stages

### 1.2 Add Pipeline Stage Detection During Contact Sync

The client has configured:
- **Committed Stages**: `6ea766b8-4613-464a-8d3d-4f8807a81cf7` (High Probability), `19bc4d32-20cc-4f1a-b73e-3f141803f368` (Medium Probability)
- **Funded Stages**: `b21bd0ce-517f-4b93-87ff-5b74128aac68` (Funded This Month), `64d8ade1-dc94-444f-ac86-b7f865b43365` (Funds Received)
- **Pipeline ID**: `t8OHTTkxbcKvfInhCuEb`

New function to add:
```typescript
async function syncFundedFromPipelineStages(
  supabase: any,
  clientId: string,
  apiKey: string,
  settings: {
    fundedPipelineId: string;
    fundedStageIds: string[];
    committedStageIds: string[];
  }
): Promise<{ funded: number; committed: number }>
```

This will:
1. Fetch opportunities from the funded pipeline
2. Match opportunities to configured funded/committed stage IDs
3. Create `funded_investors` records with proper dates and values
4. Update leads with `opportunity_status`, `opportunity_stage`, `opportunity_value`

---

## Phase 2: Calendar-Based Call Sync

### 2.1 Add Calendar-Aware Appointment Fetching

**Current Issue**: The `syncAppointmentsAsCalls` function fetches ALL appointments for a contact without filtering by calendar. Need to respect the configured calendars.

**Client Configuration**:
- **Tracked Calendars** (Initial Booked Calls): `nNRBXQt3nuU370VG72ct`, `p4WfUDVjSfrT6q2usxiP`, `fFbAT17Agbq39QbgNpIQ`, `0cN0jObFCwvqECAlUZFk`
- **Reconnect Calendars**: `4V7RgTfh7jnFSA6ulNcJ`

**New Sync Mode**: Add `mode: 'historical_calls'` that:
1. Fetches client settings for calendar configuration
2. Uses GHL Calendars API to fetch ALL appointments from tracked calendars
3. Uses GHL Calendars API to fetch ALL appointments from reconnect calendars
4. Creates/updates call records with:
   - `ghl_calendar_id` for tracking which calendar
   - `is_reconnect: true` for reconnect calendar appointments
   - `scheduled_at` from appointment start time
   - `booked_at` from appointment creation date
   - Status mapping: showed, no_show, cancelled, confirmed

### 2.2 New Function for Calendar-Based Sync

```typescript
async function syncAllCalendarAppointments(
  supabase: any,
  client: ClientWithCredentials,
  trackedCalendarIds: string[],
  reconnectCalendarIds: string[]
): Promise<{ calls_created: number; calls_updated: number; reconnects: number }>
```

This fetches appointments differently - by calendar rather than by contact, which is more efficient for historical syncs:
1. For each tracked calendar, fetch all appointments with pagination
2. For each reconnect calendar, fetch all appointments
3. Match each appointment to a lead by contact ID
4. Upsert to calls table

---

## Phase 3: Pipeline Opportunities Sync

### 3.1 Fix Pipeline Sync Function

**Current Issue**: The `sync-ghl-pipelines` function exists but opportunities show 0 in database.

**Investigation Needed**:
- The `sync-ghl-pipelines` endpoint with `mode: 'sync'` and `pipeline_id` should work
- Need to call it for both configured pipelines

**Solution**: Create a new comprehensive sync mode that:
1. Syncs pipeline structure (stages)
2. Fetches ALL opportunities with full pagination
3. Links opportunities to contacts/leads
4. Creates funded_investors for opportunities in funded stages

### 3.2 Integration with Historical Sync

When running historical sync:
1. First sync pipelines and stages
2. Fetch all opportunities
3. For each opportunity:
   - Check if stage is in `funded_stage_ids` → Create funded_investor
   - Check if stage is in `committed_stage_ids` → Update lead status
   - Store `opportunity_value`, `opportunity_stage`, `opportunity_status` on lead

---

## Phase 4: Unified Historical Sync Command

### 4.1 New `mode: 'master_sync'` Handler

Create a master sync mode that orchestrates everything:

```typescript
if (mode === 'master_sync' && targetClientId) {
  // 1. Fetch client settings (calendars, pipelines, stages)
  
  // 2. Sync ALL contacts (no date limit, preserve GHL dateAdded)
  
  // 3. Sync ALL pipeline opportunities
  
  // 4. Create funded_investors from pipeline stages
  
  // 5. Sync ALL calendar appointments as calls
  
  // 6. Link orphaned calls to leads
  
  // 7. Clear old discrepancies and recalculate
  
  return { success, summary }
}
```

### 4.2 Add Hook for Master Sync

New hook: `useMasterSync.ts`
```typescript
export function useMasterSync() {
  return useMutation({
    mutationFn: async (clientId: string) => {
      return supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: clientId,
          mode: 'master_sync'
        }
      });
    },
    // ... success/error handlers
  });
}
```

---

## Phase 5: Data Cleanup

### 5.1 Discrepancy Reset

After successful historical sync:
1. Delete all existing discrepancies for the client:
   ```sql
   DELETE FROM data_discrepancies WHERE client_id = $clientId
   ```
2. Let normal sync cycle recalculate accurate discrepancies

### 5.2 Sync Health Accuracy

Update `useSyncHealth` to:
- Refresh after master sync completes
- Show accurate counts for leads, calls, funded investors
- Clear `ghl_sync_error` on client record

---

## Technical Implementation Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-ghl-contacts/index.ts` | Add `master_sync` mode, `historical_calls` mode, pipeline stage detection, remove contact limits for historical |
| `supabase/functions/sync-ghl-pipelines/index.ts` | Fix opportunity sync, add funded_investor creation |
| `src/hooks/useMasterSync.ts` | **NEW** - Hook for triggering comprehensive sync |
| `src/hooks/useSyncClient.ts` | Add master sync option |
| `src/components/settings/ClientSettingsModal.tsx` | Add "Run Complete Historical Sync" button |
| `src/components/dashboard/DataAuditSection.tsx` | Add master sync trigger option |

### New API Modes

1. **`mode: 'master_sync'`** - Full historical sync of all data types
2. **`mode: 'historical_calls'`** - Calendar-based appointment sync
3. **`mode: 'sync_funded'`** - Create funded investors from pipeline stages

### Expected Outcomes

After implementation:
- ALL GHL contacts synced with correct `created_at` dates
- ALL calendar appointments synced as call records
- ALL funded/committed investors created from pipeline stages
- ALL calls linked to leads (0 orphans)
- ALL opportunities showing in pipeline view
- Discrepancies cleared and recalculated accurately
- Sync health showing green/healthy status

---

## Execution Order

1. **Deploy updated edge functions** with new sync modes
2. **Run master sync** for client `f414feaa-c68e-4e68-b35d-fcefb8ff86e1`
3. **Verify results**:
   - Lead count increased (all GHL contacts)
   - Call count increased with 0 orphans
   - Funded investors populated from pipeline stages
   - Pipeline opportunities visible in UI
   - Discrepancies cleared
4. **Update UI** with master sync button for future use

---

## Data Flow Diagram

```text
Master Sync Flow:
┌──────────────────────────────────────────────────────────────────┐
│                        MASTER SYNC START                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    ▼                        ▼                        ▼
┌─────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│ CONTACTS    │    │ CALENDARS       │    │ PIPELINES           │
│ Full sync   │    │ Appointment     │    │ Opportunity sync    │
│ No limit    │    │ sync by         │    │ + funded investor   │
└──────┬──────┘    │ calendar ID     │    │ creation            │
       │           └────────┬────────┘    └──────────┬──────────┘
       │                    │                        │
       ▼                    ▼                        ▼
┌─────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│ LEADS       │◄───│ CALLS           │    │ FUNDED_INVESTORS    │
│ Table       │    │ Table           │    │ Table               │
│ external_id │    │ ghl_calendar_id │    │ pipeline stage      │
└──────┬──────┘    │ is_reconnect    │    │ based creation      │
       │           └─────────────────┘    └─────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              LINK ORPHANED CALLS → LEADS                          │
│              CLEAR DISCREPANCIES                                  │
│              UPDATE SYNC HEALTH                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Risk Mitigation

1. **API Rate Limits**: Add delays between batches (300ms)
2. **Timeout Prevention**: Process in batches, use background tasks
3. **Data Integrity**: Use upserts with conflict resolution
4. **Rollback**: No destructive operations on existing data
5. **Progress Tracking**: Log progress to `sync_logs` table
