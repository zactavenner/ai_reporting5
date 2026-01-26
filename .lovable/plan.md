

# Plan: Add GHL Private Integration to Client Settings

## Summary

Add an "Integrations" tab to the Client Settings modal that allows configuring GoHighLevel Private Integration credentials. The UI will clearly indicate that users should enter their **Private Integration Key** (not a legacy API key).

---

## What the User Needs from GHL

Before using this feature, users will need to:
1. Go to GHL → Settings → Integrations → Private Integrations
2. Create a new Private Integration with these scopes:
   - Contacts (read/write)
   - Calendars (read)
   - Opportunities (read)
   - Conversations (write) - optional, for notifications
3. Copy the generated token and Location ID

---

## Implementation

### File 1: `src/hooks/useClients.ts`

Add GHL fields to the Client interface and include them in queries:

```typescript
export interface Client {
  // ... existing fields
  ghl_location_id: string | null;
  ghl_api_key: string | null;
}
```

Update all `select()` statements to include these fields.

---

### File 2: `src/components/settings/ClientSettingsModal.tsx`

Add a new "Integrations" tab with the following UI:

```text
+------------------------------------------------------------+
|  INTEGRATIONS                                              |
+------------------------------------------------------------+
|  GoHighLevel Integration                                   |
|  Connect your GHL account to sync contacts and calls       |
|                                                            |
|  Location ID                                               |
|  [ve9EPM428h8vShlRW1KT________________________]            |
|  Found in GHL Settings > Business Profile                  |
|                                                            |
|  Private Integration Key                                   |
|  [••••••••••••••••••••••••••••••••••••••••••]              |
|  Generate from GHL Settings > Integrations > Private       |
|                                                            |
|  Connection Status: ● Connected / ○ Not Configured         |
|                                                            |
|  [Test Connection]     [Sync Contacts Now]                 |
|                                                            |
+------------------------------------------------------------+
```

**Features:**
- Password input for the Private Integration Key (masked)
- Helper text explaining where to find each value
- "Test Connection" button to validate credentials before saving
- "Sync Contacts Now" button to trigger immediate data sync
- Connection status indicator

---

## New Functions to Add

### Test Connection
```typescript
const handleTestConnection = async () => {
  // Save credentials temporarily, call sync-ghl-contacts with testOnly flag
  // Show success/error toast
};
```

### Sync Contacts
```typescript
const handleSyncContacts = async () => {
  // Call sync-ghl-contacts edge function
  // Invalidate leads query to refresh data
  // Show count of synced records
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useClients.ts` | Add `ghl_location_id` and `ghl_api_key` to Client interface and queries |
| `src/components/settings/ClientSettingsModal.tsx` | Add "Integrations" tab with GHL configuration UI |

---

## UI Details

### Tab Structure
The modal currently has tabs. We'll add a 6th tab:
1. Thresholds
2. Settings
3. Webhooks
4. Email Parsing
5. Custom Tabs
6. **Integrations** (new)

### Form Fields
- **Location ID**: Text input with placeholder showing format example
- **Private Integration Key**: Password input (type="password") to mask the token
- Helper text links explaining where to find these in GHL

### Action Buttons
- **Test Connection**: Validates credentials without saving
- **Sync Contacts Now**: Triggers immediate sync of all contacts
- Both buttons show loading spinners while processing

### Status Display
- Shows "Connected" with green dot when credentials are saved and validated
- Shows "Not Configured" when fields are empty
- Shows last sync timestamp if available

