import { useState } from 'react';
import { Plus, Trash2, ExternalLink, Edit2, Check, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { IPhoneMockup } from './IPhoneMockup';
import { useFunnelSteps, useCreateFunnelStep, useUpdateFunnelStep, useDeleteFunnelStep, FunnelStep } from '@/hooks/useFunnelSteps';

interface FunnelPreviewTabProps {
  clientId: string;
  isPublicView?: boolean;
}

export function FunnelPreviewTab({ clientId, isPublicView = false }: FunnelPreviewTabProps) {
  const { data: steps = [], isLoading } = useFunnelSteps(clientId);
  const createStep = useCreateFunnelStep();
  const updateStep = useUpdateFunnelStep();
  const deleteStep = useDeleteFunnelStep();
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepUrl, setNewStepUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const handleAddStep = async () => {
    if (!newStepName.trim() || !newStepUrl.trim()) return;
    
    let validUrl = newStepUrl;
    if (!newStepUrl.startsWith('http://') && !newStepUrl.startsWith('https://')) {
      validUrl = 'https://' + newStepUrl;
    }
    
    await createStep.mutateAsync({
      client_id: clientId,
      name: newStepName.trim(),
      url: validUrl,
      sort_order: steps.length,
    });
    
    setNewStepName('');
    setNewStepUrl('');
    setAddModalOpen(false);
  };

  const startEditing = (step: FunnelStep) => {
    setEditingId(step.id);
    setEditName(step.name);
    setEditUrl(step.url);
  };

  const saveEdit = async (step: FunnelStep) => {
    if (!editName.trim() || !editUrl.trim()) return;
    
    let validUrl = editUrl;
    if (!editUrl.startsWith('http://') && !editUrl.startsWith('https://')) {
      validUrl = 'https://' + editUrl;
    }
    
    await updateStep.mutateAsync({
      id: step.id,
      clientId,
      updates: { name: editName.trim(), url: validUrl },
    });
    
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditUrl('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading funnel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Funnel Preview</h2>
          <p className="text-sm text-muted-foreground">
            Preview your funnel pages in mobile view
          </p>
        </div>
        {!isPublicView && (
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Funnel Step
          </Button>
        )}
      </div>

      {/* Funnel Steps Grid */}
      {steps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No funnel steps added yet</p>
            {!isPublicView && (
              <Button variant="outline" onClick={() => setAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Funnel Step
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex flex-col">
              {/* Step Header */}
              <div className="flex items-center justify-between mb-3">
                {editingId === step.id ? (
                  <div className="flex-1 space-y-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Step name"
                      className="h-8"
                    />
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="URL"
                      className="h-8"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(step)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="font-medium">{step.name}</span>
                    </div>
                    {!isPublicView && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(step)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <a
                          href={step.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-accent rounded"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Funnel Step?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove "{step.name}" from the funnel. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteStep.mutate({ id: step.id, clientId })}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {/* iPhone Mockup */}
              <IPhoneMockup url={step.url} />
            </div>
          ))}
        </div>
      )}

      {/* Add Step Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Funnel Step</DialogTitle>
            <DialogDescription>
              Add a new page to your funnel preview. The page will be displayed in an iPhone mockup.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="step-name">Step Name</Label>
              <Input
                id="step-name"
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value)}
                placeholder="e.g., Landing Page, Form, Thank You"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="step-url">Page URL</Label>
              <Input
                id="step-url"
                value={newStepUrl}
                onChange={(e) => setNewStepUrl(e.target.value)}
                placeholder="https://example.com/landing-page"
              />
              <p className="text-xs text-muted-foreground">
                Make sure the URL allows embedding (some sites block iframes)
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddStep}
                disabled={!newStepName.trim() || !newStepUrl.trim() || createStep.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
