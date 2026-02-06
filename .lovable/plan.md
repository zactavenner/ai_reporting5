
# HubSpot CRM Integration Plan

## Overview

Add HubSpot as an alternative CRM integration alongside the existing GoHighLevel (GHL) integration. This will allow clients to sync contacts, deals, and call data from HubSpot using the same hourly sync architecture already established for GHL.

## Architecture Approach

The integration will follow the same patterns already established in your system:
- **Per-client API credentials** stored in the database
- **Hourly Edge Function sync** via `pg_cron` (matching GHL pattern)
- **Deal-to-Funded Investor mapping** using HubSpot deal stages (similar to GHL pipelines)
- **Contact sync** with UTM/attribution extraction

```text
+-------------------+       +----------------------+       +------------------+
|   Client Settings |------>|  sync-hubspot-       |------>|  leads, calls,   |
|   (HubSpot creds) |       |  contacts (Edge Fn)  |       |  funded_investors|
+-------------------+       +----------------------+       +------------------+
         ^                           |
         |                           v
+-------------------+       +----------------------+
| Settings Modal    |       | HubSpot CRM API v3   |
| (new tab section) |       | (Private App Token)  |
+-------------------+       +----------------------+
```

## Implementation Steps

### Phase 1: Database Schema Updates

**Add HubSpot columns to `clients` table:**
- `hubspot_portal_id` (text) - HubSpot account/portal ID
- `hubspot_access_token` (text) - Private App access token
- `hubspot_sync_status` (text) - healthy/syncing/error
- `hubspot_sync_error` (text) - Last error message
- `last_hubspot_sync_at` (timestamp) - Last successful sync

**Add HubSpot settings to `client_settings` table:**
- `hubspot_sync_enabled` (boolean) - Toggle for HubSpot sync
- `hubspot_funded_pipeline_id` (text) - Deal pipeline for funded investors
- `hubspot_funded_stage_ids` (text[]) - Deal stages that indicate "funded"
- `hubspot_committed_stage_ids` (text[]) - Deal stages for "committed"
- `hubspot_booked_meeting_types` (text[]) - Meeting types to track as calls
- `hubspot_reconnect_meeting_types` (text[]) - Meeting types for reconnect calls
- `hubspot_last_contacts_sync` (timestamp)
- `hubspot_last_deals_sync` (timestamp)

### Phase 2: Edge Function - `sync-hubspot-contacts`

Create new Edge Function with these capabilities:

**Authentication:** HubSpot Private App Token (simpler than OAuth for server-to-server)

**Sync Operations:**
1. **Contacts Sync** - Fetch contacts, map to `leads` table
2. **Deals Sync** - Fetch deals, create `funded_investors` records based on stage mapping
3. **Meetings Sync** - Fetch meeting engagements, create `calls` records
4. **Activities Sync** - Pull call recordings and notes

**Field Mapping (HubSpot to Internal):**
| HubSpot Field | Internal Field | Notes |
|---------------|----------------|-------|
| `vid` or `id` | `external_id` | Contact identifier |
| `firstname + lastname` | `name` | |
| `email` | `email` | |
| `phone` | `phone` | |
| `hs_analytics_source` | `utm_source` | Traffic source |
| `hs_latest_source` | `source` | Normalized source |
| `properties.utm_*` | `utm_*` columns | Campaign tracking |
| `lifecyclestage` | `status` | Lead status mapping |

**Deal Stage Mapping:**
- User configures which deal stages = "Funded" vs "Committed"
- On sync, deals in those stages create/update `funded_investors` records
- Monetary value maps to `funded_amount` or `commitment_amount`

### Phase 3: UI - Settings Modal Updates

**Update Integrations Tab:**
Add new section below GHL integration:

```text
┌────────────────────────────────────────────────────┐
│ 🔌 CRM Integration Selection                       │
│ ○ GoHighLevel  ● HubSpot  ○ None                  │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ HubSpot Integration                                │
├────────────────────────────────────────────────────┤
│ Portal ID: [_______________]                       │
│ (Found in Settings → Account Defaults)             │
│                                                    │
│ Private App Token: [••••••••••••••••]              │
│ (Generate in Settings → Integrations → Private    │
│  Apps → Create Private App)                        │
│                                                    │
│ Status: ● Connected                                │
│                                                    │
│ [Test Connection]  [Sync Now]                      │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Deal Stage Mapping                                 │
├────────────────────────────────────────────────────┤
│ Funded Pipeline: [Sales Pipeline     ▼]            │
│                                                    │
│ Funded Stages (select multiple):                   │
│ ☑ Closed Won                                       │
│ ☐ Contract Signed                                  │
│                                                    │
│ Committed Stages (select multiple):                │
│ ☑ Decision Made                                    │
│ ☐ Proposal Sent                                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Meeting Tracking                                   │
├────────────────────────────────────────────────────┤
│ Booked Call Meeting Types:                         │
│ ☑ Discovery Call                                   │
│ ☑ Sales Call                                       │
│                                                    │
│ Reconnect Meeting Types:                           │
│ ☑ Follow-up Meeting                                │
└────────────────────────────────────────────────────┘
```

### Phase 4: Hourly Sync Automation

**Update `pg_cron` schedule** to trigger HubSpot sync alongside GHL:

```sql
-- Add HubSpot sync to hourly schedule (offset by 30 minutes to avoid overlap)
SELECT cron.schedule(
  'hubspot-hourly-sync',
  '30 * * * *',  -- Run at :30 of every hour
  $$SELECT net.http_post(...)$$
);
```

### Phase 5: Hook Updates

**Create `useHubSpotSync` hook:**
- Test connection
- Trigger manual sync
- Fetch pipelines and meeting types for dropdown population

**Update `useClientSettings` hook:**
- Add HubSpot-specific fields to interface
- Handle new settings in mutations

## Required HubSpot API Scopes

When creating the Private App in HubSpot, these scopes are needed:
- `crm.objects.contacts.read` - Read contacts
- `crm.objects.deals.read` - Read deals/opportunities
- `crm.objects.companies.read` - Read company data
- `sales-email-read` - Read email engagements
- `crm.objects.owners.read` - Read owner assignments
- `crm.schemas.deals.read` - Read deal pipelines

## Technical Details

### HubSpot API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /crm/v3/objects/contacts` | Fetch contacts with properties |
| `GET /crm/v3/objects/deals` | Fetch deals with stage info |
| `GET /crm/v3/pipelines/deals` | List deal pipelines and stages |
| `GET /crm/v3/objects/meetings` | Fetch meeting engagements |
| `GET /crm/v3/objects/calls` | Fetch call engagements |
| `GET /crm/v4/associations` | Get contact-deal associations |

### Rate Limiting Strategy

HubSpot has stricter rate limits than GHL:
- 10 requests/second for Private Apps
- Implement 100ms delay between requests
- Batch operations where possible (max 100 per batch)
- Store `cursor` for pagination continuation on timeout

### Contact Property Extraction

Fetch these properties per contact:
```javascript
properties: [
  'email', 'firstname', 'lastname', 'phone',
  'lifecyclestage', 'hs_lead_status',
  'hs_analytics_source', 'hs_analytics_source_data_1',
  'utm_campaign', 'utm_source', 'utm_medium', 'utm_content'
]
```

## Files to Create/Modify

**New Files:**
- `supabase/functions/sync-hubspot-contacts/index.ts` - Main sync function
- `src/components/settings/HubSpotIntegrationSection.tsx` - UI component
- `src/components/settings/HubSpotPipelineMappingSection.tsx` - Deal stage mapping
- `src/components/settings/HubSpotMeetingTrackingSection.tsx` - Meeting type config
- `src/hooks/useHubSpotSync.ts` - Sync hook

**Modified Files:**
- `src/components/settings/ClientSettingsModal.tsx` - Add HubSpot tab content
- `src/hooks/useClientSettings.ts` - Add HubSpot settings fields
- `supabase/config.toml` - Register new Edge Function

**Database Migration:**
- Add HubSpot columns to `clients` table
- Add HubSpot settings to `client_settings` table
