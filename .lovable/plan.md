

# Add Default Pipeline Value Per Lead Setting

## Overview
Add a per-client setting that assigns a fixed dollar value to every lead for pipeline value calculations. For example, Blue Capital can set each lead to $100k, so pipeline value = lead count x $100k.

## What Changes

### 1. Database -- New Column on client_settings
Add `default_lead_pipeline_value` (numeric, default 0) to the `client_settings` table. When set to a value greater than 0, the system uses this as the per-lead value instead of relying on individual lead survey responses.

### 2. Settings UI -- New Field in KPI Section
Add a "Default Pipeline Value Per Lead" input field in the Settings > KPI Thresholds tab, below the existing "Total Raise Amount" field. Includes a helper label explaining that when set, every lead will be valued at this amount for pipeline calculations.

### 3. Pipeline Value Calculation Update
Update the aggregation logic in `useMetrics.ts` and `useSourceMetrics.ts`:
- If the client has a `default_lead_pipeline_value > 0`, pipeline value = total non-spam leads x that value
- Otherwise, fall back to the current behavior (sum/min from individual lead `pipeline_value` fields)

The `useClientSettings` hook already provides settings alongside metrics, so the calculation can reference it without additional queries.

---

## Technical Details

### Database Migration
```sql
ALTER TABLE client_settings 
ADD COLUMN IF NOT EXISTS default_lead_pipeline_value numeric DEFAULT 0;
```

### Files Changed
- `src/components/settings/ClientSettingsModal.tsx` -- add input field + state + save logic in KPI tab
- `src/hooks/useClientSettings.ts` -- add `default_lead_pipeline_value` to the `ClientSettings` interface and defaults
- `src/hooks/useAllClientSettings.ts` -- add to defaults
- `src/hooks/useMetrics.ts` -- update `aggregateMetrics()` to accept optional default value and use it when > 0
- `src/hooks/useSourceMetrics.ts` -- same calculation update
- `src/components/dashboard/KPIGrid.tsx` -- pass the setting through (no visual change needed, just data flow)

### Calculation Logic
```typescript
// In aggregateMetrics:
const pipelineValue = defaultLeadPipelineValue > 0
  ? (totals.totalLeads - totals.spamLeads) * defaultLeadPipelineValue
  : leadsWithPipeline.length > 0
    ? leadsWithPipeline.reduce((sum, l) => sum + (l.pipeline_value || 0), 0)
    : 0;
```
