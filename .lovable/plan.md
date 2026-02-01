

# Lead Records UI Upgrade Plan

## Summary

This plan upgrades the leads/records table UI to be cleaner and more functional, with a new blue-based color scheme and additional data columns for enhanced lead tracking.

## What's Changing

### 1. Color Scheme: Green to Blue

The current design uses green as the primary accent color. We'll shift to a professional blue palette while maintaining theme consistency.

**Light Mode Changes:**
- Primary: `161 93% 30%` (green) → `217 91% 60%` (blue)
- Accent: `166 76% 96%` → `214 100% 97%`
- Chart colors: Shift to blue-purple spectrum

**Dark Mode Changes:**
- Primary: `158 64% 51%` → `213 94% 68%`
- Accent colors adjusted to match

### 2. New Data Columns for Leads Table

| Column | Description | Data Source |
|--------|-------------|-------------|
| **Days Since Created** | Shows "X days ago" or "Today" | Calculate from `created_at` field |
| **Survey Responses** | Shows survey answers inline with labels | Parse `questions` JSON field |
| **Engagement Stats** | Email/SMS/Calls sent counts | Query `contact_timeline_events` table |
| **Call Recordings** | Icon indicator if recordings exist | Check `calls.recording_url` for linked calls |

### 3. UI Visual Improvements

**Inspired by the reference image:**
- Cleaner row spacing with subtle hover states
- Expandable row design (chevron to expand for more details)
- Status dropdown integrated into the row (like the "Booked" dropdown shown)
- Relative timestamps with icons ("about 13 hours ago" format)
- Better badge styling for statuses
- Action icons (sync, external link) grouped on the right

### 4. Enhanced Survey Response Display

Currently shows "X Q&A" badge. Will expand to show:
- Accredited status as a pill badge (Yes/No)
- Investment range inline
- Other key fields as hover tooltip or expandable section

---

## Technical Implementation

### Phase 1: Color Scheme Update

**File: `src/index.css`**

Update CSS variables for both light and dark modes to use blue-based HSL values.

```text
Light mode primary:   217 91% 60%   (bright blue)
Light mode accent:    214 100% 97%  (light blue tint)
Dark mode primary:    213 94% 68%   (lighter blue)
```

Also update `chart-1`, `chart-2`, etc. to blue-purple spectrum for visual consistency.

### Phase 2: Enhanced Lead Type Definition

**File: `src/hooks/useLeadsAndCalls.ts`**

No schema changes needed - we already have all required fields:
- `created_at` - for days calculation
- `questions` - for survey responses
- `external_id` - for linking timeline events

### Phase 3: Create Engagement Stats Hook

**New file: `src/hooks/useLeadEngagementStats.ts`**

```typescript
// Fetches aggregated engagement stats for leads
// Counts emails, SMS, calls from contact_timeline_events
// Checks for call recordings from calls table
```

Returns:
```typescript
{
  [leadId: string]: {
    emailsSent: number;
    smsSent: number;
    callsMade: number;
    hasRecording: boolean;
  }
}
```

### Phase 4: Update InlineRecordsView Component

**File: `src/components/dashboard/InlineRecordsView.tsx`**

**Table Header Changes (around line 1350-1370):**
- Remove Ad Set, Ad ID columns (move to expandable row)
- Add: Days, Accredited, Investment, Engagement, Recording
- Reorganize column order for better flow

**Table Row Changes (around line 1370-1510):**

1. **Days Since Created Column:**
```tsx
<TableCell>
  <span className="text-sm text-muted-foreground">
    {formatDistanceToNow(new Date(lead.created_at), { addSuffix: false })}
  </span>
</TableCell>
```

2. **Accredited Badge Column:**
```tsx
<TableCell>
  {getAccreditedStatus(lead.questions) === 'yes' ? (
    <Badge className="bg-blue-500 text-white">Yes</Badge>
  ) : getAccreditedStatus(lead.questions) === 'no' ? (
    <Badge variant="secondary">No</Badge>
  ) : null}
</TableCell>
```

3. **Investment Range Column:**
```tsx
<TableCell className="text-sm">
  {getInvestmentRange(lead.questions) || '-'}
</TableCell>
```

4. **Engagement Stats Column:**
```tsx
<TableCell>
  <div className="flex items-center gap-2 text-xs">
    <span title="Emails"><Mail className="h-3 w-3" /> {stats.emailsSent}</span>
    <span title="SMS"><MessageSquare className="h-3 w-3" /> {stats.smsSent}</span>
    <span title="Calls"><Phone className="h-3 w-3" /> {stats.callsMade}</span>
  </div>
</TableCell>
```

5. **Recording Indicator Column:**
```tsx
<TableCell>
  {stats.hasRecording && (
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <Play className="h-3 w-3 text-blue-500" />
    </Button>
  )}
</TableCell>
```

**Row Expansion Feature:**
- Add expandable section showing full survey responses
- Show attribution details (Campaign, Ad Set, Ad ID)
- Display engagement timeline preview

### Phase 5: Status Dropdown Integration

**Inspired by reference image's "Booked" dropdown:**

Replace static status badge with an interactive dropdown that allows status updates inline:

```tsx
<Select value={lead.status || 'new'} onValueChange={(val) => updateLeadStatus(lead.id, val)}>
  <SelectTrigger className="w-28 h-8">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="new">New</SelectItem>
    <SelectItem value="potential">Potential</SelectItem>
    <SelectItem value="qualified">Qualified</SelectItem>
    <SelectItem value="booked">Booked</SelectItem>
    <SelectItem value="completed">Completed</SelectItem>
    <SelectItem value="no_show">No Show</SelectItem>
  </SelectContent>
</Select>
```

### Phase 6: Sync Status Improvements

**Enhance the GHL Sync column (reference shows relative time with refresh icon):**

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <CheckCircle className="h-3 w-3 text-green-500" />
    <span className="text-xs text-muted-foreground">
      {formatDistanceToNow(new Date(lead.ghl_synced_at), { addSuffix: true })}
    </span>
    <Button variant="ghost" size="icon" className="h-5 w-5">
      <RefreshCw className="h-3 w-3" />
    </Button>
    <a href={ghlUrl} target="_blank">
      <ExternalLink className="h-3 w-3" />
    </a>
  </div>
</TableCell>
```

---

## Helper Functions to Add

**In InlineRecordsView.tsx:**

```typescript
// Extract accredited status from questions array
const getAccreditedStatus = (questions: any[] | null): 'yes' | 'no' | null => {
  if (!questions) return null;
  const accreditedQ = questions.find(q => 
    q.question === 'UKtZxKiQgUDUa2wpb7SS' || 
    String(q.question).toLowerCase().includes('accredited')
  );
  if (!accreditedQ) return null;
  const answer = String(accreditedQ.answer).toLowerCase();
  if (answer === 'yes' || answer.includes('yes')) return 'yes';
  if (answer === 'no' || answer.includes('no')) return 'no';
  return null;
};

// Extract investment range from questions array
const getInvestmentRange = (questions: any[] | null): string | null => {
  if (!questions) return null;
  const investmentQ = questions.find(q => 
    q.question === 'DHkLtULj05sgxm3H8RET' ||
    String(q.question).toLowerCase().includes('investment')
  );
  return investmentQ ? String(investmentQ.answer) : null;
};
```

---

## Visual Design Specifications

### Table Row Styling
- Row height: 52px (comfortable for data density)
- Hover: `bg-muted/30` with subtle transition
- Selected: `bg-primary/10` with left border accent
- Expandable indicator: Chevron that rotates on expand

### Badge Styles
- Status badges: Rounded, 24px height
- "Yes" accredited: Blue background (`bg-blue-500`)
- "Booked" status: Yellow/amber background
- "Showed" status: Green background
- "No Show" status: Red/destructive background

### Typography
- Name: `font-medium text-sm`
- Contact info: `text-sm text-muted-foreground`
- Stats: `text-xs` with subtle icons
- Relative times: `text-xs text-muted-foreground`

---

## Files to Modify

1. **`src/index.css`** - Color scheme (green → blue)
2. **`src/hooks/useLeadEngagementStats.ts`** - New hook (create)
3. **`src/components/dashboard/InlineRecordsView.tsx`** - Table columns and row styling
4. **`src/components/dashboard/RecordDetailsGHLSection.tsx`** - Minor styling updates
5. **`src/hooks/useLeadsAndCalls.ts`** - Add lead status update mutation

---

## Data Requirements

**Current Database Schema Supports:**
- Days calculation: Uses existing `created_at`
- Survey responses: Uses existing `questions` JSONB field
- Investment range: Already in `questions` (field ID: `DHkLtULj05sgxm3H8RET`)
- Accredited status: Already in `questions` (field ID: `UKtZxKiQgUDUa2wpb7SS`)

**Engagement Stats Query:**
The `contact_timeline_events` table has `event_type` values for 'email', 'sms', 'call' - though currently sparse data. The UI will show counts even if zero.

**Call Recordings:**
The `calls` table has `recording_url` field but current data shows no recordings synced yet. The UI will display the indicator when available.

---

## Rollout Considerations

- No breaking changes to existing functionality
- Color changes are global but theme-consistent
- New columns can be hidden via column visibility toggle if needed
- Engagement stats lazy-load to avoid performance impact

