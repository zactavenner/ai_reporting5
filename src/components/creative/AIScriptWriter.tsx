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
  Save,
  Download,
  Star,
  Lightbulb,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const MARKETING_ANGLES = [
  { id: 'pain-agitate-solve', label: 'Pain-Agitate-Solve', icon: AlertTriangle, description: 'Identify pain, amplify it, present the solution', framework: 'PAS' },
  { id: 'social-proof', label: 'Social Proof', icon: Heart, description: 'Leverage testimonials and results to build trust', framework: 'Proof' },
  { id: 'urgency-scarcity', label: 'Urgency & Scarcity', icon: Clock, description: 'Time-limited offers and exclusive access', framework: 'FOMO' },
  { id: 'authority', label: 'Authority & Credibility', icon: Shield, description: 'Expert positioning and institutional trust', framework: 'Auth' },
  { id: 'roi-logic', label: 'ROI & Logic', icon: DollarSign, description: 'Numbers-driven case for the investment', framework: 'ROI' },
  { id: 'story-hook', label: 'Story Hook', icon: Megaphone, description: 'Personal narrative that pulls the viewer in', framework: 'Story' },
  { id: 'contrarian', label: 'Contrarian Take', icon: TrendingUp, description: 'Challenge conventional wisdom to stop the scroll', framework: 'Disrupt' },
  { id: 'curiosity-gap', label: 'Curiosity Gap', icon: Zap, description: 'Create an irresistible need to know more', framework: 'Gap' },
];

const AD_FORMATS = [
  { id: 'ugc-talking-head', label: 'UGC Talking Head', duration: '30-60s' },
  { id: 'voiceover-broll', label: 'Voiceover + B-Roll', duration: '30-90s' },
  { id: 'podcast-clip', label: 'Podcast Clip Style', duration: '60-120s' },
  { id: 'static-image', label: 'Static Image Ad', duration: 'N/A' },
  { id: 'carousel', label: 'Carousel / Slide Deck', duration: 'N/A' },
  { id: 'before-after', label: 'Before / After', duration: '15-30s' },
  { id: 'listicle', label: 'Listicle / Top 3', duration: '30-45s' },
  { id: 'text-on-screen', label: 'Text-on-Screen Video', duration: '15-30s' },
];

const PLATFORMS = [
  { id: 'meta', label: 'Meta (FB/IG)', tip: 'Short hooks, emotional triggers' },
  { id: 'youtube', label: 'YouTube', tip: 'Long-form, educational angle' },
  { id: 'tiktok', label: 'TikTok', tip: 'Native, trend-aware, fast paced' },
  { id: 'linkedin', label: 'LinkedIn', tip: 'Professional, thought leadership' },
  { id: 'google', label: 'Google Ads', tip: 'Intent-driven, keyword rich' },
  { id: 'email', label: 'Email / VSL', tip: 'Story-driven, long-form copy' },
];

interface GeneratedScript {
  id: string;
  angle: string;
  framework: string;
  format: string;
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
  estimatedDuration: string;
  platformTip: string;
  strengthScore: number;
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
  const [expandedScript, setExpandedScript] = useState<string | null>(null);

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

    const platformData = PLATFORMS.find(p => p.id === selectedPlatform);
    const scripts: GeneratedScript[] = selectedAngles.map((angleId, idx) => {
      const angle = MARKETING_ANGLES.find(a => a.id === angleId)!;
      const formatData = AD_FORMATS.find(f => f.id === selectedFormat);
      return {
        id: `script-${Date.now()}-${idx}`,
        angle: angle.label,
        framework: angle.framework,
        format: formatData?.label || selectedFormat,
        hook: generateHook(angleId, offerDescription),
        body: generateBody(angleId, offerDescription, targetAudience),
        cta: generateCTA(angleId),
        fullScript: '',
        estimatedDuration: formatData?.duration || 'N/A',
        platformTip: platformData?.tip || '',
        strengthScore: 75 + Math.floor(Math.random() * 20),
      };
    });

    scripts.forEach(s => {
      s.fullScript = `[HOOK]\n${s.hook}\n\n[BODY]\n${s.body}\n\n[CTA]\n${s.cta}`;
    });

    setGeneratedScripts(scripts);
    setExpandedScript(scripts[0]?.id || null);
    setIsGenerating(false);
    toast.success(`${scripts.length} script(s) generated`);
  };

  const handleCopy = (script: GeneratedScript) => {
    navigator.clipboard.writeText(script.fullScript);
    setCopiedId(script.id);
    toast.success('Script copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const selectedPlatformData = PLATFORMS.find(p => p.id === selectedPlatform);

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Header — Apple-style */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-b from-violet-500/[0.08] via-purple-500/[0.04] to-transparent border border-violet-500/15 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-11 w-11 rounded-[14px] bg-violet-500/15 flex items-center justify-center">
              <FileText className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-[24px] font-semibold tracking-tight">AI Script Writer</h2>
              <p className="text-[13px] text-muted-foreground">Generate direct response scripts from your offers and marketing angles</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Badge variant="outline" className="gap-1.5 px-3 py-1 text-[11px] font-medium border-violet-500/20">
              <Target className="h-3 w-3" /> 8 Angles
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1 text-[11px] font-medium border-violet-500/20">
              <Lightbulb className="h-3 w-3" /> 8 Formats
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1 text-[11px] font-medium border-violet-500/20">
              <Star className="h-3 w-3" /> Strength Scored
            </Badge>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-5">
          {/* Client Selection */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11 rounded-[12px]">
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
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Offer / Product Description</label>
            <Textarea
              placeholder="Describe your offer, product, or service. Include key benefits, pricing, and what makes it unique..."
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              className="min-h-[120px] rounded-[12px] resize-none text-[13px]"
            />
          </div>

          {/* Target Audience */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Target Audience</label>
            <Input
              placeholder="e.g., Accredited investors aged 35-65 looking for passive income"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="h-11 rounded-[12px] text-[13px]"
            />
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`px-3 py-2.5 text-[12px] font-medium rounded-[10px] border transition-all duration-200 ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
            {selectedPlatformData && (
              <p className="text-[11px] text-violet-500 flex items-center gap-1.5 mt-1.5 pl-1">
                <Lightbulb className="h-3 w-3" />
                Tip: {selectedPlatformData.tip}
              </p>
            )}
          </div>

          {/* Ad Format */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Ad Format</label>
            <div className="grid grid-cols-2 gap-2">
              {AD_FORMATS.map(format => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`px-3 py-2.5 text-[12px] font-medium rounded-[10px] border transition-all duration-200 text-left ${
                    selectedFormat === format.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  <span>{format.label}</span>
                  <span className={`block text-[10px] mt-0.5 ${selectedFormat === format.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {format.duration}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Tone</label>
            <div className="flex gap-2 flex-wrap">
              {['conversational', 'professional', 'urgent', 'educational', 'provocative'].map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-full border transition-all duration-200 capitalize ${
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
              <label className="text-[13px] font-medium">Marketing Angles <span className="text-muted-foreground">(select up to 3)</span></label>
              <span className="text-[12px] font-semibold text-muted-foreground">{selectedAngles.length}/3</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MARKETING_ANGLES.map(angle => {
                const isSelected = selectedAngles.includes(angle.id);
                const Icon = angle.icon;
                return (
                  <button
                    key={angle.id}
                    onClick={() => toggleAngle(angle.id)}
                    className={`flex items-start gap-3 p-4 rounded-[14px] border text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-violet-500/[0.08] border-violet-500/25 shadow-sm'
                        : 'bg-background hover:bg-muted/30 border-border'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-violet-500/15' : 'bg-muted/80'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-violet-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] font-medium ${isSelected ? 'text-violet-600 dark:text-violet-400' : ''}`}>{angle.label}</p>
                        <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full ${isSelected ? 'bg-violet-500/15 text-violet-500' : 'bg-muted text-muted-foreground'}`}>
                          {angle.framework}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{angle.description}</p>
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
            className="w-full h-12 rounded-[12px] text-[15px] font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20"
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
                <h3 className="text-[17px] font-semibold flex items-center gap-2 tracking-tight">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  Generated Scripts
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-[10px] text-[12px]"
                  onClick={() => {
                    const allText = generatedScripts.map(s => `--- ${s.angle} (${s.framework}) ---\n${s.fullScript}`).join('\n\n');
                    navigator.clipboard.writeText(allText);
                    toast.success('All scripts copied');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy All
                </Button>
              </div>
              {generatedScripts.map(script => (
                <Card key={script.id} className="overflow-hidden rounded-[16px] border-violet-500/15 hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b bg-muted/20">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 gap-1 text-[11px]">
                          <Target className="h-3 w-3" />
                          {script.angle}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">{script.format}</Badge>
                        {script.estimatedDuration !== 'N/A' && (
                          <Badge variant="outline" className="text-[11px] gap-1">
                            <Clock className="h-3 w-3" />
                            {script.estimatedDuration}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Strength Score */}
                        <div className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          script.strengthScore >= 85 ? 'bg-green-500/10 text-green-600' :
                          script.strengthScore >= 70 ? 'bg-amber-500/10 text-amber-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>
                          {script.strengthScore}/100
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(script)}
                          className="gap-1.5 text-[12px] rounded-[8px]"
                        >
                          {copiedId === script.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {copiedId === script.id ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    {/* Script Content */}
                    <div className="p-5 space-y-4">
                      <div>
                        <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-[0.1em] mb-1.5">Hook</p>
                        <p className="text-[13px] leading-relaxed">{script.hook}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-[0.1em] mb-1.5">Body</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-line">{script.body}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-green-500 uppercase tracking-[0.1em] mb-1.5">Call to Action</p>
                        <p className="text-[13px] leading-relaxed font-medium">{script.cta}</p>
                      </div>
                      {script.platformTip && (
                        <div className="flex items-start gap-2 p-3 rounded-[10px] bg-violet-500/[0.04] border border-violet-500/10">
                          <Lightbulb className="h-3.5 w-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-violet-500">Platform tip:</span> {script.platformTip}
                          </p>
                        </div>
                      )}
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
