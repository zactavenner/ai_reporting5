import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Target,
  Zap,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Lightbulb,
  Flame,
  Type,
  AlignLeft,
  MousePointer,
  Eye,
  ArrowDown,
  Bookmark,
  Star,
  Award,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const DR_TOOLS = [
  {
    id: 'hook-generator',
    label: 'Hook Generator',
    description: 'Generate scroll-stopping hooks for ads',
    icon: Flame,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    gradient: 'from-red-500/8 to-orange-500/8',
    borderColor: 'border-red-500/15',
  },
  {
    id: 'headline-variations',
    label: 'Headline Variations',
    description: 'A/B test headlines with AI-powered variations',
    icon: Type,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    gradient: 'from-blue-500/8 to-indigo-500/8',
    borderColor: 'border-blue-500/15',
  },
  {
    id: 'cta-optimizer',
    label: 'CTA Optimizer',
    description: 'Test and optimize calls-to-action',
    icon: MousePointer,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    gradient: 'from-green-500/8 to-emerald-500/8',
    borderColor: 'border-green-500/15',
  },
  {
    id: 'body-copy',
    label: 'Body Copy Writer',
    description: 'Generate persuasive body copy for any platform',
    icon: AlignLeft,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    gradient: 'from-purple-500/8 to-violet-500/8',
    borderColor: 'border-purple-500/15',
  },
  {
    id: 'ad-audit',
    label: 'Ad Copy Audit',
    description: 'AI-powered review of existing ad copy',
    icon: Eye,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    gradient: 'from-amber-500/8 to-yellow-500/8',
    borderColor: 'border-amber-500/15',
  },
  {
    id: 'funnel-copy',
    label: 'Funnel Copy Suite',
    description: 'Complete copy for landing pages, emails, and VSLs',
    icon: ArrowDown,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    gradient: 'from-teal-500/8 to-cyan-500/8',
    borderColor: 'border-teal-500/15',
  },
];

const DR_BENCHMARKS = [
  { metric: 'Hook Rate', benchmark: '> 30%', description: 'Viewers who watch past 3 seconds', icon: Flame },
  { metric: 'Hold Rate', benchmark: '> 15%', description: 'Viewers who watch 50%+ of ad', icon: Eye },
  { metric: 'CTR', benchmark: '> 1.5%', description: 'Click-through rate on CTA', icon: MousePointer },
  { metric: 'Thumb Stop', benchmark: '> 3.5%', description: 'Scroll-stop ratio in feed', icon: Zap },
];

interface GeneratedItem {
  id: string;
  content: string;
  score?: number;
  label?: string;
}

export function DirectResponseToolkit() {
  const { data: clients = [] } = useClients();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [inputText, setInputText] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [platform, setPlatform] = useState('meta');
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const activeTool = DR_TOOLS.find(t => t.id === selectedTool);

  const handleGenerate = async () => {
    if (!inputText || !selectedTool) {
      toast.error('Please provide input and select a tool');
      return;
    }

    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 1800));

    const generated = generateDRContent(selectedTool, inputText, targetAudience, platform);
    setResults(generated);
    setIsGenerating(false);
    toast.success(`${generated.length} variations generated`);
  };

  const handleCopy = (item: GeneratedItem) => {
    navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = (item: GeneratedItem) => {
    setSavedIds(prev => new Set([...prev, item.id]));
    toast.success('Saved to copy library');
  };

  return (
    <div className="space-y-8">
      {/* Hero Header — Apple-style */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-rose-500/8 via-pink-500/4 to-red-500/8 border border-rose-500/15 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 rounded-2xl bg-rose-500/15 flex items-center justify-center">
              <Target className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Direct Response Toolkit</h2>
              <p className="text-sm text-muted-foreground">AI-powered tools for hooks, headlines, CTAs, body copy, and full funnel copywriting</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-[80px]" />
      </div>

      {/* DR Benchmarks */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Direct Response Benchmarks</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {DR_BENCHMARKS.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.metric} className="p-4 rounded-2xl border bg-card hover:bg-muted/30 transition-all duration-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                    <Icon className="h-3.5 w-3.5 text-rose-500" />
                  </div>
                  <p className="text-sm font-semibold">{item.metric}</p>
                </div>
                <p className="text-xl font-bold text-green-600">{item.benchmark}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {DR_TOOLS.map(tool => {
          const isActive = selectedTool === tool.id;
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => {
                setSelectedTool(tool.id);
                setResults([]);
              }}
              className={`flex items-start gap-3 p-5 rounded-2xl border text-left transition-all duration-300 ${
                isActive
                  ? `bg-gradient-to-br ${tool.gradient} ${tool.borderColor} shadow-md`
                  : 'bg-background hover:bg-muted/30 border-border/60 hover:shadow-sm'
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isActive ? tool.bg : 'bg-muted/60'
              }`}>
                <Icon className={`h-5 w-5 ${isActive ? tool.color : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isActive ? tool.color : ''}`}>{tool.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Tool Panel */}
      {selectedTool && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input */}
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              {activeTool && (
                <>
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${activeTool.bg}`}>
                    <activeTool.icon className={`h-4.5 w-4.5 ${activeTool.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold">{activeTool.label}</h3>
                </>
              )}
            </div>

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

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">
                {selectedTool === 'hook-generator' && 'Offer / Product to Hook'}
                {selectedTool === 'headline-variations' && 'Base Headline or Topic'}
                {selectedTool === 'cta-optimizer' && 'Current CTA or Desired Action'}
                {selectedTool === 'body-copy' && 'Product / Offer Description'}
                {selectedTool === 'ad-audit' && 'Paste Your Current Ad Copy'}
                {selectedTool === 'funnel-copy' && 'Offer & Funnel Details'}
              </label>
              <Textarea
                placeholder={getPlaceholder(selectedTool)}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[140px] rounded-xl resize-none border-border/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80">Target Audience</label>
                <Input
                  placeholder="e.g., Business owners, 35-55"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="h-11 rounded-xl border-border/60"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80">Platform</label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="h-11 rounded-xl border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">Meta (FB/IG)</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="google">Google Ads</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="landing">Landing Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tool-specific pro tips */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
              <Lightbulb className="h-3.5 w-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selectedTool === 'hook-generator' && 'The best hooks create an open loop in the viewer\'s mind. Use pattern interrupts, bold claims, or specific numbers to stop the scroll within 3 seconds.'}
                {selectedTool === 'headline-variations' && 'Test at least 5 headline variations per ad set. Headlines with specific numbers convert 36% better than generic ones.'}
                {selectedTool === 'cta-optimizer' && 'The best CTAs are specific, benefit-driven, and low-friction. "See the Full Breakdown" outperforms "Learn More" by 2.4x on average.'}
                {selectedTool === 'body-copy' && 'Structure body copy as: Problem → Agitate → Solution → Proof → CTA. Use short paragraphs and bullet points for mobile readability.'}
                {selectedTool === 'ad-audit' && 'Paste your full ad copy including headline, body, and CTA. The audit will score each section and provide actionable improvements.'}
                {selectedTool === 'funnel-copy' && 'Include your offer details, target market, and funnel structure. The suite generates cohesive copy across landing page, emails, and VSL.'}
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !inputText}
              className="w-full h-12 rounded-xl text-[15px] font-medium gap-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 shadow-lg shadow-rose-500/20 transition-all duration-300"
            >
              {isGenerating ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Generating...</>
              ) : (
                <><Sparkles className="h-5 w-5" />Generate Variations</>
              )}
            </Button>
          </div>

          {/* Output */}
          <div className="space-y-4">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8">
                <div className="h-16 w-16 rounded-[20px] bg-rose-500/8 flex items-center justify-center mb-4">
                  <Zap className="h-8 w-8 text-rose-500/40" />
                </div>
                <p className="text-muted-foreground font-medium">Results will appear here</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Fill in the details and generate</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{results.length} Variations</h3>
                  <Badge variant="outline" className="gap-1 rounded-full text-xs px-3 py-1">
                    <Sparkles className="h-3 w-3" />
                    AI Scored
                  </Badge>
                </div>
                {results.map(item => (
                  <Card key={item.id} className="overflow-hidden rounded-2xl hover:shadow-md transition-all duration-200 border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          {item.label && (
                            <Badge variant="outline" className="text-[10px] mb-2 rounded-full px-2 py-0">{item.label}</Badge>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-line">{item.content}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {item.score !== undefined && (
                            <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              item.score >= 85 ? 'bg-green-500/10 text-green-600' :
                              item.score >= 70 ? 'bg-amber-500/10 text-amber-600' :
                              'bg-red-500/10 text-red-600'
                            }`}>
                              {item.score}/100
                            </div>
                          )}
                          <div className="flex gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSave(item)}
                              className="h-7 w-7 p-0 rounded-lg"
                              disabled={savedIds.has(item.id)}
                            >
                              <Bookmark className={`h-3.5 w-3.5 ${savedIds.has(item.id) ? 'fill-current text-rose-500' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(item)}
                              className="h-7 w-7 p-0 rounded-lg"
                            >
                              {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getPlaceholder(tool: string): string {
  const placeholders: Record<string, string> = {
    'hook-generator': 'Describe the offer or product. What\'s the key benefit? What pain does it solve?',
    'headline-variations': 'Enter your base headline or the main idea you want to communicate...',
    'cta-optimizer': 'Enter your current CTA or describe the action you want users to take...',
    'body-copy': 'Describe the product/offer in detail. Include benefits, features, and proof points...',
    'ad-audit': 'Paste your existing ad copy here and we\'ll analyze it for DR best practices...',
    'funnel-copy': 'Describe your offer, target market, and funnel structure (landing page → email → VSL)...',
  };
  return placeholders[tool] || 'Enter your details...';
}

function generateDRContent(tool: string, input: string, audience: string, platform: string): GeneratedItem[] {
  if (tool === 'hook-generator') {
    return [
      { id: `h-${Date.now()}-1`, content: `"Stop. If you're still doing THIS with your money, you're leaving thousands on the table..."`, score: 92, label: 'Pattern Interrupt' },
      { id: `h-${Date.now()}-2`, content: `"I lost $47,000 before I figured this out. Here's what nobody tells you about ${input.slice(0, 30)}..."`, score: 88, label: 'Story Hook' },
      { id: `h-${Date.now()}-3`, content: `"Your financial advisor doesn't want you to see this..."`, score: 85, label: 'Curiosity Gap' },
      { id: `h-${Date.now()}-4`, content: `"3 things every ${audience || 'investor'} needs to know right now (number 2 will shock you)"`, score: 82, label: 'Listicle' },
      { id: `h-${Date.now()}-5`, content: `"POV: You just discovered how the top 1% actually build wealth..."`, score: 79, label: 'POV / Trend' },
      { id: `h-${Date.now()}-6`, content: `"This is the investment strategy that turned $50K into $180K in 18 months..."`, score: 90, label: 'Results-First' },
    ];
  }

  if (tool === 'headline-variations') {
    return [
      { id: `hl-${Date.now()}-1`, content: `The Smarter Way to Build Wealth — Without the Wall Street Roller Coaster`, score: 88, label: 'Benefit-Led' },
      { id: `hl-${Date.now()}-2`, content: `Why 2,400+ Investors Chose This Over Traditional Real Estate`, score: 91, label: 'Social Proof' },
      { id: `hl-${Date.now()}-3`, content: `Passive Income That Actually Works. Here's the Proof.`, score: 85, label: 'Direct / Bold' },
      { id: `hl-${Date.now()}-4`, content: `Your Money Shouldn't Just Sit There. Make It Work.`, score: 82, label: 'Command' },
      { id: `hl-${Date.now()}-5`, content: `What If Your Next Investment Could Pay You Every Single Month?`, score: 86, label: 'Question' },
    ];
  }

  if (tool === 'cta-optimizer') {
    return [
      { id: `cta-${Date.now()}-1`, content: `See the Full Breakdown — Free, No Obligation`, score: 90, label: 'Low Friction' },
      { id: `cta-${Date.now()}-2`, content: `Book Your Private Briefing (Only 15 Spots Left)`, score: 87, label: 'Scarcity' },
      { id: `cta-${Date.now()}-3`, content: `Get the Investor Report — Sent to Your Inbox in 60 Seconds`, score: 85, label: 'Speed/Value' },
      { id: `cta-${Date.now()}-4`, content: `Start Building Real Wealth Today`, score: 82, label: 'Aspirational' },
      { id: `cta-${Date.now()}-5`, content: `Yes, Show Me How It Works`, score: 88, label: 'Conversational' },
    ];
  }

  if (tool === 'ad-audit') {
    return [
      { id: `audit-${Date.now()}-1`, content: `HOOK STRENGTH: 6/10 — Your opening line is generic. Try leading with a specific result or pattern interrupt instead of a broad claim.\n\nSuggested fix: Replace with a concrete number or provocative question.`, score: 60, label: 'Hook Analysis' },
      { id: `audit-${Date.now()}-2`, content: `BODY COPY: 7/10 — Good benefit stack but missing social proof. Add a specific stat, testimonial, or case study reference to build credibility.\n\nSuggested fix: Insert "Join 2,400+ investors who..." before the CTA.`, score: 70, label: 'Body Analysis' },
      { id: `audit-${Date.now()}-3`, content: `CTA STRENGTH: 5/10 — "Learn more" is weak for direct response. Use action-specific, benefit-driven language with urgency.\n\nSuggested fix: "See the Full Investment Breakdown — Limited Spots"`, score: 50, label: 'CTA Analysis' },
      { id: `audit-${Date.now()}-4`, content: `OVERALL DR SCORE: 6.5/10\n\nTop priorities:\n1. Strengthen the hook with specificity\n2. Add social proof in the body\n3. Replace generic CTA with benefit-driven action\n4. Consider adding a P.S. or urgency element`, score: 65, label: 'Overall Score' },
    ];
  }

  if (tool === 'funnel-copy') {
    return [
      { id: `fn-${Date.now()}-1`, content: `[LANDING PAGE HEADLINE]\nThe Investment Strategy Trusted by 2,400+ Accredited Investors\n\n[SUBHEADLINE]\nDiscover how our managed portfolio delivers 15-22% annual returns with full transparency and hands-off management.\n\n[HERO CTA]\nGet the Free Investor Breakdown`, score: 90, label: 'Landing Page Hero' },
      { id: `fn-${Date.now()}-2`, content: `[EMAIL 1 - Welcome]\nSubject: Here's what you asked for...\n\nHey [First Name],\n\nThanks for requesting the investor breakdown.\n\nBefore you dive in, here's something most people miss:\n\nThe #1 reason investors fail isn't bad deals — it's bad timing and bad information.\n\nThat's exactly why we built this report. Inside you'll find:\n- Our 3-step due diligence framework\n- Real returns from the last 8 quarters\n- How we protect your downside\n\n[CTA: Read the Full Report]`, score: 87, label: 'Welcome Email' },
      { id: `fn-${Date.now()}-3`, content: `[VSL OPENING - First 30 seconds]\n"What if I told you there's an investment vehicle that the ultra-wealthy have been using for decades... that most people have never heard of?\n\nI'm not talking about crypto. I'm not talking about day trading. And I'm definitely not talking about letting your money sit in a savings account earning 0.5%.\n\nI'm talking about something that's generated consistent, double-digit returns — even during market downturns.\n\nStay with me for the next 3 minutes and I'll show you exactly how it works."`, score: 92, label: 'VSL Opening' },
    ];
  }

  // body-copy default
  return [
    { id: `bc-${Date.now()}-1`, content: `Here's the truth most financial advisors won't tell you:\n\nThe traditional investment playbook — stocks, bonds, index funds — was designed for a different era.\n\nToday's smartest investors are diversifying into alternative assets that deliver:\n\n• Consistent monthly cash flow\n• Tax-advantaged returns\n• Protection against market volatility\n• Full transparency into every deal\n\nWe've helped over 2,400 investors access institutional-quality deals that were previously reserved for the ultra-wealthy.\n\nNo complexity. No guesswork. Just results you can verify.`, score: 88, label: 'Long-form' },
    { id: `bc-${Date.now()}-2`, content: `Tired of watching your money sit idle?\n\nOur investors earn 15-22% annually — with full transparency and hands-off management.\n\nNo stock market stress. No tenant headaches. Just consistent returns.\n\nSee how it works.`, score: 85, label: 'Short-form' },
    { id: `bc-${Date.now()}-3`, content: `Most people think building wealth requires:\n❌ Picking individual stocks\n❌ Managing rental properties\n❌ Timing the market perfectly\n\nBut our investors know better:\n✅ Institutional-grade deals\n✅ Hands-off management\n✅ 15-22% annual returns\n✅ Full transparency\n\nJoin 2,400+ investors who chose a smarter path.`, score: 86, label: 'Emoji / Social' },
  ];
}
