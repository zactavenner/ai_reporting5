

## Plan: Slack Notification on Task Review via Lovable Slack Connector

### What happens
When a task moves to the **"review"** stage (via drag-and-drop or status dropdown), the system sends a formatted Slack message to that client's configured channel with the task title, description, and all comments.

### Approach
Use the **Slack connector** (now connected) via the connector gateway. No custom Slack app or webhook URL needed — the bot is already in all public channels.

### Changes

**1. Database migration**
Add `slack_review_channel_id TEXT` to `client_settings` — stores the Slack channel ID per client (e.g. `C0123456789`).

**2. New edge function: `send-task-review-slack/index.ts`**
- Accepts `{ taskId, clientId }`
- Loads task (title, description) + all `task_comments` + client name
- Loads `slack_review_channel_id` from `client_settings`
- If channel configured, sends via connector gateway: `POST https://connector-gateway.lovable.dev/slack/api/chat.postMessage` with formatted blocks
- Uses `LOVABLE_API_KEY` + `SLACK_API_KEY` headers

**3. Frontend triggers**
- In `KanbanBoard.tsx` `handleDragEnd`: after updating task to `review` stage, fire-and-forget call to the edge function
- In `TaskDetailPanel.tsx` `handleStatusChange`: same trigger when new status is `review`

**4. Client Settings UI**
In `ClientSettingsModal.tsx` under the Integrations tab, add a "Slack Review Notifications" section with:
- A channel selector that lists channels via `/conversations.list` gateway call (or simple text input for channel ID)
- Saved to `client_settings.slack_review_channel_id`

### Slack Message Format (Block Kit)
```text
📋 Task Ready for Review
━━━━━━━━━━━━━━━━━━━━━━
Title: Deploy new landing page
Client: Blue Capital

Description:
Update the hero section copy and CTA...

💬 Comments (3):
• John: Looks good, just fix the header spacing
• Sarah: Updated — ready for final review
• Client: Approved the copy changes
```

### Scope
- 1 migration (1 column on `client_settings`)
- 1 new edge function (`send-task-review-slack`)
- Update `KanbanBoard.tsx` and `TaskDetailPanel.tsx` with fire-and-forget calls
- Update `ClientSettingsModal.tsx` with channel config field

