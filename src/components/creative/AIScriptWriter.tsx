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
  Bookmark,
  Star,
  Info,
  Lightbulb,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const MARKETING_ANGLES = [
  { id: 'pain-agitate-solve', label: 'Pain-Agitate-Solve', icon: AlertTriangle, description: 'Identify pain, amplify it, present the solution', color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'social-proof', label: 'Social Proof', icon: Heart, description: 'Leverage testimonials and results to build trust', color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { id: 'urgency-scarcity', label: 'Urgency & Scarcity', icon: Clock, description: 'Time-limited offers and exclusive access', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'authority', label: 'Authority & Credibility', icon: Shield, description: 'Expert positioning and institutional trust', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'roi-logic', label: 'ROI & Logic', icon: DollarSign, description: 'Numbers-driven case for the investment', color: 'text-green-500', bg: 'bg-green-500/10' },
  { id: 'story-hook', label: 'Story Hook', icon: Megaphone, description: 'Personal narrative that pulls the viewer in', color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { id: 'contrarian', label: 'Contrarian Take', icon: TrendingUp, description: 'Challenge conventional wisdom to stop the scroll', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'curiosity-gap', label: 'Curiosity Gap', icon: Zap, description: 'Create an irresistible need to know more', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
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
  { id: 'meta', label: 'Meta (FB/IG)', tip: 'Lead with pattern interrupt. 15-30s performs best. Native-looking UGC outperforms polished 2.3x.' },
  { id: 'youtube', label: 'YouTube', tip: 'First 5 seconds = skip or watch. Use strong curiosity gap. Pre-roll or mid-roll podcast style.' },
  { id: 'tiktok', label: 'TikTok', tip: 'Don\'t make ads, make TikToks. Use trending sounds, fast cuts, and text overlays.' },
  { id: 'linkedin', label: 'LinkedIn', tip: 'Authority-first. Lead with data and credibility. Educational tone converts best.' },
  { id: 'google', label: 'Google Ads', tip: 'Intent-based. Match search intent. Benefit-led headlines with specific numbers.' },
  { id: 'email', label: 'Email / VSL', tip: 'Long-form storytelling works. Open with a bold claim or personal story. Build to the offer.' },
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
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const selectedPlatformData = PLATFORMS.find(p => p.id === selectedPlatform);

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

  const handleSave = (script: GeneratedScript) => {
    setSavedIds(prev => new Set([...prev, script.id]));
    toast.success('Script saved to library');
  };

  return (
    <div className="space-y-8">
      {/* Hero Header — Apple-style clean */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-violet-500/8 via-purple-500/4 to-fuchsia-500/8 border border-violet-500/15 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <FileText className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">AI Script Writer</h2>
              <p className="text-sm text-muted-foreground">Generate direct response scripts from your offers and marketing angles</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Selection */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11 rounded-xl border-border/60">
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
            <label className="text-[13px] font-medium text-foreground/80">Offer / Product Description</label>
            <Textarea
              placeholder="Describe your offer, product, or service. Include key benefits, pricing, and what makes it unique..."
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              className="min-h-[120px] rounded-xl resize-none border-border/60"
            />
          </div>

          {/* Target Audience */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Target Audience</label>
            <Input
              placeholder="e.g., Accredited investors aged 35-65 looking for passive income"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="h-11 rounded-xl border-border/60"
            />
          </div>

          {/* Platform with contextual tip */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`px-3 py-2.5 text-xs font-medium rounded-xl border transition-all duration-200 ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border/60'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
            {selectedPlatformData && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 mt-2">
                <Lightbulb className="h-3.5 w-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedPlatformData.tip}</p>
              </div>
            )}
          </div>

          {/* Ad Format */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Ad Format</label>
            <div className="grid grid-cols-2 gap-2">
              {AD_FORMATS.map(format => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`px-3 py-2.5 text-xs font-medium rounded-xl border transition-all duration-200 text-left ${
                    selectedFormat === format.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border/60'
                  }`}
                >
                  {format.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Tone</label>
            <div className="flex gap-2 flex-wrap">
              {['conversational', 'professional', 'urgent', 'educational', 'provocative'].map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 capitalize ${
                    tone === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted/50 border-border/60'
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
              <label className="text-[13px] font-medium text-foreground/80">Marketing Angles <span className="text-muted-foreground">(select up to 3)</span></label>
              <span className="text-xs text-muted-foreground font-medium">{selectedAngles.length}/3</span>
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
                        ? `${angle.bg} border-current/20 shadow-sm`
                        : 'bg-background hover:bg-muted/30 border-border/60'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? angle.bg : 'bg-muted/60'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? angle.color : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isSelected ? angle.color : ''}`}>{angle.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{angle.description}</p>
                    </div>
                    {isSelected && (
                      <Check className={`h-4 w-4 ${angle.color} flex-shrink-0 mt-0.5`} />
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
            className="w-full h-12 rounded-xl text-[15px] font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20 transition-all duration-300"
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
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  Generated Scripts
                </h3>
                <span className="text-xs text-muted-foreground">{generatedScripts.length} scripts</span>
              </div>
              {generatedScripts.map(script => (
                <Card key={script.id} className="overflow-hidden rounded-2xl border-violet-500/15 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b bg-violet-500/[0.03]">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 rounded-lg">
                          <Target className="h-3 w-3 mr-1" />
                          {script.angle}
                        </Badge>
                        <Badge variant="outline" className="rounded-lg">{script.format}</Badge>
                        {script.estimatedDuration !== 'N/A' && (
                          <Badge variant="outline" className="text-xs rounded-lg">
                            <Clock className="h-3 w-3 mr-1" />
                            {script.estimatedDuration}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSave(script)}
                          className="gap-1.5 h-8 rounded-lg"
                          disabled={savedIds.has(script.id)}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${savedIds.has(script.id) ? 'fill-current text-violet-500' : ''}`} />
                          {savedIds.has(script.id) ? 'Saved' : 'Save'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(script)}
                          className="gap-1.5 h-8 rounded-lg"
                        >
                          {copiedId === script.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === script.id ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                    <div className="p-5 space-y-5">
                      <div>
                        <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wider mb-1.5">Hook</p>
                        <p className="text-sm leading-relaxed">{script.hook}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Body</p>
                        <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{script.body}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                        <p className="text-[11px] font-semibold text-green-500 uppercase tracking-wider mb-1.5">Call to Action</p>
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
