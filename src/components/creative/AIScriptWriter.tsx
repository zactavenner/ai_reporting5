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
  ArrowRight,
  Save,
  Download,
  Eye,
  Star,
  Info,
  Lightbulb,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const MARKETING_ANGLES = [
  { id: 'pain-agitate-solve', label: 'Pain-Agitate-Solve', icon: AlertTriangle, description: 'Identify pain, amplify it, present the solution', color: 'from-red-500/10 to-red-500/5', iconColor: 'text-red-500', iconBg: 'bg-red-500/15' },
  { id: 'social-proof', label: 'Social Proof', icon: Heart, description: 'Leverage testimonials and results to build trust', color: 'from-pink-500/10 to-pink-500/5', iconColor: 'text-pink-500', iconBg: 'bg-pink-500/15' },
  { id: 'urgency-scarcity', label: 'Urgency & Scarcity', icon: Clock, description: 'Time-limited offers and exclusive access', color: 'from-amber-500/10 to-amber-500/5', iconColor: 'text-amber-500', iconBg: 'bg-amber-500/15' },
  { id: 'authority', label: 'Authority & Credibility', icon: Shield, description: 'Expert positioning and institutional trust', color: 'from-blue-500/10 to-blue-500/5', iconColor: 'text-blue-500', iconBg: 'bg-blue-500/15' },
  { id: 'roi-logic', label: 'ROI & Logic', icon: DollarSign, description: 'Numbers-driven case for the investment', color: 'from-green-500/10 to-green-500/5', iconColor: 'text-green-500', iconBg: 'bg-green-500/15' },
  { id: 'story-hook', label: 'Story Hook', icon: Megaphone, description: 'Personal narrative that pulls the viewer in', color: 'from-violet-500/10 to-violet-500/5', iconColor: 'text-violet-500', iconBg: 'bg-violet-500/15' },
  { id: 'contrarian', label: 'Contrarian Take', icon: TrendingUp, description: 'Challenge conventional wisdom to stop the scroll', color: 'from-orange-500/10 to-orange-500/5', iconColor: 'text-orange-500', iconBg: 'bg-orange-500/15' },
  { id: 'curiosity-gap', label: 'Curiosity Gap', icon: Zap, description: 'Create an irresistible need to know more', color: 'from-cyan-500/10 to-cyan-500/5', iconColor: 'text-cyan-500', iconBg: 'bg-cyan-500/15' },
];

const AD_FORMATS = [
  { id: 'ugc-talking-head', label: 'UGC Talking Head', tip: 'Best for Meta & TikTok' },
  { id: 'voiceover-broll', label: 'Voiceover + B-Roll', tip: 'Best for YouTube' },
  { id: 'podcast-clip', label: 'Podcast Clip Style', tip: 'Rising format' },
  { id: 'static-image', label: 'Static Image Ad', tip: 'Best for retargeting' },
  { id: 'carousel', label: 'Carousel / Slide Deck', tip: 'High engagement' },
  { id: 'before-after', label: 'Before / After', tip: 'High CTR' },
  { id: 'listicle', label: 'Listicle / Top 3', tip: 'Viral potential' },
  { id: 'text-on-screen', label: 'Text-on-Screen Video', tip: 'Sound-off friendly' },
];

const PLATFORMS = [
  { id: 'meta', label: 'Meta (FB/IG)', guide: 'Hook in 3s. UGC-style. 15-60s vertical.' },
  { id: 'youtube', label: 'YouTube', guide: 'Hook in 5s. Problem→Solution→CTA. 30-90s.' },
  { id: 'tiktok', label: 'TikTok', guide: 'Native feel. Text overlays. Trending sounds.' },
  { id: 'linkedin', label: 'LinkedIn', guide: 'Professional tone. Value-first. Educational.' },
  { id: 'google', label: 'Google Ads', guide: 'Intent-driven. Benefit headlines. 30 chars.' },
  { id: 'email', label: 'Email / VSL', guide: 'Long-form OK. Story arc. Clear CTA.' },
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
  performanceScore: number;
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

  const selectedPlatformData = PLATFORMS.find(p => p.id === selectedPlatform);

  const handleGenerate = async () => {
    if (!offerDescription || selectedAngles.length === 0 || !selectedFormat) {
      toast.error('Please fill in the offer, select at least one angle, and choose a format');
      return;
    }

    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2500));

    const scripts: GeneratedScript[] = selectedAngles.map((angleId, idx) => {
      const angle = MARKETING_ANGLES.find(a => a.id === angleId)!;
      const score = Math.floor(Math.random() * 15) + 80;
      return {
        id: `script-${Date.now()}-${idx}`,
        angle: angle.label,
        format: AD_FORMATS.find(f => f.id === selectedFormat)?.label || selectedFormat,
        hook: generateHook(angleId, offerDescription),
        body: generateBody(angleId, offerDescription, targetAudience),
        cta: generateCTA(angleId),
        fullScript: '',
        estimatedDuration: selectedFormat.includes('static') || selectedFormat === 'carousel' ? 'N/A' : `${30 + idx * 15}s`,
        performanceScore: score,
      };
    });

    scripts.forEach(s => {
      s.fullScript = `[HOOK]\n${s.hook}\n\n[BODY]\n${s.body}\n\n[CTA]\n${s.cta}`;
    });

    setGeneratedScripts(scripts);
    setIsGenerating(false);
    setExpandedScript(scripts[0]?.id || null);
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
      {/* Apple-Style Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#0a0a0a] p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="absolute top-[-30%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-violet-600/20 via-purple-500/10 to-transparent rounded-full blur-[80px]" />
          <div className="absolute bottom-[-40%] left-[10%] w-[400px] h-[400px] bg-gradient-to-tr from-indigo-500/10 to-transparent rounded-full blur-[80px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <PenTool className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">AI Script Writer</h2>
              <p className="text-[13px] text-white/35">Generate direct response scripts from offers & marketing angles</p>
            </div>
          </div>
          {/* Platform-specific tips */}
          {selectedPlatformData && (
            <div className="mt-6 flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.06] backdrop-blur-xl">
              <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{selectedPlatformData.label} Best Practice</p>
                <p className="text-[13px] text-white/45 mt-0.5">{selectedPlatformData.guide}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-5">
          {/* Client Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary/50">
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
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Offer / Product</label>
            <Textarea
              placeholder="Describe your offer, product, or service. Include key benefits, pricing, and what makes it unique..."
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              className="min-h-[120px] rounded-xl resize-none bg-muted/30 border-border/50 focus:border-primary/50"
            />
          </div>

          {/* Target Audience */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Target Audience</label>
            <Input
              placeholder="e.g., Accredited investors aged 35-65 looking for passive income"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary/50"
            />
          </div>

          {/* Platform */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Platform</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-all duration-200 ${
                    selectedPlatform === platform.id
                      ? 'bg-foreground text-background border-foreground shadow-sm'
                      : 'bg-muted/30 hover:bg-muted/50 border-border/50 text-muted-foreground'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ad Format */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Ad Format</label>
            <div className="grid grid-cols-2 gap-1.5">
              {AD_FORMATS.map(format => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`px-3 py-3 rounded-xl border transition-all duration-200 text-left ${
                    selectedFormat === format.id
                      ? 'bg-foreground text-background border-foreground shadow-sm'
                      : 'bg-muted/30 hover:bg-muted/50 border-border/50'
                  }`}
                >
                  <span className="text-xs font-semibold block">{format.label}</span>
                  <span className={`text-[10px] mt-0.5 block ${selectedFormat === format.id ? 'text-background/60' : 'text-muted-foreground/60'}`}>{format.tip}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Tone</label>
            <div className="flex gap-1.5 flex-wrap">
              {['conversational', 'professional', 'urgent', 'educational', 'provocative'].map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 capitalize ${
                    tone === t
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/30 hover:bg-muted/50 border-border/50 text-muted-foreground'
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
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Marketing Angles <span className="text-muted-foreground/40 normal-case">(up to 3)</span></label>
              <span className="text-xs font-bold text-muted-foreground/50">{selectedAngles.length}/3</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MARKETING_ANGLES.map(angle => {
                const isSelected = selectedAngles.includes(angle.id);
                const Icon = angle.icon;
                return (
                  <button
                    key={angle.id}
                    onClick={() => toggleAngle(angle.id)}
                    className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all duration-300 ${
                      isSelected
                        ? `bg-gradient-to-br ${angle.color} border-primary/20 shadow-sm`
                        : 'bg-card hover:bg-muted/30 border-border/50'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? angle.iconBg : 'bg-muted/70'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? angle.iconColor : 'text-muted-foreground/60'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${isSelected ? '' : 'text-foreground/80'}`}>{angle.label}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{angle.description}</p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
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
            className="w-full h-13 rounded-2xl text-base font-semibold gap-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/30"
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
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  Generated Scripts
                </h3>
                <Button variant="ghost" size="sm" onClick={handleGenerate} className="gap-1.5 text-xs rounded-lg">
                  <RotateCcw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
              {generatedScripts.map(script => {
                const isExpanded = expandedScript === script.id;
                return (
                  <Card key={script.id} className="overflow-hidden rounded-2xl border-border/50 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-0">
                      {/* Script Header */}
                      <button
                        onClick={() => setExpandedScript(isExpanded ? null : script.id)}
                        className="w-full flex items-center justify-between p-4 border-b bg-muted/20 hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 rounded-lg px-2.5">
                            <Target className="h-3 w-3 mr-1" />
                            {script.angle}
                          </Badge>
                          <Badge variant="outline" className="rounded-lg">{script.format}</Badge>
                          {script.estimatedDuration !== 'N/A' && (
                            <Badge variant="outline" className="text-xs rounded-lg gap-1">
                              <Clock className="h-3 w-3" />
                              {script.estimatedDuration}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Performance Score */}
                          <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            script.performanceScore >= 90 ? 'bg-green-500/10 text-green-600' :
                            script.performanceScore >= 80 ? 'bg-blue-500/10 text-blue-600' :
                            'bg-amber-500/10 text-amber-600'
                          }`}>
                            <Star className="h-3 w-3 inline mr-1" />
                            {script.performanceScore}/100
                          </div>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {/* Script Content - Expandable */}
                      {isExpanded && (
                        <div className="p-5 space-y-5">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                              <p className="text-xs font-bold text-violet-500 uppercase tracking-wider">Hook</p>
                            </div>
                            <p className="text-sm leading-relaxed pl-4 border-l-2 border-violet-500/20">{script.hook}</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Body</p>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-line pl-4 border-l-2 border-blue-500/20">{script.body}</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              <p className="text-xs font-bold text-green-500 uppercase tracking-wider">Call to Action</p>
                            </div>
                            <p className="text-sm leading-relaxed font-medium pl-4 border-l-2 border-green-500/20">{script.cta}</p>
                          </div>

                          {/* Action Bar */}
                          <div className="flex items-center gap-2 pt-3 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopy(script)}
                              className="gap-1.5 rounded-lg"
                            >
                              {copiedId === script.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiedId === script.id ? 'Copied' : 'Copy Script'}
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
                              <Download className="h-3.5 w-3.5" />
                              Export
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
                              <Save className="h-3.5 w-3.5" />
                              Save to Brief
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
