
# UTM Parameter Extraction & Attribution Enhancement Plan

## Problem Summary
UTM Campaign, UTM Medium, and UTM Content values are being stored in the `questions` array as form responses (e.g., `question: "UTM Campaign"`, `answer: "TOF | Blue Cap | REPs | Lead Form | CBO"`) instead of being extracted into the proper `utm_campaign`, `utm_medium`, `utm_content` columns. This breaks:
- The UTM Parameters display in record details
- Attribution Dashboard filtering and aggregation

## Root Cause
GoHighLevel sends UTM data as root-level fields with labels like "UTM Campaign", "UTM Medium" which the current extraction logic captures as "questions" rather than recognizing them as UTM parameters.

---

## Solution Architecture

```text
Webhook Payload / GHL Contact
       |
       v
+------------------+
| Extract Questions|
+------------------+
       |
       v
+----------------------------+
| NEW: Filter UTM fields     |
| from questions array,      |
| populate proper UTM columns|
+----------------------------+
       |
       v
+------------------+
| Store in leads   |
| table correctly  |
+------------------+
```

---

## Technical Implementation

### 1. Update Webhook Ingestion (`webhook-ingest/index.ts`)

Add logic to:
- Scan `questions` array for entries where `question` contains "UTM Campaign", "UTM Medium", "UTM Content", or "UTM Term"
- Extract those values and set the proper `utm_campaign`, `utm_medium`, `utm_content`, `utm_term` fields
- Remove UTM questions from the `questions` array so they don't appear under "Form Questions"

**New helper function:**
```typescript
function extractUtmFromQuestions(questions: any[]): {
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  filteredQuestions: any[];
} {
  const result: any = { filteredQuestions: [] };
  
  for (const q of questions) {
    const questionLower = String(q.question || '').toLowerCase().trim();
    
    if (questionLower.includes('utm_campaign') || questionLower === 'utm campaign') {
      result.utm_campaign = q.answer;
    } else if (questionLower.includes('utm_medium') || questionLower === 'utm medium') {
      result.utm_medium = q.answer;
    } else if (questionLower.includes('utm_content') || questionLower === 'utm content') {
      result.utm_content = q.answer;
    } else if (questionLower.includes('utm_term') || questionLower === 'utm term') {
      result.utm_term = q.answer;
    } else {
      // Keep non-UTM questions
      result.filteredQuestions.push(q);
    }
  }
  
  return result;
}
```

**Integration in processLead():**
```typescript
// After extracting questions...
const questions = extractQuestions(payload);
const utmFromQuestions = extractUtmFromQuestions(questions);

// Use UTM from questions as fallback if direct UTM fields are empty
const final_utm_campaign = utm_campaign || utmFromQuestions.utm_campaign;
const final_utm_medium = utm_medium || utmFromQuestions.utm_medium;
const final_utm_content = utm_content || utmFromQuestions.utm_content;
const final_utm_term = utm_term || utmFromQuestions.utm_term;

// Store filtered questions (without UTM entries)
const cleanQuestions = utmFromQuestions.filteredQuestions;
```

### 2. Update GHL Sync (`sync-ghl-contacts/index.ts`)

Apply the same `extractUtmFromQuestions` helper when processing GHL contacts, ensuring historical data is also properly attributed.

### 3. Database Fix for Existing Records

Create a one-time SQL update to fix existing leads where UTM data is in `questions` but not in UTM columns.

### 4. Attribution Dashboard Enhancement

Add `utm_content` to:
- The `Lead` interface props
- Filter dropdown options
- Aggregation dimension (optional: add "Content" view)

**Changes to `AttributionDashboard.tsx`:**
```typescript
// Add to Lead interface
utm_content?: string | null;
utm_medium?: string | null;
utm_campaign?: string | null;

// Add filter state
const [contentFilter, setContentFilter] = useState<string[]>([]);

// Add unique values extraction
const uniqueContents = useMemo(() => {
  const contents = new Set<string>();
  leads.forEach(lead => {
    if (lead.utm_content) contents.add(lead.utm_content);
  });
  return Array.from(contents).sort();
}, [leads]);

// Add FilterDropdown for Content
<FilterDropdown
  label="Content"
  options={uniqueContents}
  selected={contentFilter}
  onChange={setContentFilter}
  icon={<FileText className="h-3 w-3" />}
/>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/webhook-ingest/index.ts` | Add `extractUtmFromQuestions()` helper, integrate in `processLead()` |
| `supabase/functions/sync-ghl-contacts/index.ts` | Add same UTM extraction from questions during sync |
| `src/components/dashboard/AttributionDashboard.tsx` | Add `utm_content` to interface, add Content filter |

---

## Database Backfill (One-time Fix)

Run SQL to extract UTM values from questions JSON for existing leads:

```sql
-- Extract UTM Campaign from questions where utm_campaign is null
UPDATE leads
SET utm_campaign = (
  SELECT elem->>'answer'
  FROM jsonb_array_elements(questions::jsonb) AS elem
  WHERE LOWER(elem->>'question') LIKE '%utm campaign%'
  OR LOWER(elem->>'question') LIKE '%utm_campaign%'
  LIMIT 1
)
WHERE utm_campaign IS NULL
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(questions::jsonb) AS elem
  WHERE LOWER(elem->>'question') LIKE '%utm campaign%'
  OR LOWER(elem->>'question') LIKE '%utm_campaign%'
);

-- Similar queries for utm_medium and utm_content
```

---

## Expected Outcome

1. **UTM Parameters section** will correctly show Source, Medium, Campaign, Content, Term
2. **Form Questions section** will only show actual form questions (investment ranges, accreditation status, etc.)
3. **Attribution Dashboard** will have a Content filter and can aggregate by `utm_content`
4. Historical data will be corrected via backfill query

---

## Benefits

- Proper data organization matching the database schema
- Attribution Dashboard can filter by all UTM dimensions
- Cleaner UI with logical separation of UTM tracking vs survey questions
- Future webhooks automatically extract UTM correctly
