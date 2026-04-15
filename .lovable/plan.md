

# Fix GHL Connection Accuracy and CRM Status Display

## Problem Summary
1. **`ghl_sync_status` is stale/wrong**: The column reads `'healthy'` for clients whose last sync was 400-850+ hours ago. The `daily-master-sync` function updates `last_ghl_sync_at` but does not consistently update `ghl_sync_status`.
2. **Status logic is bypassed**: `getClientSyncStatus()` in `DraggableClientTable.tsx` checks `ghl_sync_status` first — if it says `'healthy'`, it never reaches the time-based check. This makes broken clients appear green.
3. **No client has synced GHL within 24h**: The most recent GHL sync across all clients is Blue Metric Group at 99 hours ago. Most are 400-850+ hours stale. Every CRM dot should currently be red, but many show green.

## Root Causes
- The `daily-master-sync` function calls `sync-ghl-contacts` but the sync function only updates `last_ghl_sync_at` on the client row — it does not recompute `ghl_sync_status` based on success/failure.
- The `getClientSyncStatus()` helper trusts `ghl_sync_status` over the timestamp, but nothing keeps that column accurate.

## Plan (4 files touched)

### 1. Fix `getClientSyncStatus()` in `DraggableClientTable.tsx`
- **Remove trust in `ghl_sync_status` column**. Derive status purely from `last_ghl_sync_at` timestamp and credential presence.
- Logic:
  - No credentials → `not_configured`
  - Has credentials, no `last_ghl_sync_at` → `error` (never synced)
  - `last_ghl_sync_at` < 24h → green (`healthy`)
  - `last_ghl_sync_at` 24-72h → amber (`stale`)  
  - `last_ghl_sync_at` > 72h → red (`error`)
- Same logic for HubSpot path.

### 2. Fix `daily-master-sync` to update `ghl_sync_status` after each client
- After GHL sync step succeeds: `UPDATE clients SET ghl_sync_status = 'healthy', ghl_sync_error = null WHERE id = clientId`
- After GHL sync step fails: `UPDATE clients SET ghl_sync_status = 'error', ghl_sync_error = errorMsg WHERE id = clientId`
- This keeps the column accurate for any code that reads it.

### 3. Fix `sync-ghl-contacts` to update `last_ghl_sync_at` on success
- Verify the function actually writes `last_ghl_sync_at = now()` after successful contact sync. If missing, add it.

### 4. Database: Reset stale `ghl_sync_status` values
- Run a one-time data fix (via insert tool) to set `ghl_sync_status` to `NULL` for all clients where `last_ghl_sync_at` is older than 24h. This immediately makes the dashboard show accurate red/amber status until the next successful sync.

```sql
UPDATE clients 
SET ghl_sync_status = NULL 
WHERE last_ghl_sync_at < now() - interval '24 hours' 
   OR last_ghl_sync_at IS NULL;
```

### Result
- Dashboard CRM column will immediately show accurate red/amber/green based on real sync timestamps
- Future syncs will keep the status column in sync
- No false greens — every client's status is derived from when data actually last flowed

### Files Modified
1. `src/components/dashboard/DraggableClientTable.tsx` — fix `getClientSyncStatus()`
2. `supabase/functions/daily-master-sync/index.ts` — add status column updates
3. `supabase/functions/sync-ghl-contacts/index.ts` — verify `last_ghl_sync_at` write  
4. Data fix via insert tool (not a migration)

