
# Enhanced AI Hub with Full Gemini Capabilities

## Overview
Transform the AI Hub into a modern, feature-rich AI assistant interface with:
1. **Token usage tracking** in Knowledge Base (agency-level)
2. **Per-GPT file uploads** - Custom GPTs get their own dedicated files
3. **Enhanced UI/UX** - Gemini-inspired design with tools menu
4. **Client filtering** - Scope analysis to specific clients
5. **Data sources panel** - Organized file categories (like the reference image)

---

## Architecture Clarification

Based on your requirements:

| Component | Purpose | File Storage |
|-----------|---------|--------------|
| **Knowledge Base** | Agency-wide AI context | Shared documents for main AI |
| **Custom GPTs** | Specialized AI agents | **Dedicated files per GPT** |
| **Chat Attachments** | Session-specific files | Inline with messages |

This separation prevents file overload in any single area.

---

## Implementation Plan

### Phase 1: Database Schema Changes

**1a. New table for GPT-specific files:**
```sql
CREATE TABLE gpt_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gpt_id UUID NOT NULL REFERENCES custom_gpts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'document',
  file_url TEXT,
  content TEXT,
  character_count INTEGER DEFAULT 0,
  estimated_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**1b. Add token tracking to knowledge_base_documents:**
```sql
ALTER TABLE knowledge_base_documents 
ADD COLUMN character_count INTEGER DEFAULT 0,
ADD COLUMN estimated_tokens INTEGER DEFAULT 0;
```

### Phase 2: GPT Data Sources Panel (Like Reference Image)

Add a collapsible data sources section to Custom GPT configuration:

```
+-----------------------------------------------+
| Data sources                              (5) |
+-----------------------------------------------+
| > 📄 Files & Images                       (3) |
|     - campaign_guidelines.pdf                 |
|     - brand_assets.zip                        |
|     - logo.png                                |
| > 🌐 Web pages                            (2) |
|     - https://client.com/about                |
|     - https://docs.example.com                |
| > 📝 Text snippets                        (0) |
+-----------------------------------------------+
| [████████████░░░░░░] 72% capacity used    ⓘ |
+-----------------------------------------------+
```

Categories:
- **Files & Images**: PDFs, docs, images uploaded directly
- **Web pages**: URLs to scrape/reference
- **Text snippets**: Pasted text content

### Phase 3: Knowledge Base Token Tracking

Update `KnowledgeBasePanel.tsx`:

```
+-----------------------------------------------+
| Knowledge Base                                |
| Agency-wide context for main AI assistant     |
+-----------------------------------------------+
| Token Usage                                   |
| [████████░░░░░░░░░░░░] 24,500 / 100,000      |
| 3 documents • Used by Agency AI               |
+-----------------------------------------------+
| + Add Document                                |
+-----------------------------------------------+
| 📄 Campaign Guidelines                        |
|    PDF • Jan 27 • 8,200 tokens               |
|    ━━━━━━━░░░░ 8.2%                          |
+-----------------------------------------------+
```

### Phase 4: Custom GPTs File Upload UI

Redesign the GPT configuration dialog with a data sources section:

**Configure GPT Dialog:**
```
+-----------------------------------------------+
| Configure: Investment Analyst GPT             |
+-----------------------------------------------+
| DATA SOURCES                                  |
+-----------------------------------------------+
| Files & Images (3)                       [+]  |
| ┌───────────────────────────────────────────┐ |
| │ 📄 accredited_guidelines.pdf    12k tok  │ |
| │ 📄 investment_criteria.docx      8k tok  │ |
| │ 🖼️ fund_logo.png                 —       │ |
| └───────────────────────────────────────────┘ |
|                                               |
| Web Pages (2)                            [+]  |
| ┌───────────────────────────────────────────┐ |
| │ 🌐 https://sec.gov/investor-ed           │ |
| │ 🌐 https://client.com/offerings          │ |
| └───────────────────────────────────────────┘ |
|                                               |
| [████████████░░░░] 68% of capacity used    ⓘ |
+-----------------------------------------------+
```

### Phase 5: Enhanced AI Hub Chat UI

Modernize `AIHubChat.tsx` with Gemini-inspired design:

**5a. Header with Client Filter:**
```
+-----------------------------------------------+
| 🤖 Agency AI Assistant                        |
| [All Clients ▼]              [Gemini 3 ▼]   |
+-----------------------------------------------+
```

**5b. Tools Menu (Gemini-style):**
```
+-----------------------------------------------+
| [📎] [🔧 Tools ▼]                            |
|      ┌──────────────────────────┐             |
|      │ 🔍 Deep Research         │             |
|      │ 📊 Analyze Data          │             |
|      │ 📝 Create Report         │             |
|      │ 🎯 Campaign Ideas        │             |
|      └──────────────────────────┘             |
|                                               |
| ┌─────────────────────────────────────────┐  |
| │ Ask about clients, metrics...           │  |
| └─────────────────────────────────────────┘  |
|                                    [Pro ▼] ➤ |
+-----------------------------------------------+
```

**5c. Quick Action Chips:**
```
[Compare all clients] [Top performer] [Budget analysis]
```

### Phase 6: Model Selection Enhancement

Expand model options with descriptions:

| Model | Badge | Description |
|-------|-------|-------------|
| Gemini 3 Flash | Fast | Quick responses, balanced |
| Gemini 3 Pro | Pro | Advanced reasoning |
| GPT-5 | Powerful | Complex analysis |

---

## Component Changes Summary

### New Files to Create:
| File | Purpose |
|------|---------|
| `src/hooks/useGPTFiles.ts` | CRUD for GPT-specific files |
| `src/components/ai/GPTDataSourcesPanel.tsx` | Data sources UI for GPTs |
| `src/components/ai/AIToolsMenu.tsx` | Tools dropdown component |

### Files to Modify:
| File | Changes |
|------|---------|
| `src/components/ai/AIHubChat.tsx` | Tools menu, client filter, modern UI |
| `src/components/ai/KnowledgeBasePanel.tsx` | Token usage stats, capacity bar |
| `src/components/ai/CustomGPTsPanel.tsx` | Per-GPT file upload, data sources panel |
| `src/hooks/useKnowledgeBase.ts` | Token calculation on create |
| `supabase/functions/ai-analysis/index.ts` | Tool modes support |

### Database Changes:
- New `gpt_files` table for per-GPT files
- Add `character_count`, `estimated_tokens` to `knowledge_base_documents`

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AI HUB                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │  Knowledge Base  │     │      Custom GPTs             │  │
│  │  (Agency-wide)   │     │                              │  │
│  │                  │     │  ┌─────────┐  ┌─────────┐   │  │
│  │  📄 Doc 1        │     │  │ GPT #1  │  │ GPT #2  │   │  │
│  │  📄 Doc 2        │     │  │         │  │         │   │  │
│  │  🌐 URL 1        │     │  │ Files:  │  │ Files:  │   │  │
│  │                  │     │  │ 📄 A    │  │ 📄 X    │   │  │
│  │  Used by:        │     │  │ 📄 B    │  │ 🌐 Y    │   │  │
│  │  Main Agency AI  │     │  │ 🌐 C    │  │         │   │  │
│  └──────────────────┘     │  └─────────┘  └─────────┘   │  │
│           │               │       │            │         │  │
│           ▼               │       ▼            ▼         │  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   AI Chat Interface                   │  │
│  │  Context = Knowledge Base + Selected GPT's Files     │  │
│  │  + Agency Metrics + Client Filter                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Token/Capacity Calculation

```typescript
const TOKEN_LIMIT = 100000; // Per knowledge base / per GPT

const estimateTokens = (text: string): number => {
  // Approximate: 4 characters per token
  return Math.ceil(text.length / 4);
};

const getCapacityPercent = (usedTokens: number): number => {
  return Math.min(100, (usedTokens / TOKEN_LIMIT) * 100);
};

// Color coding
const getCapacityColor = (percent: number): string => {
  if (percent < 50) return 'bg-green-500';
  if (percent < 80) return 'bg-amber-500';
  return 'bg-red-500';
};
```

---

## File Upload Flow for GPTs

1. User opens GPT configuration
2. Clicks "Add File" in Data Sources
3. File uploads to Supabase Storage (`gpt-files` bucket)
4. Record created in `gpt_files` table with:
   - `gpt_id` reference
   - `file_url` or `content`
   - `character_count` / `estimated_tokens`
5. Token capacity updates in real-time
6. When chatting with GPT, files are injected into context

---

## Tool Modes Implementation

```typescript
const TOOL_MODES = {
  deepResearch: {
    name: 'Deep Research',
    icon: '🔍',
    prompt: 'Conduct thorough multi-step analysis...',
  },
  analyzeData: {
    name: 'Analyze Data',
    icon: '📊',
    prompt: 'Parse and analyze the provided data...',
  },
  createReport: {
    name: 'Create Report',
    icon: '📝',
    prompt: 'Generate a professional report...',
  },
  campaignIdeas: {
    name: 'Campaign Ideas',
    icon: '🎯',
    prompt: 'Brainstorm creative campaign ideas...',
  },
};
```

---

## Estimated Implementation

| Component | Lines of Code |
|-----------|---------------|
| Database Migration | ~20 |
| useGPTFiles Hook | ~80 |
| GPTDataSourcesPanel | ~180 |
| AIToolsMenu Component | ~100 |
| KnowledgeBasePanel Updates | ~80 |
| CustomGPTsPanel Updates | ~150 |
| AIHubChat Updates | ~200 |
| Edge Function Updates | ~60 |
| **Total** | **~870 lines** |

---

## Benefits

1. **Separation of Concerns**: Knowledge Base for agency, dedicated files per GPT
2. **Token Transparency**: Clear capacity usage at a glance
3. **Organized Data Sources**: Categorized like the reference image
4. **No File Overload**: Each GPT manages its own context
5. **Modern UI/UX**: Clean, intuitive Gemini-inspired design
6. **Flexible Context**: Filter by client or agency-wide
7. **Quick Tools**: One-click access to common AI tasks
