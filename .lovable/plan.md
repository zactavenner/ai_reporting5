

## Plan: Redesigned Agency Dashboard Roll-Up Table

The current table has 20+ columns making it hard to scan. The reference image shows a much cleaner layout with focused columns and sync/bottleneck diagnostics. Here is the plan to implement this.

### New Column Layout

Replace the current wide table with these focused columns:

| Column | Source | Notes |
|--------|--------|-------|
| Client | client.name | Sticky left |
| Meta Spend | totalAdSpend | Currency |
| Meta Leads | totalLeads | Number |
| CPL | costPerLead | Currency, threshold-colored |
| GHL Leads | From leads table count or sync data | Separate from Meta leads |
| Booked Calls | totalCalls | Number |
| Shows | showedCalls | Number |
| Funded | fundedInvestors | Number, highlighted |
| L→B % | leads-to-booked conversion | Percent |
| B→S % | booked-to-showed conversion | Percent |
| S→F % | showed-to-funded conversion | Percent |
| Bottleneck | Computed: lowest conversion stage | Strikethrough text showing weakest link |
| Meta Sync | Derived from meta sync timestamps | Healthy/Stale/Not Synced badge |
| Meta Last Sync | Last meta sync timestamp | Formatted datetime |
| GHL | CRM connection status | Connected/Missing badge |

### Bottleneck Logic

Compute three conversion rates (L→B, B→S, S→F). The stage with the lowest rate gets flagged as the bottleneck, displayed with strikethrough styling matching the reference (e.g., "Lead→Booked" in red strikethrough).

### GHL Leads Column

Query the `leads` table count per client where `source = 'ghl'` or derive from the difference between Meta leads and total leads. Alternatively, use the existing metrics but label distinctly.

### Implementation Details

1. **Edit `DraggableClientTable.tsx`**:
   - Replace the 20-column header with the 15-column layout above
   - Remove: CTR, Spam/Bad, Cost/Call, Showed %, Cost/Show, Commit, Commit $, Funded $, Cost/Inv, CoC %, Est. Rev, Pacing
   - Add: GHL Leads (from metrics or leads query), L→B %, B→S %, S→F %, Bottleneck, Meta Sync status, Meta Last Sync datetime, GHL connection status
   - Add bottleneck computation function that identifies the weakest conversion stage
   - Add Meta sync status derived from `client.last_ghl_sync_at` and meta ad sync timestamps
   - Style bottleneck with strikethrough text and color coding

2. **Add Meta sync info**: Use existing client fields (`meta_ad_account_id`, ad sync data) to determine Meta sync health. Check if `daily_metrics` has recent rows or use the `integration_status` table.

3. **Sorting**: Update sort config to match new columns. Keep drag-to-reorder.

4. **Styling**: Dark row backgrounds, compact row height, monospace numbers, color-coded percentages (green >50%, red <20%), strikethrough bottleneck labels.

### Data Sources

- All current metric data remains from existing `metrics` prop
- GHL Leads: derive from leads data or use a new field
- Meta Sync: query `integration_status` table or derive from `daily_metrics` last date
- GHL status: existing `getClientSyncStatus()` helper already computes this

### Files Changed

- `src/components/dashboard/DraggableClientTable.tsx` — Major rewrite of columns and computed values

