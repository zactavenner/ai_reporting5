import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ClientOffer } from '@/hooks/useClientOffers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sparkles, Loader2, CheckCircle2, XCircle, BarChart3, Target,
  Mail, MessageSquare, Megaphone, Video, Image, FileText, Globe
} from 'lucide-react';
import { toast } from 'sonner';

const ASSET_TYPES = [
  { key: 'research', label: 'Research', icon: BarChart3 },
  { key: 'angles', label: 'Marketing Angles', icon: Target },
  { key: 'adcopy', label: 'Ad Copy', icon: Megaphone },
  { key: 'emails', label: 'Email Sequences', icon: Mail },
  { key: 'sms', label: 'SMS Sequences', icon: MessageSquare },
  { key: 'scripts', label: 'Video Scripts', icon: Video },
  { key: 'creatives', label: 'Creative Concepts', icon: Image },
  { key: 'report', label: 'Special Report', icon: FileText },
  { key: 'funnel', label: 'Funnel Copy', icon: Globe },
] as const;

type AssetStatus = 'pending' | 'generating' | 'completed' | 'failed';

interface OfferAssetHubProps {
  offer: ClientOffer;
  clientId: string;
  clientName: string;
  brandColors?: string[] | null;
  brandFonts?: string[] | null;
  clientDescription?: string | null;
  offerDescription?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  clientType?: string | null;
}

export function OfferAssetHub({
  offer,
  clientId,
  clientName,
  brandColors,
  brandFonts,
  clientDescription,
  offerDescription,
  websiteUrl,
  industry,
  clientType,
}: OfferAssetHubProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AssetStatus>>({});
  const [existingAssets, setExistingAssets] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) loadExistingAssets();
  }, [open]);

  const loadExistingAssets = async () => {
    const { data } = await supabase
      .from('client_assets' as any)
      .select('*')
      .eq('client_id', clientId)
      .eq('offer_id', offer.id)
      .order('created_at', { ascending: false });

    const grouped: Record<string, any> = {};
    (data || []).forEach((a: any) => {
      if (!grouped[a.asset_type]) grouped[a.asset_type] = a;
    });
    setExistingAssets(grouped);
  };

  const generateAll = async () => {
    setGenerating(true);
    const initStatuses: Record<string, AssetStatus> = {};
    ASSET_TYPES.forEach(t => { initStatuses[t.key] = 'pending'; });
    setStatuses(initStatuses);

    let existing_research: any = null;
    let existing_angles: any = null;

    const { data: intakeData } = await supabase
      .from('client_intake' as any)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1);
    const intake = (intakeData as any)?.[0] || null;

    const clientData = {
      company_name: clientName,
      name: clientName,
      fund_type: intake?.fund_type || clientType || 'Business',
      raise_amount: intake?.raise_amount,
      min_investment: intake?.min_investment,
      timeline: intake?.timeline,
      target_investor: intake?.target_investor,
      website: websiteUrl,
      industry,
      offer_description: offer.description || offerDescription || clientDescription,
      brand_notes: intake?.brand_notes || clientDescription,
      additional_notes: offer.description || offerDescription,
      brand_colors: brandColors,
      brand_fonts: brandFonts,
    };

    for (const assetType of ASSET_TYPES) {
      setStatuses(prev => ({ ...prev, [assetType.key]: 'generating' }));

      try {
        const { data, error } = await supabase.functions.invoke('generate-asset', {
          body: {
            client_id: clientId,
            asset_type: assetType.key,
            client_data: clientData,
            existing_research,
            existing_angles,
            offer_id: offer.id,
          },
        });

        if (error) throw error;

        if (assetType.key === 'research' && data?.content) {
          existing_research = data.content;
        }
        if (assetType.key === 'angles' && data?.content) {
          existing_angles = data.content;
        }

        setStatuses(prev => ({ ...prev, [assetType.key]: 'completed' }));
      } catch (err: any) {
        console.error(`Failed to generate ${assetType.key}:`, err);
        setStatuses(prev => ({ ...prev, [assetType.key]: 'failed' }));
      }
    }

    setGenerating(false);
    await loadExistingAssets();

    const completed = Object.values(statuses).filter(s => s === 'completed').length;
    if (completed > 0) toast.success(`Generated ${completed} asset types for "${offer.title}"`);
  };

  const completedCount = Object.values(statuses).filter(s => s === 'completed').length;
  const totalCount = ASSET_TYPES.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const existingCount = Object.keys(existingAssets).length;

  const getStatusIcon = (status: AssetStatus) => {
    switch (status) {
      case 'generating': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3 w-3" />
        Generate All
        {existingCount > 0 && (
          <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
            {existingCount}/{totalCount}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Assets — {offer.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <Card className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Offer Context</p>
              <p className="text-sm font-medium">{offer.title}</p>
              {offer.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{offer.description}</p>
              )}
              {brandColors && brandColors.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs text-muted-foreground mr-1">Brand:</span>
                  {brandColors.map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded border border-border" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </Card>

            {generating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Generating {completedCount}/{totalCount} assets…</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {ASSET_TYPES.map((type) => {
                const Icon = type.icon;
                const status = statuses[type.key];
                const existing = existingAssets[type.key];
                return (
                  <div
                    key={type.key}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{type.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {existing && !status && (
                        <Badge variant="outline" className="text-[10px] text-emerald-600">
                          Generated
                        </Badge>
                      )}
                      {status && getStatusIcon(status)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                onClick={generateAll}
                disabled={generating}
                className="gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {existingCount > 0 ? 'Regenerate All' : 'Generate All Assets'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
