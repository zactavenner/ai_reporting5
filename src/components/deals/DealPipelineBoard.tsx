import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, Filter, DollarSign, BarChart3, Hash, TrendingUp } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Deal, DEAL_STAGES, DealStage, useAllDeals, useUpdateDeal, useCreateDealActivity } from '@/hooks/useDeals';
import { useClients } from '@/hooks/useClients';
import { DealCard } from './DealCard';
import { DealDetailPanel } from './DealDetailPanel';
import { CreateDealModal } from './CreateDealModal';

export function DealPipelineBoard() {
  const { data: deals = [], isLoading } = useAllDeals();
  const { data: clients = [] } = useClients();
  const updateDeal = useUpdateDeal();
  const createActivity = useCreateDealActivity();

  const [search, setSearch] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      if (filterClientId !== 'all' && d.client_id !== filterClientId) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          d.deal_name.toLowerCase().includes(s) ||
          (d.contact_name || '').toLowerCase().includes(s) ||
          (d.assigned_to || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [deals, filterClientId, search]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    DEAL_STAGES.forEach(s => { grouped[s] = []; });
    filteredDeals.forEach(d => {
      if (grouped[d.stage]) grouped[d.stage].push(d);
    });
    return grouped;
  }, [filteredDeals]);

  // Summary metrics
  const summary = useMemo(() => {
    const openDeals = filteredDeals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
    const totalPipeline = openDeals.reduce((s, d) => s + d.deal_value, 0);
    const weightedPipeline = openDeals.reduce((s, d) => s + d.deal_value * (d.probability / 100), 0);
    const avgDealSize = openDeals.length > 0 ? totalPipeline / openDeals.length : 0;
    return {
      totalPipeline,
      weightedPipeline,
      dealsCount: filteredDeals.length,
      avgDealSize,
    };
  }, [filteredDeals]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    // Determine target stage from over.id (could be a stage column id or another deal)
    let targetStage: string | null = null;

    // If dropped on a stage column container
    if (DEAL_STAGES.includes(over.id as DealStage)) {
      targetStage = over.id as string;
    } else {
      // Dropped on another deal - find that deal's stage
      const targetDeal = deals.find(d => d.id === over.id);
      if (targetDeal) targetStage = targetDeal.stage;
    }

    if (targetStage && targetStage !== deal.stage) {
      const oldStage = deal.stage;
      updateDeal.mutate({ id: dealId, updates: { stage: targetStage as DealStage } });
      createActivity.mutate({
        deal_id: dealId,
        activity_type: 'stage_change',
        description: `Stage changed from "${oldStage}" to "${targetStage}"`,
      });
    }
  }, [deals, updateDeal, createActivity]);

  const draggedDeal = activeDragId ? deals.find(d => d.id === activeDragId) : null;

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading deals...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Pipeline</p>
              <p className="font-bold text-sm">${summary.totalPipeline.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Weighted Pipeline</p>
              <p className="font-bold text-sm">${Math.round(summary.weightedPipeline).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Deals Count</p>
              <p className="font-bold text-sm">{summary.dealsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Avg Deal Size</p>
              <p className="font-bold text-sm">${Math.round(summary.avgDealSize).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Deal
        </Button>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterClientId} onValueChange={setFilterClientId}>
          <SelectTrigger className="w-[180px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-4" style={{ minWidth: DEAL_STAGES.length * 230 }}>
            {DEAL_STAGES.map(stage => {
              const stageDeals = dealsByStage[stage] || [];
              const stageValue = stageDeals.reduce((s, d) => s + d.deal_value, 0);
              const isClosedStage = stage === 'Closed Won' || stage === 'Closed Lost';

              return (
                <div
                  key={stage}
                  className="flex-1 min-w-[210px]"
                >
                  <SortableContext
                    id={stage}
                    items={stageDeals.map(d => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="rounded-lg border border-border bg-muted/30 flex flex-col h-full">
                      {/* Column Header */}
                      <div className="p-2.5 border-b border-border">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold truncate">{stage}</h3>
                          <Badge variant="secondary" className="text-[10px]">{stageDeals.length}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          ${stageValue.toLocaleString()}
                        </p>
                      </div>

                      {/* Cards */}
                      <div className="p-1.5 space-y-1.5 min-h-[100px] flex-1">
                        {stageDeals.map(deal => (
                          <DealCard
                            key={deal.id}
                            deal={deal}
                            onClick={setSelectedDeal}
                            clientName={clientMap[deal.client_id]}
                          />
                        ))}
                      </div>
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DragOverlay>
          {draggedDeal && (
            <Card className="p-3 shadow-lg border-2 border-primary w-[200px]">
              <p className="font-semibold text-sm truncate">{draggedDeal.deal_name}</p>
              <p className="text-xs text-primary font-bold">${draggedDeal.deal_value.toLocaleString()}</p>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {/* Detail Panel */}
      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          clientName={clientMap[selectedDeal.client_id]}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* Create Modal */}
      <CreateDealModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients}
      />
    </div>
  );
}
