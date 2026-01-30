
# Plan: Fix Audit & Troubleshoot Panel

## Summary
Overhaul the Audit & Troubleshoot section to make it actionable and focused. Key issues to address:

1. **Sync functionality not working** - Add manual sync triggers with progress feedback
2. **Gap records unclear** - Show only synced/gapped records with clear status indicators  
3. **Records need better readability** - Add GHL Contact ID, sync status, and last sync timestamp

---

## Implementation Steps

### 1. Add Manual Sync Buttons to Data Audit Section
Update `DataAuditSection.tsx` to include:
- **"Sync Leads"** button - Triggers GHL contact sync for this client
- **"Sync Calls"** button - Triggers call enrichment sync
- Show loading states during sync with result counts

### 2. Enhance Sync Health Table with Actions
Add to each row in the Sync Health table:
- **Sync Now** button per record type (leads/calls/funded)
- Show sync progress indicator
- Display last sync timestamp in absolute format (not relative)

### 3. Improve DiscrepancyReviewModal for Gap Records
Update `DiscrepancyReviewModal.tsx` to:
- Add **GHL Contact ID** column (from `external_id`)
- Add **Last Synced** column showing `ghl_synced_at` timestamp
- Add **"View in GHL"** link for each record
- Add **"Sync This Record"** button to pull fresh data from GHL
- Show clear **Sync Status** badge: "Synced" (has ghl_synced_at) vs "API Only" (no webhook match)

### 4. Add Bulk Sync Action for Gap Records
In the gap review modal:
- Add **"Sync All from GHL"** button to re-sync all gap records
- This fetches fresh contact data to enrich missing webhook records

### 5. Create useSyncClient Hook
Create a new hook to centralize client-level sync operations:
- `syncLeads()` - Full lead sync from GHL
- `syncCalls()` - Call enrichment sync
- `syncSingleRecord()` - Individual record refresh
- Track sync progress and errors

---

## Technical Details

### Files to Create:
- `src/hooks/useSyncClient.ts` - Centralized sync operations

### Files to Modify:
- `src/components/dashboard/DataAuditSection.tsx`
  - Add sync buttons per record type
  - Add sync progress states
  - Format timestamps in absolute format

- `src/components/drilldown/DiscrepancyReviewModal.tsx`
  - Add GHL Contact ID column  
  - Add Last Synced column
  - Add View in GHL link
  - Add per-row sync button
  - Add bulk sync action

- `src/hooks/useSyncHealth.ts`
  - Add last sync timestamp for each record type
  - Calculate sync status based on ghl_synced_at field

---

## UI Changes

### Data Audit Section
```text
+----------------------------------------+
| Audit & Troubleshoot          [Refresh]|
+----------------------------------------+
| Sync Health Summary                    |
| +------------------------------------+ |
| | Type   | Status | Records | Synced | Actions |
| | Leads  | Healthy| 1,234   | 2h ago | [Sync] |
| | Calls  | Stale  | 456     | 25h ago| [Sync] |
| | Funded | OK     | 89      | 1d ago | [Sync] |
| +------------------------------------+ |
+----------------------------------------+
```

### Gap Review Modal
```text
+-----------------------------------------------+
| Review Data Gap - Blue Capital                |
| Jan 28 - Jan 29, 2026                         |
+-----------------------------------------------+
| 33 leads in gap  [Select All] [Sync All] [Delete]|
+-----------------------------------------------+
| [ ] Name | Campaign | Email | GHL ID | Synced | |
| [x] Justin Traver | FB | email@... | EJgK... | Never | [Sync] |
| [ ] DL Jackson | FB | dlja... | wh_17... | Jan 30 | [GHL] |
+-----------------------------------------------+
```

---

## Expected Behavior After Fix

1. **Sync buttons work** - Clicking "Sync" triggers edge function and shows progress
2. **Gap records show sync status** - Clear indication of which records have been synced from GHL
3. **GHL Contact ID visible** - Easy to cross-reference with GHL CRM
4. **Individual record sync** - Can refresh single records from GHL
5. **Bulk sync option** - Can sync all gap records at once
