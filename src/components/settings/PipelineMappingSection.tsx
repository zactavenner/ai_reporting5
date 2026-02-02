import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, GitBranch, RefreshCw, AlertCircle, DollarSign, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useSyncPipeline } from '@/hooks/usePipelines';

interface GHLPipeline {
  id: string;
  name: string;
  stages?: GHLStage[];
}

interface GHLStage {
  id: string;
  name: string;
  position?: number;
}

interface PipelineMappingSectionProps {
  clientId: string;
  ghlApiKey?: string;
  ghlLocationId?: string;
  fundedPipelineId: string | null;
  fundedStageIds: string[];
  committedStageIds: string[];
  onPipelineChange: (pipelineId: string | null) => void;
  onFundedStagesChange: (ids: string[]) => void;
  onCommittedStagesChange: (ids: string[]) => void;
}

export function PipelineMappingSection({
  clientId,
  ghlApiKey,
  ghlLocationId,
  fundedPipelineId,
  fundedStageIds,
  committedStageIds,
  onPipelineChange,
  onFundedStagesChange,
  onCommittedStagesChange,
}: PipelineMappingSectionProps) {
  const [pipelines, setPipelines] = useState<GHLPipeline[]>([]);
  const [stages, setStages] = useState<GHLStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const syncPipeline = useSyncPipeline();

  const fetchPipelines = async () => {
    if (!ghlApiKey || !ghlLocationId) {
      setError('GHL credentials not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${ghlLocationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${ghlApiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch pipelines: ${response.status}`);
      }

      const data = await response.json();
      setPipelines(data.pipelines || []);
      
      // If a pipeline is already selected, load its stages
      if (fundedPipelineId) {
        const selectedPipeline = (data.pipelines || []).find((p: GHLPipeline) => p.id === fundedPipelineId);
        if (selectedPipeline?.stages) {
          setStages(selectedPipeline.stages);
        }
      }
    } catch (err) {
      console.error('Error fetching GHL pipelines:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pipelines');
      toast.error('Failed to load pipelines from GHL');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncClick = async () => {
    // First refresh pipeline list
    await fetchPipelines();
    
    // Then sync the selected pipeline to fetch committed/funded opportunities
    if (fundedPipelineId && clientId) {
      toast.info('Syncing pipeline opportunities...');
      syncPipeline.mutate({ clientId, pipelineId: fundedPipelineId });
    }
  };

  useEffect(() => {
    if (ghlApiKey && ghlLocationId) {
      fetchPipelines();
    }
  }, [ghlApiKey, ghlLocationId]);

  const handlePipelineSelect = (pipelineId: string) => {
    onPipelineChange(pipelineId === 'none' ? null : pipelineId);
    // Clear stage selections when pipeline changes
    onFundedStagesChange([]);
    onCommittedStagesChange([]);
    
    // Load stages for selected pipeline
    const selectedPipeline = pipelines.find(p => p.id === pipelineId);
    if (selectedPipeline?.stages) {
      setStages(selectedPipeline.stages);
    } else {
      setStages([]);
    }
  };

  const toggleFundedStage = (stageId: string) => {
    const newIds = fundedStageIds.includes(stageId)
      ? fundedStageIds.filter(id => id !== stageId)
      : [...fundedStageIds, stageId];
    onFundedStagesChange(newIds);
  };

  const toggleCommittedStage = (stageId: string) => {
    const newIds = committedStageIds.includes(stageId)
      ? committedStageIds.filter(id => id !== stageId)
      : [...committedStageIds, stageId];
    onCommittedStagesChange(newIds);
  };

  if (!ghlApiKey || !ghlLocationId) {
    return (
      <div className="border-2 border-border p-4 bg-muted/20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Configure GHL credentials to enable pipeline mapping</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium mb-1 flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Pipeline Stage Mapping
          </h4>
          <p className="text-sm text-muted-foreground">
            Map pipeline stages to track committed and funded investors
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSyncClick}
          disabled={loading || syncPipeline.isPending}
          title={fundedPipelineId ? "Refresh pipelines & sync opportunities" : "Refresh pipelines"}
        >
          {loading || syncPipeline.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 border-2 border-destructive/20 bg-destructive/5 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && pipelines.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">
          No pipelines found. Click refresh to try again.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pipeline Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Investment Pipeline</Label>
            <Select
              value={fundedPipelineId || 'none'}
              onValueChange={handlePipelineSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a pipeline..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No pipeline selected</SelectItem>
                {pipelines.map(pipeline => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage Mappings - only show if pipeline selected */}
          {fundedPipelineId && stages.length > 0 && (
            <>
              {/* Committed Stages */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Committed Stages
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Stages that indicate a commitment (before funding)
                </p>
                <div className="grid gap-2 max-h-32 overflow-y-auto">
                  {stages.map(stage => (
                    <div
                      key={`committed-${stage.id}`}
                      className="flex items-center gap-2 p-2 border border-border rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`committed-${stage.id}`}
                        checked={committedStageIds.includes(stage.id)}
                        onCheckedChange={() => toggleCommittedStage(stage.id)}
                      />
                      <label
                        htmlFor={`committed-${stage.id}`}
                        className="flex-1 text-sm cursor-pointer"
                      >
                        {stage.name}
                      </label>
                      {committedStageIds.includes(stage.id) && (
                        <Badge variant="secondary" className="text-xs">Committed</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Funded Stages */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Funded Stages
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Stages that indicate successful funding
                </p>
                <div className="grid gap-2 max-h-32 overflow-y-auto">
                  {stages.map(stage => (
                    <div
                      key={`funded-${stage.id}`}
                      className="flex items-center gap-2 p-2 border border-border rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`funded-${stage.id}`}
                        checked={fundedStageIds.includes(stage.id)}
                        onCheckedChange={() => toggleFundedStage(stage.id)}
                      />
                      <label
                        htmlFor={`funded-${stage.id}`}
                        className="flex-1 text-sm cursor-pointer"
                      >
                        {stage.name}
                      </label>
                      {fundedStageIds.includes(stage.id) && (
                        <Badge variant="default" className="text-xs">Funded</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {(committedStageIds.length > 0 || fundedStageIds.length > 0) && (
                <div className="p-3 bg-muted/30 border border-border text-sm">
                  <strong>Mapped:</strong> {committedStageIds.length} committed stage(s), {fundedStageIds.length} funded stage(s)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
