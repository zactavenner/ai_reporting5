
# Plan: Enhanced Task File Management & Creative Approval Workflow

## ✅ COMPLETED

## Summary
Overhaul the task file management system to provide inline media previews, direct creative approval workflow integration, task reassignment capabilities, and AI-powered content review directly on files.

---

## Implementation Complete

### 1. ✅ Inline Media Preview in Task Detail Modal
- Display media files directly in the task modal with large preview
- Videos play inline with controls
- Images show at readable size with aspect ratio preserved
- Navigation arrows to cycle through files
- "View Full Screen" button to open the lightbox
- **Files:** `src/components/tasks/InlineFilePreview.tsx` (NEW), `src/components/tasks/TaskDetailModal.tsx`

### 2. ✅ "Send to Creative Approval" Button
- Button available in both inline preview and lightbox
- Opens modal to configure: title, platform, headline, body copy
- Uses `useCreateCreative` hook with `isAgencyUpload: true`
- Auto-runs AI spelling/grammar check on video transcripts
- Creates review task for client with 2-business-day due date
- **Files:** `src/components/tasks/SendToCreativeModal.tsx` (NEW)

### 3. ✅ Task Reassignment in Modal
- Added "Assigned To" dropdown in task metadata section
- Shows all agency members with their pod assignments
- Reassignment automatically resets due date to 2 business days
- Records history entry for the reassignment
- **Files:** `src/components/tasks/TaskDetailModal.tsx`

### 4. ✅ AI Review for Task Files
- "AI Review" button appears for image/video files
- For videos: Transcribes content and checks for spelling/grammar issues
- For images: Checks for text/grammar issues
- Results appear as a comment in the task discussion thread
- References the specific file being reviewed
- **Files:** `src/hooks/useTaskFileReview.ts` (NEW)

### 5. ✅ Updated File Lightbox
- Added "Send to Creative Approval" button next to Download
- Added "AI Review" button for supported file types
- Shows loading state during AI analysis
- **Files:** `src/components/tasks/FilePreviewLightbox.tsx`

---

## New Files Created
- `src/hooks/useTaskFileReview.ts` - AI review hook for spelling/grammar check
- `src/components/tasks/SendToCreativeModal.tsx` - Modal for configuring creative before approval
- `src/components/tasks/InlineFilePreview.tsx` - Large inline media preview component

## Files Modified
- `src/components/tasks/TaskDetailModal.tsx` - Added inline preview, assignee field, AI review integration
- `src/components/tasks/FilePreviewLightbox.tsx` - Added action buttons, MiniThumbnail component
- `src/components/tasks/KanbanBoard.tsx` - Pass clientId to TaskDetailModal
- `src/components/tasks/AgencyTaskSummary.tsx` - Pass clientId to TaskDetailModal
