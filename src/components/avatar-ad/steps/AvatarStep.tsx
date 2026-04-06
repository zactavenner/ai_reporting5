import { useState } from 'react';
import { useAvatarAd } from '@/context/AvatarAdContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, User, Check, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buildAvatarPrompt, ENVIRONMENT_MAP } from '@/lib/avatar-ad-prompts';
import { useAvatars, useStockAvatars } from '@/hooks/useAvatars';
import { cn } from '@/lib/utils';
import type { DealInput, AvatarGender, AvatarAge, AvatarHair } from '@/types/avatar-ad';

type AvatarMode = 'existing' | 'generate';

export function AvatarStep() {
  const { state, setStep, updateAvatarConfig, setAvatar, setSelectedExistingAvatar } = useAvatarAd();
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<AvatarMode>(state.selectedExistingAvatar ? 'existing' : 'existing');
  const config = state.avatarConfig;
  const deal = state.deal as DealInput;
  const clientId = deal.clientId;

  const { data: clientAvatars = [] } = useAvatars(clientId || undefined);
  const { data: stockAvatars = [] } = useStockAvatars();

  // Merge: client avatars + stock (deduplicated)
  const allAvatars = [
    ...clientAvatars.filter(a => !a.is_stock),
    ...stockAvatars,
  ];

  const selectedAvatarId = state.selectedExistingAvatar?.id;

  const handleSelectExisting = (avatar: typeof allAvatars[0]) => {
    setSelectedExistingAvatar({
      id: avatar.id,
      name: avatar.name,
      imageUrl: avatar.image_url || '',
      isStock: avatar.is_stock || false,
    });
    // Clear generated avatar when selecting existing
    setAvatar({ imageUrl: avatar.image_url || '', prompt: `Existing avatar: ${avatar.name}` });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildAvatarPrompt(config, deal);

      const { data, error } = await supabase.functions.invoke('generate-avatar', {
        body: {
          prompt,
          gender: config.gender,
          ageRange: config.age,
          aspectRatio: '9:16',
          realism_level: 'ultra-realistic',
          clientId: clientId || null,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.imageUrl) {
        throw new Error(data?.error || 'Failed to generate avatar');
      }

      setSelectedExistingAvatar(null);
      setAvatar({ imageUrl: data.imageUrl, prompt });
      toast.success('Avatar generated!');
    } catch (err: any) {
      console.error('Avatar generation error:', err);
      toast.error(err.message || 'Failed to generate avatar');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinue = () => {
    if (!state.avatar) {
      toast.error('Select or generate an avatar first');
      return;
    }
    setStep('video');
  };

  const currentImageUrl = state.avatar?.imageUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Step 3: Avatar Selection
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === 'existing' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('existing')}
            className="gap-1.5"
          >
            <User className="h-4 w-4" /> Choose Existing
          </Button>
          <Button
            variant={mode === 'generate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('generate')}
            className="gap-1.5"
          >
            <Sparkles className="h-4 w-4" /> Generate New
          </Button>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-4">
            {allAvatars.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <User className="h-12 w-12 mx-auto opacity-30 mb-3" />
                <p className="font-medium">No avatars available</p>
                <p className="text-sm mt-1">Switch to "Generate New" to create one, or add stock avatars in Creative Hub.</p>
              </div>
            ) : (
              <>
                {/* Client Avatars */}
                {clientAvatars.filter(a => !a.is_stock).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Client Avatars</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {clientAvatars.filter(a => !a.is_stock).map(avatar => (
                        <AvatarCard
                          key={avatar.id}
                          avatar={avatar}
                          isSelected={selectedAvatarId === avatar.id}
                          onSelect={() => handleSelectExisting(avatar)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock Avatars */}
                {stockAvatars.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Stock Avatars</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {stockAvatars.map(avatar => (
                        <AvatarCard
                          key={avatar.id}
                          avatar={avatar}
                          isSelected={selectedAvatarId === avatar.id}
                          onSelect={() => handleSelectExisting(avatar)}
                          isStock
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Config */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={config.gender} onValueChange={v => updateAvatarConfig({ gender: v as AvatarGender })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Select value={config.age} onValueChange={v => updateAvatarConfig({ age: v as AvatarAge })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25-30">25-30</SelectItem>
                      <SelectItem value="30-35">30-35</SelectItem>
                      <SelectItem value="35-40">35-40</SelectItem>
                      <SelectItem value="40-50">40-50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hair</Label>
                <Select value={config.hair} onValueChange={v => updateAvatarConfig({ hair: v as AvatarHair })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blonde">Blonde</SelectItem>
                    <SelectItem value="brunette">Brunette</SelectItem>
                    <SelectItem value="auburn">Auburn</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light_brown">Light Brown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Custom Outfit (optional)</Label>
                <Textarea
                  value={config.customOutfit || ''}
                  onChange={e => updateAvatarConfig({ customOutfit: e.target.value })}
                  rows={2}
                  placeholder="Leave blank for default business-casual"
                />
              </div>

              <div className="space-y-2">
                <Label>Custom Environment (optional)</Label>
                <Textarea
                  value={config.customEnvironment || ''}
                  onChange={e => updateAvatarConfig({ customEnvironment: e.target.value })}
                  rows={2}
                  placeholder={ENVIRONMENT_MAP[deal.investmentType] || 'Auto-selected based on investment type'}
                />
              </div>

              <Button onClick={handleGenerate} disabled={isGenerating} className="w-full gap-2">
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating Avatar...</>
                ) : state.avatar && !state.selectedExistingAvatar ? (
                  <><RefreshCw className="h-4 w-4" /> Regenerate Avatar</>
                ) : (
                  <><User className="h-4 w-4" /> Generate Avatar</>
                )}
              </Button>
            </div>

            {/* Right: Preview */}
            <div className="flex justify-center">
              <div className="w-[280px] aspect-[9/16] rounded-[2rem] border-4 border-foreground/20 bg-muted/30 overflow-hidden relative">
                {currentImageUrl ? (
                  <img
                    src={currentImageUrl}
                    alt="Generated avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center space-y-2">
                      <User className="h-12 w-12 mx-auto opacity-30" />
                      <p className="text-sm">Avatar preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Selected preview bar */}
        {currentImageUrl && mode === 'existing' && (
          <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center gap-4">
            <img src={currentImageUrl} alt="Selected" className="w-16 h-16 rounded-lg object-cover" />
            <div>
              <p className="font-medium text-sm">{state.selectedExistingAvatar?.name || 'Selected Avatar'}</p>
              <p className="text-xs text-muted-foreground">Ready for video generation</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={() => setStep('script')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={handleContinue} disabled={!state.avatar} className="gap-2">
            Next: Generate Video <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Small avatar card component
function AvatarCard({
  avatar,
  isSelected,
  onSelect,
  isStock,
}: {
  avatar: { id: string; name: string; image_url: string | null; gender?: string | null };
  isSelected: boolean;
  onSelect: () => void;
  isStock?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative rounded-xl overflow-hidden border-2 transition-all aspect-[3/4] group',
        isSelected
          ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
          : 'border-border hover:border-primary/50'
      )}
    >
      {avatar.image_url ? (
        <img src={avatar.image_url} alt={avatar.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <User className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}

      {/* Stock badge */}
      {isStock && (
        <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">
          Stock
        </Badge>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
        <p className="text-white text-xs font-medium truncate">{avatar.name}</p>
      </div>
    </button>
  );
}
