import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGenerateBrief, CreativeBrief } from '@/hooks/useCreativeBriefs';
import { BriefDetailDialog } from './BriefDetailDialog';

interface GenerateBriefButtonProps {
  clientId: string;
  clientName: string;
  getTopAds: () => any[];
}

export function GenerateBriefButton({ clientId, clientName, getTopAds }: GenerateBriefButtonProps) {
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const generateBrief = useGenerateBrief();

  const handleGenerate = async () => {
    const topAds = getTopAds();
    if (!topAds.length) return;

    const result = await generateBrief.mutateAsync({
      client_id: clientId,
      client_name: clientName,
      top_ads: topAds.map((ad: any) => ({
        ad_name: ad.name || 'Untitled',
        spend: Number(ad.spend) || 0,
        impressions: Number(ad.impressions) || 0,
        clicks: Number(ad.clicks) || 0,
        ctr: Number(ad.ctr) || 0,
        cpc: Number(ad.cpc) || 0,
        conversions: Number(ad.attributed_funded) || 0,
        roas: Number(ad.spend) > 0 ? (Number(ad.attributed_funded_dollars) || 0) / Number(ad.spend) : 0,
        hook_text: ad.hook_text || ad.name || '',
        body_text: ad.body_text || '',
        cta_text: ad.cta_text || '',
        format: ad.format || 'static',
      })),
    });

    setGeneratedBrief(result);
    setDialogOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={generateBrief.isPending}
      >
        {generateBrief.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Analyzing top performers...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Brief
          </>
        )}
      </Button>

      <BriefDetailDialog
        brief={generatedBrief}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        showSaveToast
      />
    </>
  );
}
