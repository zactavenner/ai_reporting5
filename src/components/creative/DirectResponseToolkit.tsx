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
  Star,
  ChevronRight,
  RotateCcw,
  Save,
  Download,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const DR_TOOLS = [
  {
    id: 'hook-generator',
    label: 'Hook Generator',
    description: 'Generate scroll-stopping hooks for ads',
    icon: Flame,
    color: 'from-red-500/15 to-orange-500/10',
    iconColor: 'text-red-500',
    iconBg: 'bg-red-500/15',
    tip: 'The hook determines 80% of ad performance. Test at least 5 hooks per winning body copy.',
  },
  {
    id: 'headline-variations',
    label: 'Headline Variations',
    description: 'A/B test headlines with AI variations',
    icon: Type,
    color: 'from-blue-500/15 to-indigo-500/10',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-500/15',
    tip: 'The best headlines are specific, benefit-driven, and under 10 words. Numbers outperform vague claims.',
  },
  {
    id: 'cta-optimizer',
    label: 'CTA Optimizer',
    description: 'Test and optimize calls-to-action',
    icon: MousePointer,
    color: 'from-green-500/15 to-emerald-500/10',
    iconColor: 'text-green-500',
    iconBg: 'bg-green-500/15',
    tip: 'Action-specific CTAs ("Get the Free Report") convert 3x better than generic ones ("Learn More").',
  },
  {
    id: 'body-copy',
    label: 'Body Copy Writer',
    description: 'Persuasive body copy for any platform',
    icon: AlignLeft,
    color: 'from-purple-500/15 to-violet-500/10',
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-500/15',
    tip: 'Great body copy follows: Problem → Agitate → Solution → Proof → CTA. Keep paragraphs to 2-3 lines.',
  },
  {
    id: 'ad-audit',
    label: 'Ad Copy Audit',
    description: 'AI review of existing ad copy',
    icon: Eye,
    color: 'from-amber-500/15 to-yellow-500/10',
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-500/15',
    tip: 'Paste any ad and get a DR score with specific, actionable improvements for each section.',
  },
  {
    id: 'funnel-copy',
    label: 'Funnel Copy Suite',
    description: 'Complete copy for landing pages, emails, VSLs',
    icon: ArrowDown,
    color: 'from-teal-500/15 to-cyan-500/10',
    iconColor: 'text-teal-500',
    iconBg: 'bg-teal-500/15',
    tip: 'Full-funnel copy consistency increases conversion by 40%. Match the ad promise to the landing page headline.',
  },
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

  const handleCopyAll = () => {
    const all = results.map(r => `[${r.label || 'Variation'}]\n${r.content}`).join('\n\n---\n\n');
    navigator.clipboard.writeText(all);
    toast.success('All variations copied');
  };

  return (
    <div className="space-y-8">
      {/* Apple-Style Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#0a0a0a] p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="absolute top-[-30%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-rose-600/20 via-pink-500/10 to-transparent rounded-full blur-[80px]" />
          <div className="absolute bottom-[-40%] left-[10%] w-[400px] h-[400px] bg-gradient-to-tr from-red-500/10 to-transparent rounded-full blur-[80px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">Direct Response Toolkit</h2>
              <p className="text-[13px] text-white/35">Hooks, headlines, CTAs, body copy & full funnel copywriting — 8 DR frameworks</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 mt-6 flex-wrap">
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <Flame className="h-3 w-3 text-red-400" />Scroll-Stopping Hooks
            </Badge>
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <TrendingUp className="h-3 w-3 text-green-400" />A/B Test Ready
            </Badge>
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <BarChart3 className="h-3 w-3 text-blue-400" />Performance Scored
            </Badge>
          </div>
        </div>
      </div>

      {/* Tool Selection Grid */}
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
                  ? `bg-gradient-to-br ${tool.color} border-primary/20 shadow-lg`
                  : 'bg-card hover:bg-muted/30 border-border/50 hover:shadow-sm'
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                isActive ? tool.iconBg : 'bg-muted/70'
              }`}>
                <Icon className={`h-5 w-5 ${isActive ? tool.iconColor : 'text-muted-foreground/60'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isActive ? '' : 'text-foreground/80'}`}>{tool.label}</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">{tool.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Tool Panel */}
      {selectedTool && (
        <>
          {/* Pro Tip for selected tool */}
          {activeTool?.tip && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-muted/30 border border-border/30">
              <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Pro Tip</p>
                <p className="text-sm text-muted-foreground/70 mt-0.5">{activeTool.tip}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input */}
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                {activeTool && (
                  <>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${activeTool.iconBg}`}>
                      <activeTool.icon className={`h-4 w-4 ${activeTool.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-bold">{activeTool.label}</h3>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Client</label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/50">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
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
                  className="min-h-[140px] rounded-xl resize-none bg-muted/30 border-border/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Target Audience</label>
                  <Input placeholder="e.g., Business owners, 35-55" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Platform</label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/50">
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

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !inputText}
                className="w-full h-13 rounded-2xl text-base font-semibold gap-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 shadow-lg shadow-rose-500/20 transition-all duration-300"
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
                  <div className="h-16 w-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4">
                    <Zap className="h-8 w-8 text-rose-500/40" />
                  </div>
                  <p className="text-muted-foreground/70 font-semibold">Results will appear here</p>
                  <p className="text-sm text-muted-foreground/40 mt-1">Fill in the details and generate</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{results.length} Variations</h3>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={handleCopyAll} className="gap-1.5 text-xs rounded-lg">
                        <Copy className="h-3 w-3" />
                        Copy All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleGenerate} className="gap-1.5 text-xs rounded-lg">
                        <RotateCcw className="h-3 w-3" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                  {results.map((item) => (
                    <Card key={item.id} className="overflow-hidden rounded-2xl border-border/50 hover:shadow-md transition-all duration-200 group">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {item.label && (
                              <Badge variant="outline" className="text-[10px] mb-2.5 rounded-lg font-semibold">{item.label}</Badge>
                            )}
                            <p className="text-sm leading-relaxed whitespace-pre-line">{item.content}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            {item.score !== undefined && (
                              <div className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                                item.score >= 85 ? 'bg-green-500/10 text-green-600' :
                                item.score >= 70 ? 'bg-blue-500/10 text-blue-600' :
                                item.score >= 50 ? 'bg-amber-500/10 text-amber-600' :
                                'bg-red-500/10 text-red-600'
                              }`}>
                                <Star className="h-3 w-3" />
                                {item.score}
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(item)}
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {copiedId === item.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
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
    'funnel-copy': 'Describe your offer, target market, and funnel structure (landing page > email > VSL)...',
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
    { id: `bc-${Date.now()}-1`, content: `Here's the truth most financial advisors won't tell you:\n\nThe traditional investment playbook — stocks, bonds, index funds — was designed for a different era.\n\nToday's smartest investors are diversifying into alternative assets that deliver:\n\n- Consistent monthly cash flow\n- Tax-advantaged returns\n- Protection against market volatility\n- Full transparency into every deal\n\nWe've helped over 2,400 investors access institutional-quality deals that were previously reserved for the ultra-wealthy.\n\nNo complexity. No guesswork. Just results you can verify.`, score: 88, label: 'Long-form' },
    { id: `bc-${Date.now()}-2`, content: `Tired of watching your money sit idle?\n\nOur investors earn 15-22% annually — with full transparency and hands-off management.\n\nNo stock market stress. No tenant headaches. Just consistent returns.\n\nSee how it works.`, score: 85, label: 'Short-form' },
    { id: `bc-${Date.now()}-3`, content: `Most people think building wealth requires:\n- Picking individual stocks\n- Managing rental properties\n- Timing the market perfectly\n\nBut our investors know better:\n+ Institutional-grade deals\n+ Hands-off management\n+ 15-22% annual returns\n+ Full transparency\n\nJoin 2,400+ investors who chose a smarter path.`, score: 86, label: 'Comparison / Social' },
  ];
}
