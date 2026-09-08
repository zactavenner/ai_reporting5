import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Check, ImageIcon, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders } from '@/lib/dashboardAuthHeaders';
import { toast } from 'sonner';
import type { BackgroundStyle, VisualQuality } from '@/types/batch-video';

interface FirstFrameDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scriptContent?: string;
  avatarImageUrl?: string;
  avatarDescription?: string;
  backgroundStyle?: BackgroundStyle;
  visualQuality?: VisualQuality;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  clientId?: string;
  projectId?: string;
  offerDescription?: string;
  selectedUrl?: string;
  onSelect: (url: string) => void;
}

const BG_TEXT: Record<string, string> = {
  'animated-gradient': 'soft animated gradient backdrop',
  'office-studio': 'modern office studio setting',
  outdoor: 'natural outdoor setting with soft daylight',
  'abstract-motion': 'abstract motion-blurred backdrop',
  'brand-colors': 'backdrop built from the brand colours',
};

/** Seed prompt from script + avatar + chosen style — editable before generating. */
export function buildFirstFramePrompt(opts: {
  scriptContent?: string;
  avatarDescription?: string;
  hasAvatar: boolean;
  backgroundStyle?: BackgroundStyle;
  visualQuality?: VisualQuality;
  offerDescription?: string;
}): string {
  const hook = (opts.scriptContent || '')
    .split(/\n+/)
    .map(l => l.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  const bg = BG_TEXT[opts.backgroundStyle || 'animated-gradient'];
  const quality = opts.visualQuality === 'hyper-realistic'
    ? 'Hyper-realistic, cinematic lighting, shallow depth of field, 8k detail.'
    : 'Clean, photorealistic, well-lit.';

  const subject = opts.hasAvatar
    ? `Feature the EXACT presenter from the reference image — match face, skin tone, hair and outfit precisely. Mid-shot, direct eye contact with the camera, natural expression as they begin speaking.`
    : `Create a brand-new, believable presenter${opts.avatarDescription ? ` (${opts.avatarDescription})` : ''}. Mid-shot, direct eye contact with the camera, natural expression as they begin speaking.`;

  return [
    `Opening frame of a short-form video ad.`,
    subject,
    `Setting: ${bg}.`,
    hook ? `The moment matches this opening line: "${hook}".` : '',
    opts.offerDescription ? `Context: ${opts.offerDescription}.` : '',
    quality,
    `No on-image text, no logos, no watermarks.`,
  ].filter(Boolean).join(' ');
}

export function FirstFrameDialog({
  open, onOpenChange, scriptContent, avatarImageUrl, avatarDescription,
  backgroundStyle, visualQuality, aspectRatio, clientId, projectId,
  offerDescription, selectedUrl, onSelect,
}: FirstFrameDialogProps) {
  const hasAvatar = !!avatarImageUrl;
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | undefined>(selectedUrl);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(selectedUrl);
    setPrompt(p => p.trim() ? p : buildFirstFramePrompt({
      scriptContent, avatarDescription, hasAvatar, backgroundStyle, visualQuality, offerDescription,
    }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reseed = () => {
    setPrompt(buildFirstFramePrompt({
      scriptContent, avatarDescription, hasAvatar, backgroundStyle, visualQuality, offerDescription,
    }));
    toast.success('Prompt rebuilt from the script and style');
  };

  const generate = async () => {
    if (!prompt.trim()) { toast.error('Add a prompt first'); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-static-ad', {
        headers: dashboardAuthHeaders(),
        body: {
          prompt: prompt.trim(),
          aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
          projectId: projectId || 'batch-video',
          clientId: clientId || 'default',
          productDescription: offerDescription,
          characterImageUrl: avatarImageUrl,
          referenceImages: avatarImageUrl ? [avatarImageUrl] : [],
        },
      });
      if (error) throw error;
      const url: string | undefined = data?.imageUrl;
      if (!url) throw new Error('no image');
      setImages(prev => [url, ...prev]);
      setChosen(url);
    } catch {
      toast.error('Could not create that opening frame — try adjusting the prompt');
    } finally {
      setGenerating(false);
    }
  };

  const confirm = () => {
    if (!chosen) { toast.error('Pick an image first'); return; }
    onSelect(chosen);
    onOpenChange(false);
    toast.success('Opening frame set');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Opening frame
            <Badge variant="outline" className="text-[10px]">
              {hasAvatar ? 'Matching your avatar' : 'New presenter from prompt'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Build the very first image of the video from the script, the chosen presenter and the style. Generate as many
            options as you like, then pick the one to open the video with.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Image prompt</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={reseed}>
              <RefreshCw className="h-3 w-3" /> Rebuild from script
            </Button>
          </div>
          <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} className="text-sm" />

          <Button onClick={generate} disabled={generating} className="gap-2 w-full">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              : <><Sparkles className="h-4 w-4" /> {images.length ? 'Generate another option' : 'Generate opening frame'}</>}
          </Button>

          {images.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">{images.length} option{images.length === 1 ? '' : 's'} — click to choose</Label>
              <ScrollArea className="max-h-[320px]">
                <div className="grid grid-cols-3 gap-2 pr-2">
                  {images.map(url => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setChosen(url)}
                      className={cn('relative rounded-lg overflow-hidden border-2 transition-all',
                        chosen === url ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-muted-foreground/50')}
                    >
                      <img src={url} alt="Opening frame option" className="w-full aspect-video object-cover" />
                      {chosen === url && (
                        <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary grid place-items-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={!chosen} className="gap-2">
            <Check className="h-4 w-4" /> Use as first frame
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
