import { useState, useMemo } from 'react';
import { Plus, FolderPlus, FileText, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeviceSwitcher, DeviceType } from './DeviceSwitcher';
import { CampaignFlowSection } from './CampaignFlowSection';
import { FunnelVisualization } from './FunnelVisualization';
import { IPhoneMockup } from './IPhoneMockup';
import { TabletMockup } from './TabletMockup';
import { DesktopMockup } from './DesktopMockup';
import { useFunnelSteps, useCreateFunnelStep, useUpdateFunnelStep, useDeleteFunnelStep, useReorderFunnelSteps, FunnelStep } from '@/hooks/useFunnelSteps';
import { useFunnelCampaigns, useCreateFunnelCampaign, useUpdateFunnelCampaign, useDeleteFunnelCampaign, FunnelCampaign } from '@/hooks/useFunnelCampaigns';

interface FunnelPreviewTabProps {
  clientId: string;
  isPublicView?: boolean;
}

const CAMPAIGN_COLORS = [
  { label: 'Light Gray', value: '#f3f4f6' },
  { label: 'White', value: '#ffffff' },
  { label: 'Light Blue', value: '#eff6ff' },
  { label: 'Light Green', value: '#f0fdf4' },
  { label: 'Light Purple', value: '#faf5ff' },
  { label: 'Light Yellow', value: '#fefce8' },
];

export function FunnelPreviewTab({ clientId, isPublicView = false }: FunnelPreviewTabProps) {
  const { data: campaigns = [], isLoading: campaignsLoading } = useFunnelCampaigns(clientId);
  const { data: steps = [], isLoading: stepsLoading } = useFunnelSteps(clientId);
  const createCampaign = useCreateFunnelCampaign();
  const updateCampaign = useUpdateFunnelCampaign();
  const deleteCampaign = useDeleteFunnelCampaign();
  const createStep = useCreateFunnelStep();
  const updateStep = useUpdateFunnelStep();
  const deleteStep = useDeleteFunnelStep();
  const reorderSteps = useReorderFunnelSteps();
  
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignColor, setNewCampaignColor] = useState('#f3f4f6');
  
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addStepCampaignId, setAddStepCampaignId] = useState<string | null>(null);
  const [newStepName, setNewStepName] = useState('');
  const [newStepUrl, setNewStepUrl] = useState('');
  const [newStepType, setNewStepType] = useState<'url' | 'fb_lead_form'>('url');
  
  const [editStepOpen, setEditStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<FunnelStep | null>(null);
  const [editStepName, setEditStepName] = useState('');
  const [editStepUrl, setEditStepUrl] = useState('');
  
  const [deviceType, setDeviceType] = useState<DeviceType>('phone');
  const [previewStep, setPreviewStep] = useState<FunnelStep | null>(null);

  // Group steps by campaign
  const stepsByCampaign = useMemo(() => {
    return campaigns.map(campaign => ({
      campaign,
      steps: steps.filter(s => s.campaign_id === campaign.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    }));
  }, [campaigns, steps]);

  // Steps without a campaign (legacy or uncategorized)
  const uncategorizedSteps = useMemo(() => {
    return steps.filter(s => !s.campaign_id).sort((a, b) => a.sort_order - b.sort_order);
  }, [steps]);

  const handleAddCampaign = async () => {
    if (!newCampaignName.trim()) return;
    
    await createCampaign.mutateAsync({
      client_id: clientId,
      name: newCampaignName.trim(),
      color: newCampaignColor,
      sort_order: campaigns.length,
    });
    
    setNewCampaignName('');
    setNewCampaignColor('#f3f4f6');
    setAddCampaignOpen(false);
  };

  const handleAddStep = async () => {
    if (!newStepName.trim() || !addStepCampaignId) return;
    if (newStepType === 'url' && !newStepUrl.trim()) return;
    
    let validUrl = newStepType === 'fb_lead_form' ? 'fb://lead-form' : newStepUrl;
    if (newStepType === 'url' && !newStepUrl.startsWith('http://') && !newStepUrl.startsWith('https://')) {
      validUrl = 'https://' + newStepUrl;
    }
    
    const campaignSteps = steps.filter(s => s.campaign_id === addStepCampaignId);
    
    await createStep.mutateAsync({
      client_id: clientId,
      campaign_id: addStepCampaignId,
      name: newStepName.trim(),
      url: validUrl,
      sort_order: campaignSteps.length,
    });
    
    setNewStepName('');
    setNewStepUrl('');
    setNewStepType('url');
    setAddStepOpen(false);
    setAddStepCampaignId(null);
  };

  const openAddStep = (campaignId: string) => {
    setAddStepCampaignId(campaignId);
    setAddStepOpen(true);
  };

  const openEditStep = (step: FunnelStep) => {
    setEditingStep(step);
    setEditStepName(step.name);
    setEditStepUrl(step.url);
    setEditStepOpen(true);
  };

  const handleEditStep = async () => {
    if (!editingStep || !editStepName.trim() || !editStepUrl.trim()) return;
    
    let validUrl = editStepUrl;
    if (!editStepUrl.startsWith('http://') && !editStepUrl.startsWith('https://')) {
      validUrl = 'https://' + editStepUrl;
    }
    
    await updateStep.mutateAsync({
      id: editingStep.id,
      clientId,
      updates: { name: editStepName.trim(), url: validUrl },
    });
    
    setEditStepOpen(false);
    setEditingStep(null);
  };

  const handleDeleteStep = (stepId: string) => {
    deleteStep.mutate({ id: stepId, clientId });
  };

  const handleReorderSteps = (orderedIds: string[]) => {
    reorderSteps.mutate({ clientId, orderedIds });
  };

  const handleEditCampaign = (campaign: FunnelCampaign) => {
    updateCampaign.mutate({
      id: campaign.id,
      clientId,
      updates: { name: campaign.name, color: campaign.color },
    });
  };

  const handleDeleteCampaign = (campaignId: string) => {
    deleteCampaign.mutate({ id: campaignId, clientId });
  };

  const isLoading = campaignsLoading || stepsLoading;

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Funnel Preview</h2>
          <p className="text-sm text-muted-foreground">
            Organize your funnels into campaigns and preview across devices
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DeviceSwitcher value={deviceType} onChange={setDeviceType} />
          {!isPublicView && (
            <Button onClick={() => setAddCampaignOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              Add Campaign
            </Button>
          )}
        </div>
      </div>

      {/* Conversion Funnel Visualization */}
      <FunnelVisualization clientId={clientId} isPublicView={isPublicView} />

      {/* Campaign Sections */}
      {campaigns.length === 0 && uncategorizedSteps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderPlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No campaigns created yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a campaign to organize your funnel steps
            </p>
            {!isPublicView && (
              <Button variant="outline" onClick={() => setAddCampaignOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Create Your First Campaign
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {stepsByCampaign.map(({ campaign, steps: campaignSteps }) => (
            <CampaignFlowSection
              key={campaign.id}
              campaign={campaign}
              steps={campaignSteps}
              deviceType={deviceType}
              isPublicView={isPublicView}
              onAddStep={openAddStep}
              onEditStep={openEditStep}
              onDeleteStep={handleDeleteStep}
              onReorderSteps={handleReorderSteps}
              onEditCampaign={handleEditCampaign}
              onDeleteCampaign={handleDeleteCampaign}
            />
            ))}
        </div>
      )}

      {/* Full Preview Modal */}
      <Dialog open={!!previewStep} onOpenChange={() => setPreviewStep(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewStep?.name}</DialogTitle>
          </DialogHeader>
          {previewStep && (
            <div className="flex justify-center py-4">
              {deviceType === 'phone' && <IPhoneMockup url={previewStep.url} />}
              {deviceType === 'tablet' && <TabletMockup url={previewStep.url} />}
              {deviceType === 'desktop' && <DesktopMockup url={previewStep.url} />}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Campaign Modal */}
      <Dialog open={addCampaignOpen} onOpenChange={setAddCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Create a new campaign to organize your funnel steps
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="e.g., 1031 Exchange, RV Park Fund"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Background Color</Label>
              <div className="flex flex-wrap gap-2">
                {CAMPAIGN_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setNewCampaignColor(color.value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newCampaignColor === color.value 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-border hover:border-muted-foreground'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddCampaignOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddCampaign}
                disabled={!newCampaignName.trim() || createCampaign.isPending}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Step Modal */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Funnel Step</DialogTitle>
            <DialogDescription>
              Add a new page or form to this campaign
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            {/* Step Type Selector */}
            <div className="space-y-2">
              <Label>Step Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewStepType('url')}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm",
                    newStepType === 'url' 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <Globe className="h-5 w-5" />
                  <span className="font-medium">Web Page</span>
                  <span className="text-[10px] text-muted-foreground">Landing page URL</span>
                </button>
                <button
                  onClick={() => setNewStepType('fb_lead_form')}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm",
                    newStepType === 'fb_lead_form' 
                      ? "border-[#1877F2] bg-[#1877F2]/5" 
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <FileText className="h-5 w-5 text-[#1877F2]" />
                  <span className="font-medium">FB Lead Form</span>
                  <span className="text-[10px] text-muted-foreground">Native form preview</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="step-name">Step Name</Label>
              <Input
                id="step-name"
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value)}
                placeholder={newStepType === 'fb_lead_form' ? "e.g., Lead Qualification Form" : "e.g., Landing Page, Book A Call, Thank You"}
              />
            </div>
            
            {newStepType === 'url' && (
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
            )}

            {newStepType === 'fb_lead_form' && (
              <div className="rounded-lg bg-[#1877F2]/5 border border-[#1877F2]/20 p-3">
                <p className="text-xs text-muted-foreground">
                  This will add a native Facebook Lead Form mockup to your funnel flow, showing accredited investor qualification, liquidity range, and contact fields.
                </p>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddStepOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddStep}
                disabled={!newStepName.trim() || (newStepType === 'url' && !newStepUrl.trim()) || createStep.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Step Modal */}
      <Dialog open={editStepOpen} onOpenChange={setEditStepOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Funnel Step</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-step-name">Step Name</Label>
              <Input
                id="edit-step-name"
                value={editStepName}
                onChange={(e) => setEditStepName(e.target.value)}
                placeholder="Step name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-step-url">Page URL</Label>
              <Input
                id="edit-step-url"
                value={editStepUrl}
                onChange={(e) => setEditStepUrl(e.target.value)}
                placeholder="https://example.com/page"
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditStepOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditStep}
                disabled={!editStepName.trim() || !editStepUrl.trim() || updateStep.isPending}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
