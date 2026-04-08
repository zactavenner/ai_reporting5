import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Globe,
  TrendingUp,
  Clock,
  DollarSign,
  BarChart3,
  Zap,
  Target,
  Eye,
  Play,
  Image,
  Film,
  Headphones,
  ArrowRight,
  CheckCircle2,
  Info,
  Sparkles,
  Monitor,
  Smartphone,
  Users,
  Star,
} from 'lucide-react';

interface PlatformIntelligenceProps {
  onNavigate?: (section: string) => void;
}

const PLATFORMS = [
  {
    id: 'meta',
    name: 'Meta Ads',
    subtitle: 'Facebook & Instagram',
    color: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
    borderColor: 'border-blue-500/20',
    activeBg: 'bg-blue-500/5',
    stats: { avgCPM: '$8-15', avgCTR: '1.2-2.5%', bestROAS: '3-5x' },
    bestFormats: [
      { format: 'UGC Talking Head', performance: 'Top Performer', icon: Users },
      { format: 'Podcast-Style Video', performance: 'Rising', icon: Headphones },
      { format: 'Static Carousel', performance: 'Consistent', icon: Image },
      { format: 'Before/After Reel', performance: 'High CTR', icon: Film },
    ],
    specs: {
      feed: { ratio: '1:1 or 4:5', duration: '15-60s', fileSize: '4GB max' },
      stories: { ratio: '9:16', duration: '15s optimal', fileSize: '4GB max' },
      reels: { ratio: '9:16', duration: '30-90s', fileSize: '4GB max' },
    },
    bestPractices: [
      'Lead with pattern interrupts in the first 3 seconds',
      'Use UGC-style content — native feel outperforms polished ads 2:1',
      'Test 3-5 hooks per winning body; hooks determine 80% of performance',
      'Carousel ads drive 72% more engagement than single image',
      'Use Advantage+ placements and let Meta optimize delivery',
      'Dynamic creative testing outperforms manual A/B by 30%',
    ],
    trending: ['AI-generated UGC avatars', 'Podcast clip ads', 'Text-overlay reels', 'Green screen reaction format'],
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    subtitle: 'TikTok For Business',
    color: 'from-pink-500 to-rose-600',
    iconBg: 'bg-pink-500/15',
    iconColor: 'text-pink-500',
    borderColor: 'border-pink-500/20',
    activeBg: 'bg-pink-500/5',
    stats: { avgCPM: '$5-12', avgCTR: '1.5-3.0%', bestROAS: '2-6x' },
    bestFormats: [
      { format: 'Native TikTok Style', performance: 'Top Performer', icon: Play },
      { format: 'Creator Spark Ads', performance: 'Best ROAS', icon: Star },
      { format: 'Problem-Solution Hook', performance: 'High CVR', icon: Target },
      { format: 'ASMR / Satisfying', performance: 'Viral Potential', icon: Eye },
    ],
    specs: {
      inFeed: { ratio: '9:16', duration: '21-34s optimal', fileSize: '500MB max' },
      topView: { ratio: '9:16', duration: '5-60s', fileSize: '500MB max' },
      spark: { ratio: '9:16', duration: 'Varies', fileSize: 'Native post' },
    },
    bestPractices: [
      'Don\'t make ads. Make TikToks. Native content wins every time',
      'First 2 seconds decide everything — use text hooks + movement',
      'Vertical 9:16 is non-negotiable; horizontal gets buried',
      'Spark Ads (boosted organic) deliver 40% lower CPA than standard',
      'Use trending sounds and effects to ride algorithmic momentum',
      'Test 3+ creatives per ad group; TikTok needs creative variety',
    ],
    trending: ['Split-screen comparisons', 'AI voice narration', 'Day-in-the-life format', 'Fake podcast clips'],
  },
  {
    id: 'youtube',
    name: 'YouTube Ads',
    subtitle: 'YouTube & Shorts',
    color: 'from-red-500 to-red-600',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500',
    borderColor: 'border-red-500/20',
    activeBg: 'bg-red-500/5',
    stats: { avgCPM: '$10-25', avgCTR: '0.5-1.5%', bestROAS: '4-8x' },
    bestFormats: [
      { format: 'Direct Response Pre-Roll', performance: 'Best ROAS', icon: Target },
      { format: 'YouTube Shorts', performance: 'Fastest Growth', icon: Smartphone },
      { format: 'Long-Form VSL', performance: 'Highest AOV', icon: Monitor },
      { format: 'Podcast-Style Mid-Roll', performance: 'Trust Builder', icon: Headphones },
    ],
    specs: {
      preRoll: { ratio: '16:9', duration: '15-30s (skip), 6s (bumper)', fileSize: '256GB max' },
      shorts: { ratio: '9:16', duration: '15-60s', fileSize: '256GB max' },
      discovery: { ratio: '16:9', duration: 'Any length', fileSize: '256GB max' },
    },
    bestPractices: [
      'First 5 seconds must hook — "Skip" button is your enemy',
      'YouTube viewers accept longer ads; 30-60s can outperform 15s',
      'Use the "Problem → Agitate → Solution → CTA" framework',
      'Companion banners boost recall by 20% — always include them',
      'Shorts ads are massively underpriced; CPMs 40-60% below in-stream',
      'Retarget video viewers with DR ads — warm audiences convert 5x',
    ],
    trending: ['AI narrator explainer ads', 'Shorts repurposed from Reels', 'Podcast clip pre-rolls', 'Testimonial compilations'],
  },
  {
    id: 'google',
    name: 'Google Ads',
    subtitle: 'Search, Display & PMax',
    color: 'from-emerald-500 to-green-600',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    borderColor: 'border-emerald-500/20',
    activeBg: 'bg-emerald-500/5',
    stats: { avgCPM: '$3-8 (Display)', avgCTR: '3-6% (Search)', bestROAS: '5-12x' },
    bestFormats: [
      { format: 'Responsive Search Ads', performance: 'Highest Intent', icon: Target },
      { format: 'Performance Max', performance: 'Best Scale', icon: TrendingUp },
      { format: 'Display Remarketing', performance: 'Low CPA', icon: Eye },
      { format: 'Demand Gen Carousel', performance: 'Rising Star', icon: Image },
    ],
    specs: {
      search: { ratio: 'Text Only', duration: '30 char headline, 90 char desc', fileSize: 'N/A' },
      display: { ratio: '300x250, 728x90, 160x600', duration: 'Static or 30s max', fileSize: '150KB' },
      pmax: { ratio: 'Multiple required', duration: 'Mixed assets', fileSize: 'Various' },
    },
    bestPractices: [
      'Performance Max needs diverse assets: 5+ headlines, 5+ descriptions, images & video',
      'Use negative keywords aggressively — prevent wasted spend',
      'Responsive search ads: pin your best headline to Position 1',
      'Display remarketing with 7-14 day windows delivers best ROI',
      'Demand Gen campaigns rival Meta for prospecting at lower CPMs',
      'AI-generated static ads can fuel PMax asset diversity at scale',
    ],
    trending: ['Demand Gen campaigns', 'AI-powered PMax creative', 'Broad match + smart bidding', 'Video action campaigns'],
  },
];

export function PlatformIntelligence({ onNavigate }: PlatformIntelligenceProps) {
  const [activePlatform, setActivePlatform] = useState('meta');
  const platform = PLATFORMS.find(p => p.id === activePlatform)!;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-black dark:via-slate-950 dark:to-black p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-medium text-blue-400 tracking-wide uppercase">Platform Intelligence</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
            What's Working Right Now
          </h1>
          <p className="text-base text-white/50 max-w-2xl">
            Research-backed best practices, optimal specs, and trending formats across every major ad platform.
            Updated with the latest performance data.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      {/* Platform Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-2xl backdrop-blur-sm border">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePlatform(p.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activePlatform === p.id
                ? 'bg-background shadow-lg shadow-black/5 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${p.color}`} />
            {p.name}
          </button>
        ))}
      </div>

      {/* Platform Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Stats + Best Formats */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className={`rounded-2xl ${platform.borderColor} overflow-hidden`}>
            <div className={`p-5 bg-gradient-to-r ${platform.color} text-white`}>
              <h3 className="text-lg font-semibold mb-1">{platform.name}</h3>
              <p className="text-sm text-white/70">{platform.subtitle}</p>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Avg CPM</p>
                  <p className="text-lg font-bold">{platform.stats.avgCPM}</p>
                </div>
                <div className="text-center border-x">
                  <p className="text-xs text-muted-foreground mb-1">Avg CTR</p>
                  <p className="text-lg font-bold">{platform.stats.avgCTR}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Best ROAS</p>
                  <p className="text-lg font-bold text-green-600">{platform.stats.bestROAS}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Best Performing Formats */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Formats</h3>
            <div className="space-y-2">
              {platform.bestFormats.map((fmt, idx) => {
                const Icon = fmt.icon;
                return (
                  <Card key={idx} className="rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer group">
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg ${platform.iconBg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`h-4 w-4 ${platform.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{fmt.format}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5 px-1.5">{fmt.performance}</Badge>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Trending Now */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trending Now</h3>
            <div className="flex flex-wrap gap-2">
              {platform.trending.map((trend, idx) => (
                <Badge key={idx} variant="outline" className="px-3 py-1.5 text-xs font-medium rounded-full gap-1.5">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  {trend}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Middle Column: Best Practices */}
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Best Practices</h3>
            <div className="space-y-3">
              {platform.bestPractices.map((practice, idx) => (
                <div key={idx} className="flex gap-3 p-3.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <CheckCircle2 className={`h-4 w-4 ${platform.iconColor} flex-shrink-0 mt-0.5`} />
                  <p className="text-sm leading-relaxed">{practice}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Specs */}
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Creative Specs</h3>
            <div className="space-y-3">
              {Object.entries(platform.specs).map(([placement, spec]) => (
                <Card key={placement} className="rounded-xl overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`px-4 py-2.5 ${platform.activeBg} border-b`}>
                      <p className="text-sm font-semibold capitalize">{placement.replace(/([A-Z])/g, ' $1').trim()}</p>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ratio</span>
                        <span className="font-medium">{spec.ratio}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{spec.duration}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">File Size</span>
                        <span className="font-medium">{spec.fileSize}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          {onNavigate && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Create</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 rounded-xl"
                  onClick={() => onNavigate('ai-scripts')}
                >
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Write Script for {platform.name}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 rounded-xl"
                  onClick={() => onNavigate('direct-response')}
                >
                  <Target className="h-4 w-4 text-rose-500" />
                  Generate Hooks for {platform.name}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 rounded-xl"
                  onClick={() => onNavigate('static-ads')}
                >
                  <Image className="h-4 w-4 text-blue-500" />
                  Create Ads for {platform.name}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
