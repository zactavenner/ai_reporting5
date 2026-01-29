
# Pipeline Tab & Enhanced Contact Timeline

This plan adds a new "Pipeline" tab to the client detail view that mirrors the GoHighLevel (GHL) opportunities board, plus deep contact history sync for comprehensive customer journey tracking.

---

## Overview

### Part 1: Pipeline Tab
- Add "Pipeline" tab between Creatives and Custom Links tabs
- Within the Pipeline tab, allow adding up to 2 pipelines from GHL
- Display pipeline stages as Kanban-style columns with contacts/opportunities
- Show opportunity values, source, and quick contact info on each card
- Sync pipeline data from GHL API on demand

### Part 2: Enhanced Contact Timeline
- When any contact is manually synced, pull full historical data:
  - Contact info (name, email, phone)
  - UTM parameters and attribution data
  - Full activity timeline from GHL (tasks, appointments, notes, emails, SMS, calls)
  - Form questions and survey responses
  - Notes from GHL

---

## Data Architecture

### New Database Tables

**`client_pipelines`** - Stores which GHL pipelines are linked to each client

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| client_id | uuid | FK to clients |
| ghl_pipeline_id | text | GHL pipeline ID |
| name | text | Pipeline name |
| sort_order | int | Display order (max 2) |
| last_synced_at | timestamp | Last sync time |
| created_at | timestamp | |

**`pipeline_stages`** - Cached pipeline stages

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| pipeline_id | uuid | FK to client_pipelines |
| ghl_stage_id | text | GHL stage ID |
| name | text | Stage name |
| sort_order | int | Display order |

**`pipeline_opportunities`** - Synced opportunities

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| pipeline_id | uuid | FK to client_pipelines |
| stage_id | uuid | FK to pipeline_stages |
| ghl_opportunity_id | text | GHL opportunity ID |
| ghl_contact_id | text | GHL contact ID |
| contact_name | text | Contact name |
| contact_email | text | |
| contact_phone | text | |
| monetary_value | numeric | Opportunity value |
| source | text | Lead source |
| status | text | Open/Won/Lost/Abandoned |
| last_stage_change_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

**`contact_timeline_events`** - Full GHL activity history

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| client_id | uuid | FK to clients |
| lead_id | uuid | FK to leads (if matched) |
| ghl_contact_id | text | GHL contact ID |
| event_type | text | task, appointment, note, email, sms, call, form |
| event_subtype | text | completed, missed, sent, received, etc. |
| title | text | Event title/subject |
| body | text | Event content |
| event_at | timestamp | When event occurred |
| metadata | jsonb | Additional event data |
| created_at | timestamp | |

---

## GHL API Integration

### New Endpoints to Call

```text
GET /opportunities/pipelines?locationId={id}
→ Returns all pipelines with stages array

GET /opportunities/search?locationId={id}&pipelineId={id}&limit=100
→ Returns opportunities in a specific pipeline

GET /contacts/{contactId}/tasks
→ Returns tasks for contact

GET /contacts/{contactId}/appointments
→ Returns calendar appointments

GET /conversations/search?contactId={id}&locationId={id}
→ Returns SMS/email/call history
```

---

## UI Components

### 1. Pipeline Tab (New)

```text
┌─────────────────────────────────────────────────────────────┐
│  Pipeline                                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [Tactical Tracking ▼]  [+ Add Pipeline] [🔄 Sync]    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ Manual  │ │ High    │ │ Next    │ │ Funded  │ │ Funds   ││
│  │ Follow  │ │ Prob    │ │ Month   │ │ This    │ │ Recv'd  ││
│  │ 5 opps  │ │ 9 opps  │ │ 28 opps │ │ 3 opps  │ │ 88 opps ││
│  │$3.4M    │ │$2.4M    │ │$9.8M    │ │$700K    │ │$19.8M   ││
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤│
│  │┌───────┐│ │┌───────┐│ │┌───────┐│ │┌───────┐│ │┌───────┐││
│  ││Name   ││ ││Esther ││ ││Tim    ││ ││Phil   ││ ││Mihiran│││
│  ││Source ││ ││Fbook   ││ ││Fbook  ││ ││$100K  ││ ││$125K  │││
│  ││$100K  ││ ││$100K  ││ ││$250K  ││ │└───────┘│ │└───────┘││
│  │└───────┘│ │└───────┘│ │└───────┘│ │         │ │         ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 2. Add Pipeline Modal
- Dropdown to select from available GHL pipelines
- Shows pipeline name and stage count
- Validates max 2 pipelines per client

### 3. Opportunity Card Click
- Opens full contact detail panel
- Shows complete synced timeline
- Display all GHL notes, tasks, appointments

---

## Tab Order Update

Current order:
1. Overview
2. Attribution & Records  
3. Tasks
4. Funnel
5. Creatives
6. Custom Tabs...
7. Add Tab

New order:
1. Overview
2. Attribution & Records
3. Tasks
4. Funnel
5. Creatives
6. **Pipeline** ← New
7. Custom Tabs...
8. Add Tab

---

## Edge Function Updates

### `sync-ghl-pipelines` (New)

Handles:
- Fetching available pipelines from GHL
- Syncing pipeline stages
- Syncing opportunities with contact details
- Pagination for large opportunity lists

### `sync-ghl-contacts` (Enhanced)

Add new capabilities for single contact deep sync:
- Fetch contact tasks via `/contacts/{id}/tasks`
- Fetch contact appointments via `/contacts/{id}/appointments`  
- Fetch conversation history via `/conversations/search`
- Store all events in `contact_timeline_events` table

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/pipeline/PipelineTab.tsx` | Create | Main Pipeline tab component |
| `src/components/pipeline/PipelineBoard.tsx` | Create | Kanban board for stages |
| `src/components/pipeline/PipelineStageColumn.tsx` | Create | Individual stage column |
| `src/components/pipeline/OpportunityCard.tsx` | Create | Opportunity card component |
| `src/components/pipeline/AddPipelineModal.tsx` | Create | Modal to add pipeline from GHL |
| `src/components/pipeline/OpportunityDetailPanel.tsx` | Create | Full contact/opportunity details |
| `src/hooks/usePipelines.ts` | Create | Data hooks for pipelines |
| `src/hooks/useOpportunities.ts` | Create | Data hooks for opportunities |
| `src/hooks/useContactTimeline.ts` | Create | Hook for timeline events |
| `src/pages/ClientDetail.tsx` | Modify | Add Pipeline tab |
| `src/pages/PublicReport.tsx` | Modify | Add Pipeline tab for public view |
| `supabase/functions/sync-ghl-pipelines/index.ts` | Create | Pipeline sync edge function |
| `supabase/functions/sync-ghl-contacts/index.ts` | Modify | Add deep timeline sync |
| Database migrations | Create | New tables and RLS policies |

---

## Security Considerations

### RLS Policies

```sql
-- client_pipelines: Only viewable by authenticated users or via public token
CREATE POLICY "Authenticated can view pipelines"
ON client_pipelines FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Anon can view pipelines via client token"
ON client_pipelines FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_pipelines.client_id
    AND (clients.public_token IS NOT NULL OR clients.slug IS NOT NULL)
  )
);
```

Similar policies for `pipeline_stages`, `pipeline_opportunities`, and `contact_timeline_events`.

---

## Implementation Flow

### Phase 1: Database Setup
1. Create migration for new tables
2. Add RLS policies
3. Update types

### Phase 2: Edge Functions
1. Create `sync-ghl-pipelines` function
2. Enhance `sync-ghl-contacts` with timeline sync

### Phase 3: UI Components  
1. Create Pipeline tab components
2. Add hooks for data fetching
3. Integrate into ClientDetail page
4. Add to PublicReport page

### Phase 4: Enhanced Contact Sync
1. Add deep sync capability to single contact sync
2. Create timeline display component
3. Integrate with existing record details panel

---

## Technical Details

### Opportunity Card Data Structure
```typescript
interface PipelineOpportunity {
  id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  monetary_value: number;
  source: string | null;
  status: string;
  stage_id: string;
  last_stage_change_at: string | null;
}
```

### Timeline Event Types
```typescript
type TimelineEventType = 
  | 'task' 
  | 'appointment' 
  | 'note' 
  | 'email' 
  | 'sms' 
  | 'call' 
  | 'form_submission'
  | 'opportunity_stage_change';
```

### Pipeline Sync Request
```typescript
// Sync specific pipeline
const { data } = await supabase.functions.invoke('sync-ghl-pipelines', {
  body: { 
    client_id: clientId,
    pipeline_id: pipelineId, // GHL pipeline ID
    mode: 'full' // or 'opportunities_only'
  }
});
```

---

## Summary

This implementation:
- Adds a Pipeline tab that mirrors GHL's Opportunities view
- Supports up to 2 pipelines per client
- Shows all stages and opportunities with values
- Enables deep contact sync for full GHL timeline history
- Works in both agency and public client views
- Maintains security through proper RLS policies
