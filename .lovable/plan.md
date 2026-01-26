
# Plan: Email Parsing for Investor Portal Notifications

## Summary

This feature adds the ability to automatically parse emails from investor portals (like Blue Capital, InvestNext, etc.) to detect new funded investors. The parsed data will be stored for manual review and approval before being finalized, though it will show as funded immediately in the dashboard with a "pending approval" status.

---

## Architecture Overview

Based on the uploaded email example from Blue Capital Holdings, investor portal emails follow a pattern:
- **Subject**: Contains investment notification keywords
- **Body**: Contains structured data like Name, Amount, Email, Phone, Offering Name, etc.

The system will:
1. Receive forwarded emails via a webhook endpoint
2. Use AI to parse the email content and extract investor details
3. Create a "pending" funded investor record (shows in metrics but marked for review)
4. Display pending records in a new UI for manual approval/rejection

---

## 1. Database Changes

### New Table: `email_parsed_investors`

Stores pending/parsed investor records awaiting approval.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `client_id` | uuid | Foreign key to clients |
| `email_subject` | text | Original email subject |
| `email_body` | text | Original email content |
| `email_from` | text | Sender address |
| `email_received_at` | timestamptz | When email was received |
| `parsed_name` | text | Extracted investor name |
| `parsed_email` | text | Extracted investor email |
| `parsed_phone` | text | Extracted investor phone |
| `parsed_amount` | numeric | Extracted investment amount |
| `parsed_offering` | text | Extracted offering/fund name |
| `parsed_class` | text | Investor class (Class A, B, etc.) |
| `parsed_accredited` | boolean | Accreditation status |
| `raw_parsed_data` | jsonb | All extracted fields |
| `status` | text | 'pending' / 'approved' / 'rejected' |
| `reviewed_by` | text | Who reviewed it |
| `reviewed_at` | timestamptz | When reviewed |
| `funded_investor_id` | uuid | Link to funded_investors once approved |
| `created_at` | timestamptz | Record creation time |

### Add Column to `funded_investors`

| Column | Type | Description |
|--------|------|-------------|
| `source` | text | 'webhook' / 'manual' / 'email_parsed' |
| `approval_status` | text | 'auto' / 'pending_review' / 'approved' |

---

## 2. New Edge Function: `parse-investor-email`

An edge function that:
1. Receives email content (from email forwarding service or manual paste)
2. Uses AI (Lovable-supported model) to extract structured data
3. Creates a pending record in `email_parsed_investors`
4. Optionally creates a funded investor record with "pending_review" status

### Endpoint
```
POST /functions/v1/parse-investor-email/{clientId}
```

### Request Body
```json
{
  "subject": "New Investment in Blue Capital RV Fund",
  "body": "Peter Dotson just placed an investment for $100,000!...",
  "from": "notifications@investorportal.com"
}
```

### AI Parsing Logic
Uses regex patterns + AI fallback to extract:
- Investor name (regex: `Name:\s*(.+)`)
- Amount (regex: `\$[\d,]+` or `Amount:\s*(.+)`)
- Email (regex: standard email pattern)
- Phone (regex: phone number patterns)
- Offering name
- Investor class
- Accreditation status

---

## 3. Settings UI: Email Parsing Tab

Add a new tab "Email Parsing" to the Client Settings modal with:

### Configuration Section
- **Enabled toggle**: Turn email parsing on/off for this client
- **Email patterns**: Define which sender domains to trust (e.g., `*@bluecapital.com`)
- **Auto-approve threshold**: Amount below which to auto-approve (or 0 for all manual)
- **Default offering name**: Pre-fill for single-fund clients

### Pending Approvals Section
- List of pending parsed emails with extracted data
- For each pending item:
  - Preview of parsed fields (editable)
  - **Approve** button → Creates funded investor record
  - **Reject** button → Marks as rejected, doesn't count in metrics
  - **View Original** → Shows raw email content

### Email Forwarding Instructions
- Display unique email forwarding address for this client
- Instructions on how to set up auto-forwarding from investor portal

---

## 4. Workflow Diagram

```text
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ Investor Portal │────▶│ Forward Email to │────▶│ parse-investor-   │
│ sends email     │     │ Lovable endpoint │     │ email function    │
└─────────────────┘     └──────────────────┘     └─────────┬─────────┘
                                                           │
                        ┌──────────────────────────────────┘
                        ▼
              ┌─────────────────────┐
              │ AI Parses Email     │
              │ Extracts: Name,     │
              │ Amount, Email, etc. │
              └─────────┬───────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────┐         ┌─────────────────────┐
│ email_parsed_     │         │ funded_investors    │
│ investors table   │         │ (status: pending)   │
│ (for review)      │         │ Shows in metrics!   │
└───────────────────┘         └─────────────────────┘
        │                               │
        │ User clicks Approve           │
        └───────────────────────────────┤
                                        ▼
                              ┌─────────────────────┐
                              │ funded_investors    │
                              │ (status: approved)  │
                              └─────────────────────┘
```

---

## 5. Implementation Files

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/parse-investor-email/index.ts` | Edge function for AI parsing |
| `src/components/settings/EmailParsingTab.tsx` | Settings UI for email config + approvals |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/settings/ClientSettingsModal.tsx` | Add "Email Parsing" tab |
| Database migration | Add `email_parsed_investors` table, update `funded_investors` |

---

## 6. Email Parsing Regex Patterns

Based on the Blue Capital email example, these patterns will extract data:

```javascript
const patterns = {
  name: /Name:\s*(.+?)(?:\n|$)/i,
  amount: /(?:Amount:\s*\$?|investment (?:of|for)\s*\$?)([\d,]+(?:\.\d{2})?)/i,
  email: /Email:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i,
  phone: /Phone:\s*([\d\s\-+()]+)/i,
  offering: /Offering(?:\s+Name)?:\s*(.+?)(?:\n|$)/i,
  investorClass: /(?:Investor\s+)?Class:\s*(.+?)(?:\n|$)/i,
  accredited: /Accredited:\s*(Yes|No)/i,
};
```

---

## 7. Approval Workflow Details

### When a new email is parsed:
1. Record created in `email_parsed_investors` with status='pending'
2. Record created in `funded_investors` with:
   - `source` = 'email_parsed'
   - `approval_status` = 'pending_review'
3. Record **DOES** count toward funded metrics (per your requirement)

### When user approves:
1. Update `email_parsed_investors.status` = 'approved'
2. Update `funded_investors.approval_status` = 'approved'
3. No metric changes needed (already counted)

### When user rejects:
1. Update `email_parsed_investors.status` = 'rejected'
2. **Delete** the corresponding `funded_investors` record
3. Metrics recalculate (funded count decreases)

---

## 8. Security Considerations

- Email parsing endpoint will be authenticated via client-specific token
- Email content stored temporarily for audit trail
- Parsed investor emails validated before approval
- Rate limiting on parsing endpoint to prevent abuse

---

## Implementation Order

1. **Database migration** - Create `email_parsed_investors` table, add columns to `funded_investors`
2. **Create parse-investor-email edge function** - AI parsing logic with regex fallback
3. **Create EmailParsingTab component** - Configuration and approval UI
4. **Update ClientSettingsModal** - Add new tab
5. **Add approval/rejection logic** - Handle status changes and metric updates
