import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  FileText,
  Target,
  Zap,
  Copy,
  Check,
  ChevronRight,
  RotateCcw,
  Loader2,
  Megaphone,
  TrendingUp,
  Heart,
  Shield,
  Clock,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const MARKETING_ANGLES = [
  { id: 'pain-agitate-solve', label: 'Pain-Agitate-Solve', icon: AlertTriangle, description: 'Identify pain, amplify it, present the solution' },
  { id: 'social-proof', label: 'Social Proof', icon: Heart, description: 'Leverage testimonials and results to build trust' },
  { id: 'urgency-scarcity', label: 'Urgency & Scarcity', icon: Clock, description: 'Time-limited offers and exclusive access' },
  { id: 'authority', label: 'Authority & Credibility', icon: Shield, description: 'Expert positioning and institutional trust' },
  { id: 'roi-logic', label: 'ROI & Logic', icon: DollarSign, description: 'Numbers-driven case for the investment' },
  { id: 'story-hook', label: 'Story Hook', icon: Megaphone, description: 'Personal narrative that pulls the viewer in' },
  { id: 'contrarian', label: 'Contrarian Take', icon: TrendingUp, description: 'Challenge conventional wisdom to stop the scroll' },
  { id: 'curiosity-gap', label: 'Curiosity Gap', icon: Zap, description: 'Create an irresistible need to know more' },
];

const AD_FORMATS = [
  { id: 'ugc-talking-head', label: 'UGC Talking Head' },
  { id: 'voiceover-broll', label: 'Voiceover + B-Roll' },
  { id: 'podcast-clip', label: 'Podcast Clip Style' },
  { id: 'static-image', label: 'Static Image Ad' },
  { id: 'carousel', label: 'Carousel / Slide Deck' },
  { id: 'before-after', label: 'Before / After' },
  { id: 'listicle', label: 'Listicle / Top 3' },
  { id: 'text-on-screen', label: 'Text-on-Screen Video' },
];

const PLATFORMS = [
  { id: 'meta', label: 'Meta (FB/IG)' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'google', label: 'Google Ads' },
  { id: 'email', label: 'Email / VSL' },
];

interface GeneratedScript {
  id: string;
  angle: string;
  format: string;
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
  estimatedDuration: string;
}

export function AIScriptWriter() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState<string>('');
  const [offerDescription, setOfferDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [tone, setTone] = useState('conversational');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScripts, setGeneratedScripts] = useState<GeneratedScript[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleAngle = (angleId: string) => {
    setSelectedAngles(prev =>
      prev.includes(angleId)
        ? prev.filter(a => a !== angleId)
        : prev.length < 3 ? [...prev, angleId] : prev
    );
  };

  const handleGenerate = async () => {
    if (!offerDescription || selectedAngles.length === 0 || !selectedFormat) {
      toast.error('Please fill in the offer, select at least one angle, and choose a format');
      return;
    }

    setIsGenerating(true);

    // Simulate AI generation (replace with actual Supabase edge function call)
    await new Promise(resolve => setTimeout(resolve, 2500));

    const scripts: GeneratedScript[] = selectedAngles.map((angleId, idx) => {
      const angle = MARKETING_ANGLES.find(a => a.id === angleId)!;
      return {
        id: `script-${Date.now()}-${idx}`,
        angle: angle.label,
        format: AD_FORMATS.find(f => f.id === selectedFormat)?.label || selectedFormat,
        hook: generateHook(angleId, offerDescription),
        body: generateBody(angleId, offerDescription, targetAudience),
        cta: generateCTA(angleId),
        fullScript: '',
        estimatedDuration: selectedFormat.includes('static') || selectedFormat === 'carousel' ? 'N/A' : `${30 + idx * 15}s`,
      };
    });

    scripts.forEach(s => {
      s.fullScript = `[HOOK]\n${s.hook}\n\n[BODY]\n${s.body}\n\n[CTA]\n${s.cta}`;
    });

    setGeneratedScripts(scripts);
    setIsGenerating(false);
    toast.success(`${scripts.length} script(s) generated`);
  };

  const handleCopy = (script: GeneratedScript) => {
    navigator.clipboard.writeText(script.fullScript);
    setCopiedId(script.id);
    toast.success('Script copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-fuchsia-500/10 border border-violet-500/20 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">AI Script Writer</h2>
              <p className="text-sm text-muted-foreground">Generate direct response scripts from your offers and marketing angles</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Offer Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Offer / Product Description</label>
            <Textarea
              placeholder="Describe your offer, product, or service. Include key benefits, pricing, and what makes it unique..."
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              className="min-h-[120px] rounded-xl resize-none"
            />
          </div>

          {/* Target Audience */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Audience</label>
            <Input
              placeholder="e.g., Accredited investors aged 35-65 looking for passive income"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Platform */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all duration-200 ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ad Format */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ad Format</label>
            <div className="grid grid-cols-2 gap-2">
              {AD_FORMATS.map(format => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`px-3 py-2.5 text-xs font-medium rounded-xl border transition-all duration-200 text-left ${
                    selectedFormat === format.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  {format.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tone</label>
            <div className="flex gap-2 flex-wrap">
              {['conversational', 'professional', 'urgent', 'educational', 'provocative'].map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 capitalize ${
                    tone === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Angles & Output */}
        <div className="lg:col-span-3 space-y-6">
          {/* Marketing Angles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Marketing Angles <span className="text-muted-foreground">(select up to 3)</span></label>
              <Badge variant="outline" className="text-xs">{selectedAngles.length}/3</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MARKETING_ANGLES.map(angle => {
                const isSelected = selectedAngles.includes(angle.id);
                const Icon = angle.icon;
                return (
                  <button
                    key={angle.id}
                    onClick={() => toggleAngle(angle.id)}
                    className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-violet-500/10 border-violet-500/30 shadow-sm'
                        : 'bg-background hover:bg-muted/30 border-border'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-violet-500/20' : 'bg-muted'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-violet-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isSelected ? 'text-violet-600 dark:text-violet-400' : ''}`}>{angle.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{angle.description}</p>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !offerDescription || selectedAngles.length === 0 || !selectedFormat}
            className="w-full h-12 rounded-xl text-base font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Generating Scripts...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate {selectedAngles.length} Script{selectedAngles.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>

          {/* Generated Scripts */}
          {generatedScripts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                Generated Scripts
              </h3>
              {generatedScripts.map(script => (
                <Card key={script.id} className="overflow-hidden rounded-2xl border-violet-500/20">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
                          <Target className="h-3 w-3 mr-1" />
                          {script.angle}
                        </Badge>
                        <Badge variant="outline">{script.format}</Badge>
                        {script.estimatedDuration !== 'N/A' && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {script.estimatedDuration}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(script)}
                        className="gap-1.5"
                      >
                        {copiedId === script.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedId === script.id ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-xs font-medium text-violet-500 uppercase tracking-wider mb-1">Hook</p>
                        <p className="text-sm leading-relaxed">{script.hook}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-500 uppercase tracking-wider mb-1">Body</p>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{script.body}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-green-500 uppercase tracking-wider mb-1">Call to Action</p>
                        <p className="text-sm leading-relaxed font-medium">{script.cta}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions for demo script generation
function generateHook(angleId: string, offer: string): string {
  const hooks: Record<string, string> = {
    'pain-agitate-solve': `"Most people are leaving money on the table and don't even know it..." — If you've been watching your savings sit idle while inflation eats away at your purchasing power, you're not alone.`,
    'social-proof': `"I was skeptical at first, but the numbers don't lie..." — Over 2,400 investors have already seen returns that traditional investments simply can't match.`,
    'urgency-scarcity': `"This window is closing fast..." — We're only accepting 15 more investors this quarter, and here's why you need to act now.`,
    'authority': `"After managing $500M+ in assets, here's what I've learned..." — The smartest money in the room isn't chasing trends. It's doing this instead.`,
    'roi-logic': `"Let me show you the math..." — A $50K investment returning 18% annually means $9,000/year in passive income. Here's exactly how.`,
    'story-hook': `"A year ago, I was working 80-hour weeks with nothing to show for it..." — Then I discovered an investment vehicle that changed everything.`,
    'contrarian': `"Everything your financial advisor told you is wrong..." — The traditional 60/40 portfolio is dead. Here's what's replacing it.`,
    'curiosity-gap': `"There's a reason the ultra-wealthy are pouring money into this asset class..." — And it has nothing to do with stocks, crypto, or real estate flipping.`,
  };
  return hooks[angleId] || `Stop scrolling. This changes everything about how you think about ${offer}.`;
}

function generateBody(angleId: string, offer: string, audience: string): string {
  return `Here's what makes this different from everything else you've seen:\n\n1. Institutional-grade deal flow that was previously only available to family offices and hedge funds\n2. Hands-off management — you invest, we handle everything from acquisition to operations\n3. Tax-advantaged structure that lets you keep more of what you earn\n\n${audience ? `This is specifically designed for ${audience} who want to build real wealth without the complexity.` : 'This is designed for serious investors who are ready to take the next step.'}\n\nOur track record speaks for itself — consistent returns through every market cycle, with full transparency at every stage.`;
}

function generateCTA(angleId: string): string {
  const ctas: Record<string, string> = {
    'pain-agitate-solve': 'Click below to see how you can stop leaving money on the table. Book your free strategy call today.',
    'social-proof': 'Join 2,400+ investors who already made the smart move. Schedule your consultation now.',
    'urgency-scarcity': 'Only 15 spots remaining this quarter. Reserve yours before they\'re gone.',
    'authority': 'Get the same playbook our top investors use. Book your private briefing.',
    'roi-logic': 'See the full financial breakdown — no obligation. Click below to get the numbers.',
    'story-hook': 'Your story starts here. Book a 15-minute intro call and see what\'s possible.',
    'contrarian': 'Ready to think differently about your money? Let\'s talk. Free consultation below.',
    'curiosity-gap': 'See what the ultra-wealthy already know. Click below for exclusive access.',
  };
  return ctas[angleId] || 'Take the next step. Book your free consultation today.';
}
