import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import type { CreativeBrief } from '@/hooks/useCreativeBriefs';

interface BriefDetailDialogProps {
  brief: CreativeBrief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showSaveToast?: boolean;
}

export function BriefDetailDialog({ brief, open, onOpenChange, showSaveToast }: BriefDetailDialogProps) {
  if (!brief) return null;

  const fullBrief = brief.full_brief_json || {};
  const variations = brief.recommended_variations || fullBrief.recommended_variations || [];
  const hookPatterns = brief.hook_patterns || fullBrief.hook_patterns || [];
  const offerAngles = brief.offer_angles || fullBrief.offer_angles || [];
  const summary = fullBrief.brief_summary || '';

  const handleSaveClose = () => {
    if (showSaveToast) {
      toast.success('Brief saved — ready for creative production');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="text-lg font-bold">
          Creative Brief — {brief.client_name}
        </DialogTitle>

        <div className="space-y-5">
          {/* Summary */}
          {summary && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Hook Patterns */}
          {hookPatterns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Hook Patterns</h3>
              <div className="flex flex-wrap gap-2">
                {hookPatterns.map((hook: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {hook}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Offer Angles */}
          {offerAngles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Offer Angles</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {offerAngles.map((angle: string, i: number) => (
                  <li key={i}>{angle}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Variations */}
          {variations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Recommended Variations</h3>
              <Accordion type="multiple" className="w-full">
                {variations.map((v: any, i: number) => (
                  <AccordionItem key={i} value={`var-${i}`}>
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2">
                        {v.variation_name}
                        <Badge variant="outline" className="text-[10px]">{v.format}</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Concept:</span> {v.concept}</div>
                        <div><span className="font-medium">Hook Draft:</span> {v.hook_draft}</div>
                        <div><span className="font-medium">Body Direction:</span> {v.body_direction}</div>
                        <div><span className="font-medium">CTA:</span> {v.cta_suggestion}</div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSaveClose}>
            {showSaveToast ? 'Save & Close' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
