import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, User, Film, Check, Sparkles, Image as ImageIcon } from 'lucide-react';
import { FirstFrameDialog } from '../FirstFrameDialog';
import { useAllAvatars } from '@/hooks/useAvatars';
import { cn } from '@/lib/utils';
import type { VoiceTone, BackgroundStyle, VisualQuality } from '@/types/batch-video';

const VOICE_TONES: { id: VoiceTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'calm', label: 'Calm' },
];

const BACKGROUND_STYLES: { id: BackgroundStyle; label: string }[] = [
  { id: 'animated-gradient', label: 'Animated Gradient' },
  { id: 'office-studio', label: 'Office Studio' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'abstract-motion', label: 'Abstract Motion' },
  { id: 'brand-colors', label: 'Brand Colors Dynamic' },
];

// Aspect ratio presets
const ASPECT_RATIO_PRESETS = [
  { id: '16:9' as const, label: 'Landscape 16:9', desc: 'YouTube, Facebook Feed' },
  { id: '1:1' as const, label: 'Square 1:1', desc: 'Instagram Feed, Facebook Feed' },
  { id: '9:16' as const, label: 'Portrait 9:16', desc: 'TikTok, Reels, Shorts, Stories' },
];

interface VisualSelectionStepProps {
  onComplete: (
    visualType: 'avatar' | 'broll' | 'mixed',
    aspectRatio: '16:9' | '9:16',
    avatarId?: string,
    avatarImageUrl?: string,
    avatarDescription?: string,
    voiceTone?: VoiceTone,
    speakingPace?: number,
    backgroundStyle?: BackgroundStyle,
    visualQuality?: VisualQuality,
    firstFrameImageUrl?: string,
  ) => void;
  onBack: () => void;
  defaultAspectRatio?: '16:9' | '9:16' | '1:1';
  scriptContent?: string;
  clientId?: string;
  projectId?: string;
  offerDescription?: string;
}

export function VisualSelectionStep({
  onComplete, onBack, defaultAspectRatio, scriptContent, clientId, projectId, offerDescription,
}: VisualSelectionStepProps) {
  const [firstFrameOpen, setFirstFrameOpen] = useState(false);
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | undefined>(undefined);
  const [visualType, setVisualType] = useState<'avatar' | 'broll' | 'mixed'>('avatar');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [selectedRatio, setSelectedRatio] = useState<'16:9' | '9:16' | '1:1'>(defaultAspectRatio || '16:9');
  const [voiceTone, setVoiceTone] = useState<VoiceTone>('professional');
  const [speakingPace, setSpeakingPace] = useState(1.0);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('animated-gradient');
  const [visualQuality, setVisualQuality] = useState<VisualQuality>('standard');
  const { data: avatars = [] } = useAllAvatars();

  const selectedAvatar = avatars.find(a => a.id === selectedAvatarId);
  const needsAvatar = visualType === 'avatar' || visualType === 'mixed';
  const canProceed = visualType === 'broll' || (needsAvatar && selectedAvatarId);

  // Map ratio — 1:1 gets treated as 16:9 for video gen (only 16:9 and 9:16 supported)
  const effectiveRatio: '16:9' | '9:16' = selectedRatio === '9:16' ? '9:16' : '16:9';

  const handleContinue = () => {
    if (!canProceed) return;
    const avatarDescription = selectedAvatar
      ? `${selectedAvatar.name}${selectedAvatar.gender ? `, ${selectedAvatar.gender}` : ''}${selectedAvatar.age_range ? `, ${selectedAvatar.age_range}` : ''}${selectedAvatar.ethnicity ? `, ${selectedAvatar.ethnicity}` : ''}${selectedAvatar.description ? `. ${selectedAvatar.description}` : ''}`
      : undefined;
    onComplete(
      visualType, effectiveRatio,
      needsAvatar ? selectedAvatarId : undefined,
      needsAvatar ? selectedAvatar?.image_url : undefined,
      needsAvatar ? avatarDescription : undefined,
      voiceTone, speakingPace, backgroundStyle, visualQuality, firstFrameUrl,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5" />
          Step 2: Visual & Presenter Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aspect Ratio Presets */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Aspect Ratio</Label>
          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIO_PRESETS.map(ratio => (
              <button
                key={ratio.id}
                onClick={() => setSelectedRatio(ratio.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all',
                  selectedRatio === ratio.id
                    ? 'border-primary ring-1 ring-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{ratio.id}</span>
                  {selectedRatio === ratio.id && <Check className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <p className="text-[10px] text-muted-foreground">{ratio.desc}</p>
              </button>
            ))}
          </div>
          {selectedRatio === '1:1' && (
            <p className="text-[10px] text-amber-500">Square videos are rendered as 16:9 — video gen only supports landscape/portrait</p>
          )}
        </div>

        {/* Two columns: Avatar Presenter | AI Scene Generation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — Avatar Presenter */}
          <div className="space-y-5 p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Avatar Presenter</h3>
              <Badge variant="outline" className="text-[10px]">Nano Banana Pro</Badge>
            </div>

            {/* Video Type */}
            <div className="space-y-2">
              <Label className="text-xs">Video Type</Label>
              <div className="flex gap-2">
                {(['avatar', 'broll', 'mixed'] as const).map(t => (
                  <Button key={t} size="sm" variant={visualType === t ? 'default' : 'outline'} onClick={() => setVisualType(t)} className="capitalize flex-1">
                    {t === 'avatar' ? 'Avatar' : t === 'broll' ? 'B-Roll' : 'Mixed'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Avatar Grid */}
            {needsAvatar && (
              <div className="space-y-2">
                <Label className="text-xs">Select Avatar</Label>
                {avatars.length > 0 ? (
                  <ScrollArea className="h-44">
                    <div className="grid grid-cols-4 gap-2 pr-2">
                      {avatars.map(avatar => (
                        <button key={avatar.id} onClick={() => setSelectedAvatarId(avatar.id)}
                          className={cn('relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                            selectedAvatarId === avatar.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-muted-foreground/50')}>
                          <img src={avatar.image_url} alt={avatar.name} className="w-full h-full object-cover" />
                          {selectedAvatarId === avatar.id && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                            <p className="text-[9px] text-white truncate">{avatar.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-xs text-muted-foreground py-6 text-center">No avatars found.</p>
                )}
              </div>
            )}

            {/* Voice Tone */}
            <div className="space-y-2">
              <Label className="text-xs">Voice Tone</Label>
              <div className="flex flex-wrap gap-2">
                {VOICE_TONES.map(v => (
                  <Button key={v.id} size="sm" variant={voiceTone === v.id ? 'default' : 'outline'} onClick={() => setVoiceTone(v.id)} className="text-xs h-7">
                    {v.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Speaking Pace */}
            <div className="space-y-2">
              <Label className="text-xs">Speaking Pace: {speakingPace.toFixed(1)}x</Label>
              <Slider min={0.5} max={2.0} step={0.1} value={[speakingPace]} onValueChange={([v]) => setSpeakingPace(v)} />
            </div>
          </div>

          {/* RIGHT — AI Scene Generation */}
          <div className="space-y-5 p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">AI Scene Generation</h3>
            </div>

            {/* Background Style */}
            <div className="space-y-2">
              <Label className="text-xs">Background Style</Label>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_STYLES.map(b => (
                  <Button key={b.id} size="sm" variant={backgroundStyle === b.id ? 'default' : 'outline'} onClick={() => setBackgroundStyle(b.id)} className="text-xs h-7">
                    {b.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Visual Quality */}
            <div className="space-y-2">
              <Label className="text-xs">Visual Quality</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={visualQuality === 'standard' ? 'default' : 'outline'} onClick={() => setVisualQuality('standard')} className="flex-1 text-xs h-8">
                  Standard
                </Button>
                <Button size="sm" variant={visualQuality === 'hyper-realistic' ? 'default' : 'outline'} onClick={() => setVisualQuality('hyper-realistic')} className="flex-1 text-xs h-8 gap-1">
                  <Sparkles className="h-3 w-3" />Hyper-Realistic Veo3
                </Button>
              </div>
            </div>

            {/* Selected Avatar Preview */}
            {selectedAvatar && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mt-4">
                <img src={selectedAvatar.image_url} alt={selectedAvatar.name} className="w-10 h-10 rounded-lg object-cover" />
                <div>
                  <p className="font-medium text-sm">{selectedAvatar.name}</p>
                  <p className="text-xs text-muted-foreground">Character consistency enabled</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Opening frame */}
        <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg">
          {firstFrameUrl ? (
            <img src={firstFrameUrl} alt="Chosen opening frame" className="h-14 w-24 rounded-md object-cover border" />
          ) : (
            <div className="h-14 w-24 rounded-md bg-muted grid place-items-center">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Opening frame {firstFrameUrl ? '— selected' : '(optional)'}</p>
            <p className="text-xs text-muted-foreground">
              {selectedAvatar
                ? 'Built from the script, this avatar and the style you picked.'
                : 'No avatar picked — a new presenter is created from your prompt.'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setFirstFrameOpen(true)}>
            <ImageIcon className="h-4 w-4" />{firstFrameUrl ? 'Change' : 'Generate first frame'}
          </Button>
        </div>

        <FirstFrameDialog
          open={firstFrameOpen}
          onOpenChange={setFirstFrameOpen}
          scriptContent={scriptContent}
          avatarImageUrl={needsAvatar ? selectedAvatar?.image_url : undefined}
          avatarDescription={selectedAvatar
            ? `${selectedAvatar.name}${selectedAvatar.gender ? `, ${selectedAvatar.gender}` : ''}${selectedAvatar.age_range ? `, ${selectedAvatar.age_range}` : ''}${selectedAvatar.description ? `. ${selectedAvatar.description}` : ''}`
            : undefined}
          backgroundStyle={backgroundStyle}
          visualQuality={visualQuality}
          aspectRatio={selectedRatio}
          clientId={clientId}
          projectId={projectId}
          offerDescription={offerDescription}
          selectedUrl={firstFrameUrl}
          onSelect={setFirstFrameUrl}
        />

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
          <Button onClick={handleContinue} disabled={!canProceed} className="gap-2">Continue<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
