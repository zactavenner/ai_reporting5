import { useState } from 'react';
import { useAvatarAd } from '@/context/AvatarAdContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buildAvatarPrompt, ENVIRONMENT_MAP } from '@/lib/avatar-ad-prompts';
import type { DealInput, AvatarGender, AvatarAge, AvatarHair } from '@/types/avatar-ad';

export function AvatarStep() {
  const { state, setStep, updateAvatarConfig, setAvatar } = useAvatarAd();
  const [isGenerating, setIsGenerating] = useState(false);
  const config = state.avatarConfig;
  const deal = state.deal as DealInput;

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
          clientId: null,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.imageUrl) {
        throw new Error(data?.error || 'Failed to generate avatar');
      }

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
      toast.error('Generate an avatar first');
      return;
    }
    setStep('video');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Step 3: Avatar Generation
        </CardTitle>
      </CardHeader>
      <CardContent>
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
              ) : state.avatar ? (
                <><RefreshCw className="h-4 w-4" /> Regenerate Avatar</>
              ) : (
                <><User className="h-4 w-4" /> Generate Avatar</>
              )}
            </Button>
          </div>

          {/* Right: Preview */}
          <div className="flex justify-center">
            <div className="w-[280px] aspect-[9/16] rounded-[2rem] border-4 border-foreground/20 bg-muted/30 overflow-hidden relative">
              {state.avatar ? (
                <img
                  src={state.avatar.imageUrl}
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
