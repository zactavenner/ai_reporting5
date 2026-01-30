
# Plan: Enhanced Task File Management & Creative Approval Workflow

## Summary
Overhaul the task file management system to provide inline media previews, direct creative approval workflow integration, task reassignment capabilities, and AI-powered content review directly on files.

---

## Implementation Steps

### 1. Inline Media Preview in Task Detail Modal
Replace small file thumbnails with larger inline previews for images/videos:
- Display media files directly in the task modal (not just thumbnails)
- Videos play inline with controls
- Images show at ~300px height with aspect ratio preserved
- Add navigation arrows on the right side to cycle through files
- "View Full Screen" button to open the lightbox for larger view

### 2. Add "Send to Creative Approval" Button
In both inline preview and lightbox:
- Add "Send to Creative Approval" button next to Download
- Opens a quick dialog to set:
  - Creative title (defaults to file name)
  - Platform (Meta, TikTok, YouTube, Google)
  - Optional headline/body copy if relevant
- Uses existing `useCreateCreative` hook with `isAgencyUpload: true`
- Automatically runs AI spelling/grammar check on video transcripts
- Creates review task for client with 2-business-day due date

### 3. Task Reassignment in Modal
Add an inline "Assigned To" field in the task metadata section:
- New row in the grid showing current assignee
- Click to open dropdown with all agency members
- When reassigned:
  - Automatically resets due date to 2 business days from now
  - Records history entry for the reassignment
  - Sends notification to new assignee

### 4. AI Review for Task Files
Add AI content review capabilities for attached files:
- "AI Review" button appears for image/video files
- For videos: Transcribes content and checks for spelling/grammar issues
- For images with text: OCR + spelling/grammar check
- Results appear as a comment in the task discussion thread
- References the specific file being reviewed

### 5. File Comments Integration
Allow comments to reference specific files:
- When clicking "Comment" on a file, prefill the comment input with file reference
- Comments that reference files show the file thumbnail inline
- Discussion thread shows file-specific comments grouped

---

## Technical Details

### Files to Modify:

**src/components/tasks/TaskDetailModal.tsx**
- Add `assigned_to` field to inline editing grid
- Create `handleReassign` function that:
  - Updates assignee via `useUpdateTask`
  - Resets due date to `addBusinessDays(new Date(), 2)`
  - Records history entry
- Replace small file thumbnails with larger inline previews
- Add file navigation (prev/next arrows)
- Add "Send to Creative Approval" and "AI Review" buttons per file

**src/components/tasks/FilePreviewLightbox.tsx**
- Add `onSendToCreative` callback prop
- Add "Send to Creative Approval" button in header next to Download
- Add "AI Review" button for supported file types
- Show loading state during AI analysis

**src/components/tasks/SendToCreativeModal.tsx** (NEW)
- Modal for configuring creative before sending to approval
- Fields: title, platform, type (auto-detected), headline, body copy
- Calls `useCreateCreative` on submit

**src/hooks/useTaskFileReview.ts** (NEW)
- `useFileAIReview()` - Runs AI spelling/grammar check on file content
- For videos: Calls transcribe first, then spelling_check
- For images: Calls OCR endpoint, then spelling_check
- Returns review result to add as task comment

---

## UI Changes

### Task Detail Modal - Inline File Preview
```text
+------------------------------------------+
| Task Title                        [Delete]|
| Client: Blue Capital                      |
+------------------------------------------+
| Description | Status | Priority | Due Date|
| Assigned To: [John Smith ▼]               |
+------------------------------------------+
| Files (2)          [< Prev] [Next >]      |
| +--------------------------------------+  |
| |  ┌────────────────────────────────┐  |  |
| |  │                                │  |  |
| |  │     [VIDEO PLAYER INLINE]      │  |  |
| |  │                                │  |  |
| |  └────────────────────────────────┘  |  |
| |  Paradyme (8).mp4                    |  |
| |  [AI Review] [Send to Creative] [⤢]  |  |
| +--------------------------------------+  |
+------------------------------------------+
| Activity & Discussion                     |
| ...                                       |
+------------------------------------------+
```

### File Lightbox Header
```text
+------------------------------------------------+
| Paradyme (8).mp4 (1 of 3)  [◄] [►]             |
|                                                |
| [AI Review] [Send to Creative] [Download] [X]  |
+------------------------------------------------+
```

### Send to Creative Modal
```text
+--------------------------------------+
| Send to Creative Approval            |
+--------------------------------------+
| Title: [Paradyme (8)              ]  |
| Platform: [Meta ▼]                   |
| Type: Video (auto-detected)          |
|                                      |
| Optional Copy:                       |
| Headline: [                       ]  |
| Body Copy: [                      ]  |
|                                      |
| [Cancel]          [Send for Approval]|
+--------------------------------------+
```

---

## Expected Behavior

1. **Inline Preview**: Videos/images display directly in task modal at readable size
2. **File Navigation**: Arrow buttons cycle through attached files without opening lightbox
3. **Creative Approval Flow**: One-click to send file to creative approval with AI proofreading
4. **Reassignment**: Clicking assignee dropdown changes assignee and auto-resets due date
5. **AI Review**: Click to analyze file for spelling/grammar, results posted as comment
6. **File Comments**: Comments can reference specific files with thumbnails

---

## Data Flow

```text
Task File Upload
      │
      ▼
┌─────────────────┐
│ File in Task    │◄────────────────────────┐
└────────┬────────┘                         │
         │                                  │
    [AI Review]                    [Send to Creative]
         │                                  │
         ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ Transcribe      │              │ Create Creative │
│ (if video)      │              │ + AI Check      │
└────────┬────────┘              └────────┬────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ Spelling Check  │              │ Auto-create     │
│ via Gemini      │              │ Review Task     │
└────────┬────────┘              └────────┬────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ Post as Task    │              │ Client Reviews  │
│ Comment         │              │ in Creatives    │
└─────────────────┘              └─────────────────┘
```
