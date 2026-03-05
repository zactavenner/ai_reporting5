import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, ChevronRight, GripVertical } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { FunnelStepCard } from './FunnelStepCard';
import { useAllStepVariants, type FunnelStepVariant } from '@/hooks/useFunnelStepVariants';
import type { FunnelCampaign } from '@/hooks/useFunnelCampaigns';
import type { FunnelStep } from '@/hooks/useFunnelSteps';
import type { DeviceType } from './DeviceSwitcher';

interface CampaignFlowSectionProps {
  campaign: FunnelCampaign;
  steps: FunnelStep[];
  deviceType: DeviceType;
  isPublicView: boolean;
  onAddStep: (campaignId: string) => void;
  onEditStep: (step: FunnelStep) => void;
  onDeleteStep: (stepId: string) => void;
  onReorderSteps: (orderedIds: string[]) => void;
  onEditCampaign: (campaign: FunnelCampaign) => void;
  onDeleteCampaign: (campaignId: string) => void;
}

interface SortableStepProps {
  step: FunnelStep;
  index: number;
  deviceType: DeviceType;
  isPublicView: boolean;
  isLast: boolean;
  variants: FunnelStepVariant[];
  onEdit: () => void;
  onDelete: () => void;
}

function SortableStep({ step, index, deviceType, isPublicView, isLast, variants, onEdit, onDelete }: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start">
      <div className="relative">
        {!isPublicView && (
          <button
            {...attributes}
            {...listeners}
            className="absolute -left-6 top-8 cursor-grab hover:bg-accent rounded p-1 touch-none z-10"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <FunnelStepCard
          step={step}
          stepNumber={index + 1}
          deviceType={deviceType}
          isPublicView={isPublicView}
          variants={variants}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      {!isLast && (
        <div className="flex-shrink-0 self-stretch flex items-start">
          <ChevronRight className="mx-3 mt-[200px] h-6 w-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function CampaignFlowSection({
  campaign,
  steps,
  deviceType,
  isPublicView,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onReorderSteps,
  onEditCampaign,
  onDeleteCampaign,
}: CampaignFlowSectionProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(campaign.name);

  // Fetch all variants for steps in this campaign
  const stepIds = useMemo(() => steps.map(s => s.id), [steps]);
  const { data: allVariants = [] } = useAllStepVariants(stepIds);
  
  // Group variants by step ID
  const variantsByStep = useMemo(() => {
    const map: Record<string, FunnelStepVariant[]> = {};
    allVariants.forEach(v => {
      if (!map[v.step_id]) map[v.step_id] = [];
      map[v.step_id].push(v);
    });
    return map;
  }, [allVariants]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over.id);
    
    const newOrder = arrayMove(steps, oldIndex, newIndex);
    onReorderSteps(newOrder.map(s => s.id));
  };

  const handleSaveName = () => {
    if (editName.trim() && editName !== campaign.name) {
      onEditCampaign({ ...campaign, name: editName.trim() });
    }
    setIsEditingName(false);
  };

  return (
    <div 
      className="rounded-xl p-6 border"
      style={{ backgroundColor: campaign.color }}
    >
      {/* Campaign Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 w-64"
                autoFocus
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
            </div>
          ) : (
            <h3 className="text-xl font-bold">{campaign.name}</h3>
          )}
          {!isPublicView && !isEditingName && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingName(true)}
              className="h-7 w-7 p-0"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {!isPublicView && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onAddStep(campaign.id)}>
              <Plus className="h-4 w-4 mr-1" /> Add Step
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete "{campaign.name}" and all its steps. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDeleteCampaign(campaign.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      
      {/* Flow Diagram with Steps */}
      {steps.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <p>No steps in this campaign yet. Click "Add Step" to get started.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={steps.map(s => s.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex items-start gap-2 overflow-x-auto pb-4 pl-6">
              {steps.map((step, index) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={index}
                  deviceType={deviceType}
                  isPublicView={isPublicView}
                  isLast={index === steps.length - 1}
                  variants={variantsByStep[step.id] || []}
                  onEdit={() => onEditStep(step)}
                  onDelete={() => onDeleteStep(step.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
