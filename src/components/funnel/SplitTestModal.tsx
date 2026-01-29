import { useState, useEffect } from 'react';
import { Plus, Trash2, TestTube2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  useFunnelStepVariants,
  useCreateFunnelStepVariant,
  useUpdateFunnelStepVariant,
  useDeleteFunnelStepVariant,
  type FunnelStepVariant,
} from '@/hooks/useFunnelStepVariants';
import type { FunnelStep } from '@/hooks/useFunnelSteps';

interface SplitTestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: FunnelStep | null;
  isPublicView: boolean;
}

const VARIANT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function SplitTestModal({ open, onOpenChange, step, isPublicView }: SplitTestModalProps) {
  const { data: variants = [], isLoading } = useFunnelStepVariants(step?.id);
  const createVariant = useCreateFunnelStepVariant();
  const updateVariant = useUpdateFunnelStepVariant();
  const deleteVariant = useDeleteFunnelStepVariant();
  
  const [newVariantUrl, setNewVariantUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setNewVariantUrl('');
      setEditingId(null);
      setEditUrl('');
    }
  }, [open]);

  if (!step) return null;

  const getNextVariantLetter = () => {
    // Main step URL counts as variant A
    const usedCount = variants.length + 1; // +1 for main URL
    return VARIANT_LETTERS[usedCount] || `Variant ${usedCount + 1}`;
  };

  const handleAddVariant = async () => {
    if (!newVariantUrl.trim()) return;
    
    let validUrl = newVariantUrl;
    if (!newVariantUrl.startsWith('http://') && !newVariantUrl.startsWith('https://')) {
      validUrl = 'https://' + newVariantUrl;
    }
    
    const nextLetter = getNextVariantLetter();
    
    await createVariant.mutateAsync({
      step_id: step.id,
      name: `Variant ${nextLetter}`,
      url: validUrl,
      sort_order: variants.length,
    });
    
    setNewVariantUrl('');
  };

  const handleUpdateVariant = async (variant: FunnelStepVariant) => {
    if (!editUrl.trim()) return;
    
    let validUrl = editUrl;
    if (!editUrl.startsWith('http://') && !editUrl.startsWith('https://')) {
      validUrl = 'https://' + editUrl;
    }
    
    await updateVariant.mutateAsync({
      id: variant.id,
      stepId: step.id,
      updates: { url: validUrl },
    });
    
    setEditingId(null);
    setEditUrl('');
  };

  const handleDeleteVariant = async (variantId: string) => {
    await deleteVariant.mutateAsync({
      id: variantId,
      stepId: step.id,
    });
  };

  const startEdit = (variant: FunnelStepVariant) => {
    setEditingId(variant.id);
    setEditUrl(variant.url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            Split Test - {step.name}
          </DialogTitle>
          <DialogDescription>
            Add multiple page variants for A/B testing. Each variant will display side-by-side.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {/* Main URL (Variant A) */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-primary">Variant A (Original)</Badge>
              </div>
              <a
                href={step.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-sm text-muted-foreground truncate">{step.url}</p>
          </div>
          
          {/* Existing Variants */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading variants...</p>
          ) : (
            variants.map((variant, index) => (
              <div key={variant.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary">Variant {VARIANT_LETTERS[index + 1] || index + 2}</Badge>
                  <div className="flex items-center gap-2">
                    <a
                      href={variant.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    {!isPublicView && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDeleteVariant(variant.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {editingId === variant.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://example.com/variant"
                      className="flex-1"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleUpdateVariant(variant)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p 
                    className="text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground"
                    onClick={() => !isPublicView && startEdit(variant)}
                  >
                    {variant.url}
                  </p>
                )}
              </div>
            ))
          )}
          
          {/* Add New Variant */}
          {!isPublicView && variants.length < 7 && (
            <div className="border-2 border-dashed rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">Add Variant {getNextVariantLetter()}</Badge>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newVariantUrl}
                  onChange={(e) => setNewVariantUrl(e.target.value)}
                  placeholder="https://example.com/variant-b"
                  className="flex-1"
                />
                <Button 
                  onClick={handleAddVariant}
                  disabled={!newVariantUrl.trim() || createVariant.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Enter a different URL for this split test variant
              </p>
            </div>
          )}
          
          {variants.length >= 7 && (
            <p className="text-sm text-muted-foreground text-center">
              Maximum 8 variants (A-H) reached
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
