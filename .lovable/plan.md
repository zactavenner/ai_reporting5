
# Enhanced Funnel Section: Multi-Device Preview, Flow Visualization & Reordering

This plan enhances the Funnel tab with tablet/desktop previews, visual flow diagrams similar to Funnelytics, and drag-and-drop step reordering.

---

## Overview

The enhanced Funnel section will transform the current simple iPhone preview grid into a comprehensive funnel visualization tool with:

1. **Multi-device previews** - iPhone, iPad (tablet), and desktop browser mockups
2. **Funnel flow visualization** - Visual diagram showing step connections with arrows and conversion metrics
3. **Drag-and-drop reordering** - Reorder funnel steps with persistence to database
4. **Tab placement** - Move Funnel tab after Tasks and add to agency-level Project Management

---

## Feature 1: Multi-Device Mockups

### New Device Components

Create additional mockup components for different device sizes:

**1.1 TabletMockup Component**
- iPad-style frame with 768x1024 viewport
- Rounded corners, thin bezel aesthetic
- Responsive iframe scaling similar to iPhone mockup
- Home indicator at bottom

**1.2 DesktopMockup Component**
- Browser window frame with address bar, traffic light buttons
- 1280x720 viewport (simulated)
- Chrome/Safari-style window chrome
- URL display showing the actual page URL

**1.3 Device Selector UI**
- Toggle button group to switch between device views
- Icons: Smartphone, Tablet, Monitor
- Selected device type persists per step or globally

### Implementation Details

```text
+----------------+   +----------------+   +------------------+
|  iPhone 14     |   |   iPad Pro     |   |  Desktop Browser |
|  390 x 844     |   |   820 x 1180   |   |   1280 x 720     |
+----------------+   +----------------+   +------------------+
```

---

## Feature 2: Funnel Flow Visualization

### Visual Flow Diagram

Create a horizontal or vertical flow diagram that shows:
- Each step as a node/card
- Connecting arrows between steps
- Optional: Conversion rate labels on arrows

**2.1 FunnelFlowDiagram Component**
- Uses SVG for drawing connection lines and arrows
- Step nodes positioned in a horizontal row
- Curved or straight arrows connecting consecutive steps
- Animated flow indicators (optional)

**2.2 Step Node Design**
```text
+---------------------------+
|  [1] Landing Page         |
|  +-----------------+      |
|  |   Thumbnail     |      |  ------>  [2] Form Page  ------>  [3] Thank You
|  |   Preview       |      |
|  +-----------------+      |
|  example.com/landing      |
+---------------------------+
```

**2.3 Optional Conversion Metrics**
- If metrics data is available, display conversion rates on arrows
- Example: "75% →" between steps
- Color-coded based on performance (green/yellow/red)

### Flow Layout Options
- **Horizontal scroll**: Steps flow left-to-right with horizontal scrolling
- **Stacked vertical**: For mobile/narrow screens, stack vertically with downward arrows
- **Canvas view**: Zoomable/pannable canvas for complex funnels (future enhancement)

---

## Feature 3: Drag-and-Drop Reordering

### Implementation Approach

Leverage the existing `@dnd-kit` library (already installed) for smooth drag-and-drop:

**3.1 Update FunnelPreviewTab**
- Wrap step grid in `DndContext` and `SortableContext`
- Each step card becomes a `useSortable` draggable item
- Grip handle icon for drag affordance
- Visual feedback during drag (opacity, shadow)

**3.2 New Hook: useReorderFunnelSteps**
```typescript
export function useReorderFunnelSteps() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ clientId, orderedIds }: { 
      clientId: string; 
      orderedIds: string[] 
    }) => {
      // Batch update sort_order for all steps
      const updates = orderedIds.map((id, index) => 
        supabase
          .from('client_funnel_steps')
          .update({ sort_order: index })
          .eq('id', id)
      );
      await Promise.all(updates);
      return { clientId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-steps', result.clientId] });
      toast.success('Funnel order updated');
    },
  });
}
```

**3.3 Drag Event Handlers**
```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  
  const oldIndex = steps.findIndex(s => s.id === active.id);
  const newIndex = steps.findIndex(s => s.id === over.id);
  
  const newOrder = arrayMove(steps, oldIndex, newIndex);
  reorderSteps.mutate({
    clientId,
    orderedIds: newOrder.map(s => s.id)
  });
};
```

---

## Feature 4: Tab Placement Updates

### Client Detail Page (ClientDetail.tsx)

Reorder tabs so Funnel appears after Tasks:
```
Overview | Attribution & Records | Tasks | Funnel | Creatives | [Custom Tabs] | + Add Tab
```

### Agency Dashboard (Index.tsx)

Add Funnel tab to the agency-level tabs alongside Dashboard, Meetings, and Creatives:
```
Dashboard | Meetings | Creatives | Funnel
```

The agency-level Funnel view would show:
- Client selector dropdown
- Preview of selected client's funnel
- Or aggregate view showing all client funnels in a list

---

## Technical Summary

| Component | Changes/New |
|-----------|-------------|
| `src/components/funnel/FunnelPreviewTab.tsx` | Add device toggle, flow view, dnd-kit integration |
| `src/components/funnel/IPhoneMockup.tsx` | Minor refinements (already exists) |
| `src/components/funnel/TabletMockup.tsx` | **NEW** - iPad mockup frame |
| `src/components/funnel/DesktopMockup.tsx` | **NEW** - Browser window mockup |
| `src/components/funnel/FunnelFlowDiagram.tsx` | **NEW** - SVG flow visualization |
| `src/components/funnel/SortableFunnelStep.tsx` | **NEW** - dnd-kit sortable wrapper |
| `src/components/funnel/DeviceSwitcher.tsx` | **NEW** - Device type toggle UI |
| `src/hooks/useFunnelSteps.ts` | Add `useReorderFunnelSteps` mutation |
| `src/pages/ClientDetail.tsx` | Move Funnel tab after Tasks |
| `src/pages/Index.tsx` | Add agency-level Funnel tab |

---

## UI/UX Flow

### Preview Mode (Default)
1. User navigates to Funnel tab
2. Sees device switcher (iPhone/Tablet/Desktop)
3. Views funnel steps in selected device mockups
4. Grid layout with step numbers and names

### Flow Mode
1. User clicks "View Flow" toggle
2. Switches to horizontal flow diagram view
3. Steps shown as connected nodes with arrows
4. Compact thumbnails instead of full mockups

### Reordering
1. User hovers over step card, sees grip handle
2. Drags step to new position
3. Other steps animate to make room
4. Order saved automatically on drop

---

## Visual Design

### Device Mockup Dimensions

```text
iPhone 14 Pro       iPad Pro 11"        Desktop 1280px
┌─────────────┐    ┌──────────────────┐  ┌────────────────────────┐
│ ▢▢▢         │    │                  │  │ ⏺ ⏺ ⏺  example.com    │
│             │    │                  │  ├────────────────────────┤
│   280x580   │    │    400x580       │  │                        │
│   scaled    │    │    scaled        │  │       640x400          │
│             │    │                  │  │       scaled           │
│             │    │                  │  │                        │
│      ═      │    │       ═          │  │                        │
└─────────────┘    └──────────────────┘  └────────────────────────┘
```

### Flow Diagram Style

```text
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│ 1. Landing  │  ───→  │  2. Form    │  ───→  │ 3. Thanks   │
│ ┌─────────┐ │        │ ┌─────────┐ │        │ ┌─────────┐ │
│ │ [thumb] │ │        │ │ [thumb] │ │        │ │ [thumb] │ │
│ └─────────┘ │        │ └─────────┘ │        │ └─────────┘ │
│ Edit Delete │        │ Edit Delete │        │ Edit Delete │
└─────────────┘        └─────────────┘        └─────────────┘
```

---

## Dependencies

No new npm packages required:
- **@dnd-kit/core** - Already installed (v6.3.1)
- **@dnd-kit/sortable** - Already installed (v10.0.0)
- **lucide-react** - Already has Monitor, Tablet, Smartphone icons
- SVG arrows will be custom-built (no external library needed)

---

## Implementation Order

1. Create TabletMockup and DesktopMockup components
2. Create DeviceSwitcher toggle component
3. Update FunnelPreviewTab with device switching
4. Implement SortableFunnelStep with dnd-kit
5. Add useReorderFunnelSteps hook
6. Integrate drag-and-drop into FunnelPreviewTab
7. Create FunnelFlowDiagram component
8. Add flow/preview view toggle
9. Update tab ordering in ClientDetail.tsx
10. Add Funnel tab to agency dashboard Index.tsx
