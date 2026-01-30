
# Plan: Fix Blank Public Report Page & Complete Facebook Ads Enhancement

## Root Cause Identified

After deep investigation, I found the **actual cause** of the blank screen:

The `CreativeApproval` component calls `useTeamMember()` at line 50, but the public route (`/public/:token`) is NOT wrapped in `TeamMemberProvider`. This causes the hook to throw:
```
Error: useTeamMember must be used within a TeamMemberProvider
```

This error crashes React before anything renders, resulting in a completely blank page. The ErrorBoundary we added should catch this, but the error happens during rendering so it may not always display properly.

---

## Fix Implementation

### Step 1: Wrap PublicReport in TeamMemberProvider

Update `src/pages/PublicReport.tsx` to wrap the content in `TeamMemberProvider`:

```typescript
import { TeamMemberProvider } from '@/contexts/TeamMemberContext';

export default function PublicReport() {
  return (
    <TeamMemberProvider>
      <ErrorBoundary>
        <PublicReportContent />
      </ErrorBoundary>
    </TeamMemberProvider>
  );
}
```

This allows `useTeamMember()` to work (returning `null` for `currentMember` since no one is logged in on public links).

### Step 2: Verify All useTeamMember Usages Are Safe

Ensure components like `CreativeApproval` handle `currentMember` being `null` gracefully (they already do - line 53 checks `!!currentMember`).

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/PublicReport.tsx` | Import `TeamMemberProvider` and wrap the exported component |

---

## Expected Result

After this fix:
1. `/public/legacy-capital` will load correctly
2. All components will function properly with `currentMember = null`
3. The ErrorBoundary will catch any other unexpected errors
4. Facebook Ads section will display in the Funnel tab (already implemented)

---

## Technical Flow

```text
User visits /public/legacy-capital
        │
        ▼
┌─────────────────────────────┐
│ TeamMemberProvider          │
│  (currentMember = null)     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ ErrorBoundary               │
│  (catches any render errors)│
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ PublicReportContent         │
│  - useClientByToken works   │
│  - All hooks function       │
│  - CreativeApproval renders │
│    (isAgencyUpload = false) │
└─────────────────────────────┘
```

---

## Why Previous Fixes Didn't Work

1. **RLS policies were fine** - The database queries work correctly
2. **ErrorBoundary was added** - But the error was thrown before it could fully catch it
3. **The real issue** - Missing context provider for `useTeamMember()` hook

This is a classic React context error that happens silently because the entire component tree fails to render.
