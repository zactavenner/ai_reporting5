import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, Save, ExternalLink, Camera, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  useFunnelStages,
  useFunnelSnapshots,
  useInitDefaultStages,
  useUpdateFunnelStage,
  useCreateFunnelStage,
  useDeleteFunnelStage,
  useSaveFunnelSnapshot,
  FunnelStage,
} from '@/hooks/useFunnelVisualization';
import { format } from 'date-fns';

interface FunnelVisualizationProps {
  clientId: string;
  isPublicView?: boolean;
}

// Color gradient from blue to green
const STAGE_COLORS = [
  'hsl(220, 80%, 55%)', // blue
  'hsl(200, 70%, 50%)',
  'hsl(175, 65%, 45%)',
  'hsl(150, 60%, 42%)',
  'hsl(130, 55%, 40%)',
  'hsl(110, 50%, 38%)', // green
];

function getStageColor(index: number, total: number) {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  const colorIndex = Math.min(Math.floor(ratio * (STAGE_COLORS.length - 1)), STAGE_COLORS.length - 1);
  return STAGE_COLORS[colorIndex];
}

export function FunnelVisualization({ clientId, isPublicView = false }: FunnelVisualizationProps) {
  const { data: stages = [], isLoading } = useFunnelStages(clientId);
  const { data: snapshots = [] } = useFunnelSnapshots(clientId);
  const initDefaults = useInitDefaultStages();
  const updateStage = useUpdateFunnelStage();
  const createStage = useCreateFunnelStage();
  const deleteStage = useDeleteFunnelStage();
  const saveSnapshot = useSaveFunnelSnapshot();

  const [editOpen, setEditOpen] = useState(false);
  const [editingStages, setEditingStages] = useState<FunnelStage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageUrl, setNewStageUrl] = useState('');

  // Auto-create defaults if none exist
  useEffect(() => {
    if (!isLoading && stages.length === 0 && !initDefaults.isPending) {
      initDefaults.mutate(clientId);
    }
  }, [isLoading, stages.length, clientId]);

  const openEditModal = () => {
    setEditingStages([...stages]);
    setEditOpen(true);
  };

  const handleCountChange = (stageId: string, value: string) => {
    const count = parseInt(value) || 0;
    updateStage.mutate({
      id: stageId,
      clientId,
      updates: { conversion_count: count },
    });
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) return;
    createStage.mutate({
      client_id: clientId,
      stage_name: newStageName.trim(),
      stage_order: stages.length,
      stage_url: newStageUrl.trim() || undefined,
    });
    setNewStageName('');
    setNewStageUrl('');
  };

  const handleDeleteStage = (stageId: string) => {
    deleteStage.mutate({ id: stageId, clientId });
  };

  const handleSaveSnapshot = () => {
    saveSnapshot.mutate({ clientId, stages });
  };

  // Compute conversion rates
  const stagesWithRates = useMemo(() => {
    const topCount = stages[0]?.conversion_count || 0;
    return stages.map((s, i) => {
      const rateFromTop = topCount > 0 ? (s.conversion_count / topCount) * 100 : 0;
      const prevCount = i > 0 ? stages[i - 1].conversion_count : s.conversion_count;
      const stepRate = prevCount > 0 ? (s.conversion_count / prevCount) * 100 : 0;
      return { ...s, rateFromTop, stepRate };
    });
  }, [stages]);

  // Group snapshots by date
  const snapshotsByDate = useMemo(() => {
    const grouped: Record<string, typeof snapshots> = {};
    snapshots.forEach(snap => {
      if (!grouped[snap.snapshot_date]) grouped[snap.snapshot_date] = [];
      grouped[snap.snapshot_date].push(snap);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14);
  }, [snapshots]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Conversion Funnel</h2>
          <p className="text-sm text-muted-foreground">
            Track conversion rates through each stage of your funnel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveSnapshot} disabled={saveSnapshot.isPending}>
            <Camera className="h-4 w-4 mr-1" />
            Save Snapshot
          </Button>
          {!isPublicView && (
            <Button variant="outline" size="sm" onClick={openEditModal}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit Stages
            </Button>
          )}
        </div>
      </div>

      {/* Visual Funnel */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-1">
            {stagesWithRates.map((stage, index) => {
              const widthPercent = stages.length <= 1
                ? 100
                : 100 - (index / (stages.length - 1)) * 60; // from 100% to 40%
              const color = getStageColor(index, stages.length);

              return (
                <div
                  key={stage.id}
                  className="relative group transition-all duration-300"
                  style={{ width: `${widthPercent}%` }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 rounded-md text-white cursor-default transition-opacity hover:opacity-90"
                    style={{ backgroundColor: color }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm truncate">{stage.stage_name}</span>
                      {stage.stage_url && (
                        <a
                          href={stage.stage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/70 hover:text-white"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      {!isPublicView ? (
                        <Input
                          type="number"
                          min={0}
                          defaultValue={stage.conversion_count}
                          onBlur={e => handleCountChange(stage.id, e.target.value)}
                          className="w-20 h-7 text-xs bg-white/20 border-white/30 text-white placeholder:text-white/50 text-right"
                        />
                      ) : (
                        <span className="font-bold">{stage.conversion_count.toLocaleString()}</span>
                      )}
                      <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                        {stage.rateFromTop.toFixed(1)}%
                      </Badge>
                      {index > 0 && (
                        <span className="text-white/70 text-xs">
                          ↓ {stage.stepRate.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Snapshot History Table */}
      {snapshotsByDate.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {stages.map(s => (
                      <TableHead key={s.id} className="text-right">{s.stage_name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshotsByDate.map(([date, snaps]) => (
                    <TableRow key={date}>
                      <TableCell className="font-medium">
                        {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
                      </TableCell>
                      {stages.map(s => {
                        const snap = snaps.find(sn => sn.stage_id === s.id);
                        return (
                          <TableCell key={s.id} className="text-right">
                            {snap ? (
                              <div>
                                <span className="font-medium">{snap.count.toLocaleString()}</span>
                                {snap.conversion_rate != null && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({snap.conversion_rate}%)
                                  </span>
                                )}
                              </div>
                            ) : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Stages Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit Funnel Stages</DialogTitle>
            <DialogDescription>
              Add, remove, or reorder stages in your conversion funnel
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-2 p-2 border border-border rounded-md">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{stage.stage_name}</span>
                <Input
                  className="w-24 h-7 text-xs"
                  placeholder="URL"
                  defaultValue={stage.stage_url || ''}
                  onBlur={e => {
                    if (e.target.value !== (stage.stage_url || '')) {
                      updateStage.mutate({
                        id: stage.id,
                        clientId,
                        updates: { stage_url: e.target.value || null },
                      });
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => handleDeleteStage(stage.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {/* Add new stage */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Input
                placeholder="Stage name"
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="URL (optional)"
                value={newStageUrl}
                onChange={e => setNewStageUrl(e.target.value)}
                className="h-8 text-sm w-32"
              />
              <Button
                size="sm"
                onClick={handleAddStage}
                disabled={!newStageName.trim() || createStage.isPending}
                className="h-8"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
