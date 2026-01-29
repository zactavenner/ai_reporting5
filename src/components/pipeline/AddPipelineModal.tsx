import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAvailableGHLPipelines, useSyncPipeline } from '@/hooks/usePipelines';

interface AddPipelineModalProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPipelineIds: string[];
}

export function AddPipelineModal({ 
  clientId, 
  open, 
  onOpenChange, 
  existingPipelineIds 
}: AddPipelineModalProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  
  const { data: availablePipelines = [], isLoading, error } = useAvailableGHLPipelines(clientId);
  const syncPipeline = useSyncPipeline();

  // Filter out already connected pipelines
  const unconnectedPipelines = availablePipelines.filter(
    p => !existingPipelineIds.includes(p.id)
  );

  const handleAdd = async () => {
    if (!selectedPipelineId) return;
    
    await syncPipeline.mutateAsync({ clientId, pipelineId: selectedPipelineId });
    setSelectedPipelineId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Pipeline</DialogTitle>
          <DialogDescription>
            Select a GoHighLevel pipeline to track in this dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(error as any)?.message?.includes('401') || (error as any)?.message?.includes('expired')
                  ? 'GHL credentials are invalid or expired. Please update your Private Integration Key in Client Settings → Integrations tab.'
                  : 'Failed to load pipelines. Make sure GHL credentials are configured in Client Settings → Integrations.'}
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : unconnectedPipelines.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {availablePipelines.length === 0 
                ? 'No pipelines found in GoHighLevel'
                : 'All available pipelines are already connected'}
            </div>
          ) : (
            <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a pipeline" />
              </SelectTrigger>
              <SelectContent>
                {unconnectedPipelines.map(pipeline => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    <div className="flex flex-col">
                      <span>{pipeline.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {pipeline.stages?.length || 0} stages
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={!selectedPipelineId || syncPipeline.isPending}
          >
            {syncPipeline.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Pipeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
