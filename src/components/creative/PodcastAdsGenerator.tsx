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
  Mic,
  Headphones,
  Sparkles,
  Play,
  Download,
  Copy,
  Check,
  Loader2,
  Radio,
  Volume2,
  Clock,
  Users,
  Bookmark,
  Lightbulb,
  TrendingUp,
  BarChart3,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const PODCAST_STYLES = [
  { id: 'host-read', label: 'Host-Read Ad', description: 'Natural read by a single host, like a personal recommendation', icon: Mic, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'interview-clip', label: 'Interview Clip', description: 'Two-person conversation style, Q&A format', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'narrative', label: 'Narrative Story', description: 'Story-driven format with ambient sound design', icon: Radio, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'dynamic-insert', label: 'Dynamic Insert', description: 'Short, punchy pre-roll/mid-roll ad spot', icon: Volume2, color: 'text-green-500', bg: 'bg-green-500/10' },
];

const VOICE_TONES = [
  { id: 'warm-friendly', label: 'Warm & Friendly' },
  { id: 'authoritative', label: 'Authoritative' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'calm-trusted', label: 'Calm & Trusted' },
  { id: 'casual-relatable', label: 'Casual & Relatable' },
  { id: 'premium', label: 'Premium / Luxury' },
];

const DURATIONS = [
  { id: '15', label: ':15 Pre-Roll' },
  { id: '30', label: ':30 Mid-Roll' },
  { id: '60', label: ':60 Standard' },
  { id: '90', label: ':90 Extended' },
];

const DISTRIBUTION_PLATFORMS = [
  { name: 'Spotify', reach: '602M+', bestFor: 'Dynamic inserts, branded content', growth: '+18%' },
  { name: 'Apple Podcasts', reach: '28M+', bestFor: 'Host-reads, premium audiences', growth: '+8%' },
  { name: 'YouTube Podcasts', reach: '2.7B+', bestFor: 'Video podcasts, interview clips', growth: '+42%' },
  { name: 'iHeartRadio', reach: '150M+', bestFor: 'Mass reach, pre-roll spots', growth: '+12%' },
];

interface GeneratedPodcastAd {
  id: string;
  style: string;
  duration: string;
  script: string;
  speakerNotes: string;
  soundDesign: string;
}

export function PodcastAdsGenerator() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState('');
  const [productName, setProductName] = useState('');
  const [offerDetails, setOfferDetails] = useState('');
  const [targetListener, setTargetListener] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedTone, setSelectedTone] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('60');
  const [promoCode, setPromoCode] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<GeneratedPodcastAd[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    if (!productName || !offerDetails || !selectedStyle) {
      toast.error('Please fill in the product name, offer details, and select a style');
      return;
    }

    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const duration = DURATIONS.find(d => d.id === selectedDuration)?.label || ':60';
    const style = PODCAST_STYLES.find(s => s.id === selectedStyle)?.label || selectedStyle;

    const ads: GeneratedPodcastAd[] = [
      {
        id: `pod-${Date.now()}-1`,
        style,
        duration,
        script: generatePodcastScript(selectedStyle, productName, offerDetails, targetListener, selectedDuration, promoCode, landingUrl),
        speakerNotes: generateSpeakerNotes(selectedStyle, selectedTone),
        soundDesign: generateSoundDesign(selectedStyle),
      },
      {
        id: `pod-${Date.now()}-2`,
        style: `${style} (Variation B)`,
        duration,
        script: generatePodcastScriptB(selectedStyle, productName, offerDetails, targetListener, selectedDuration, promoCode, landingUrl),
        speakerNotes: generateSpeakerNotes(selectedStyle, selectedTone),
        soundDesign: generateSoundDesign(selectedStyle),
      },
    ];

    setGeneratedAds(ads);
    setIsGenerating(false);
    toast.success('2 podcast ad variations generated');
  };

  const handleCopy = (ad: GeneratedPodcastAd) => {
    const fullText = `STYLE: ${ad.style}\nDURATION: ${ad.duration}\n\n--- SCRIPT ---\n${ad.script}\n\n--- SPEAKER NOTES ---\n${ad.speakerNotes}\n\n--- SOUND DESIGN ---\n${ad.soundDesign}`;
    navigator.clipboard.writeText(fullText);
    setCopiedId(ad.id);
    toast.success('Script copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = (ad: GeneratedPodcastAd) => {
    setSavedIds(prev => new Set([...prev, ad.id]));
    toast.success('Script saved to library');
  };

  return (
    <div className="space-y-8">
      {/* Hero Header — Apple-style */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-orange-500/8 via-amber-500/4 to-yellow-500/8 border border-orange-500/15 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 rounded-2xl bg-orange-500/15 flex items-center justify-center">
              <Headphones className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Podcast Ad Generator</h2>
              <p className="text-sm text-muted-foreground">Create compelling podcast ads — host-reads, interview clips, narrative stories, and dynamic inserts</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px]" />
      </div>

      {/* Distribution Platform Intelligence */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Platform Reach & Distribution</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {DISTRIBUTION_PLATFORMS.map(platform => (
            <div key={platform.name} className="p-4 rounded-2xl border bg-card hover:bg-muted/30 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{platform.name}</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full text-green-600 border-green-500/20 bg-green-500/5">
                  <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                  {platform.growth}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground/80">{platform.reach}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Best for: {platform.bestFor}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration */}
        <div className="space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">Product / Brand Name</label>
              <Input
                placeholder="e.g., Westfield Capital"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="h-11 rounded-xl border-border/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">Promo Code (optional)</label>
              <Input
                placeholder="e.g., INVEST50"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="h-11 rounded-xl border-border/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground/80">Offer Details</label>
            <Textarea
              placeholder="What's the offer? Include key benefits, unique value proposition, and any specific details the host should mention..."
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              className="min-h-[100px] rounded-xl resize-none border-border/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">Target Listener</label>
              <Input
                placeholder="e.g., Business owners, 35-55"
                value={targetListener}
                onChange={(e) => setTargetListener(e.target.value)}
                className="h-11 rounded-xl border-border/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">Landing URL</label>
              <Input
                placeholder="e.g., brand.com/podcast"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                className="h-11 rounded-xl border-border/60"
              />
            </div>
          </div>

          {/* Podcast Style */}
          <div className="space-y-3">
            <label className="text-[13px] font-medium text-foreground/80">Ad Style</label>
            <div className="grid grid-cols-2 gap-3">
              {PODCAST_STYLES.map(style => {
                const isSelected = selectedStyle === style.id;
                const Icon = style.icon;
                return (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all duration-200 ${
                      isSelected
                        ? `${style.bg} border-current/20 shadow-sm`
                        : 'bg-background hover:bg-muted/30 border-border/60'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? style.bg : 'bg-muted/60'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? style.color : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? style.color : ''}`}>{style.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration & Tone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="text-[13px] font-medium text-foreground/80">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDuration(d.id)}
                    className={`px-3 py-2.5 text-xs font-medium rounded-xl border transition-all duration-200 ${
                      selectedDuration === d.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-border/60'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[13px] font-medium text-foreground/80">Voice Tone</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_TONES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTone(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
                      selectedTone === t.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-border/60'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Style-specific tip */}
          {selectedStyle && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
              <Lightbulb className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selectedStyle === 'host-read' && 'Host-read ads convert 4.4x better than standard ads. Keep it conversational — the best host-reads sound like genuine recommendations, not scripts.'}
                {selectedStyle === 'interview-clip' && 'Interview-style ads build trust through dialogue. Let the "guest" share authentic experiences. Keep it under 90 seconds for best retention.'}
                {selectedStyle === 'narrative' && 'Narrative ads have the highest recall rate (71%). Use ambient sounds sparingly — the story should carry the weight, not the production.'}
                {selectedStyle === 'dynamic-insert' && 'Dynamic inserts allow A/B testing and geo-targeting. Keep it tight (15-30s), lead with the strongest benefit, and end with a clear CTA + promo code.'}
              </p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !productName || !offerDetails || !selectedStyle}
            className="w-full h-12 rounded-xl text-[15px] font-medium gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-lg shadow-orange-500/20 transition-all duration-300"
          >
            {isGenerating ? (
              <><Loader2 className="h-5 w-5 animate-spin" />Generating Podcast Ads...</>
            ) : (
              <><Sparkles className="h-5 w-5" />Generate Podcast Ads</>
            )}
          </Button>
        </div>

        {/* Generated Ads */}
        <div className="space-y-4">
          {generatedAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8">
              <div className="h-16 w-16 rounded-[20px] bg-orange-500/8 flex items-center justify-center mb-4">
                <Headphones className="h-8 w-8 text-orange-500/40" />
              </div>
              <p className="text-muted-foreground font-medium">Your podcast ads will appear here</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Configure your settings and hit generate</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Mic className="h-5 w-5 text-orange-500" />
                  Generated Ads
                </h3>
                <span className="text-xs text-muted-foreground">{generatedAds.length} variations</span>
              </div>
              {generatedAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden rounded-2xl border-orange-500/15 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b bg-orange-500/[0.03]">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                          <Mic className="h-4 w-4 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{ad.style}</p>
                          <p className="text-xs text-muted-foreground">{ad.duration}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSave(ad)}
                          className="gap-1.5 h-8 rounded-lg"
                          disabled={savedIds.has(ad.id)}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${savedIds.has(ad.id) ? 'fill-current text-orange-500' : ''}`} />
                          {savedIds.has(ad.id) ? 'Saved' : 'Save'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleCopy(ad)} className="gap-1.5 h-8 rounded-lg">
                          {copiedId === ad.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === ad.id ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-2">Script</p>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{ad.script}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/10">
                          <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Speaker Notes</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{ad.speakerNotes}</p>
                        </div>
                        <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/10">
                          <p className="text-[11px] font-semibold text-purple-500 uppercase tracking-wider mb-1.5">Sound Design</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{ad.soundDesign}</p>
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
    </div>
  );
}

function generatePodcastScript(style: string, product: string, offer: string, audience: string, duration: string, promo: string, url: string): string {
  const promoLine = promo ? `Use code ${promo} at checkout for an exclusive listener discount.` : '';
  const urlLine = url ? `Head to ${url} to learn more.` : '';

  if (style === 'host-read') {
    return `[HOST]\nAlright, I want to tell you about something I've been really impressed with lately — ${product}.\n\nYou know, ${offer}\n\nAnd here's what I love about it — it's built for people like us. ${audience ? `Specifically, ${audience} who want results without the hassle.` : ''}\n\nI've talked to their team personally, and the way they operate is exactly what you'd want — transparent, professional, and focused on delivering real value.\n\n${promoLine}\n${urlLine}\n\nSeriously, check them out. You won't regret it.`;
  }

  if (style === 'interview-clip') {
    return `[HOST]\nSo tell me, what makes ${product} different from everything else out there?\n\n[GUEST]\nGreat question. ${offer}\n\nWhat we've built is specifically for people who are tired of the status quo. ${audience ? `Our typical client is ${audience}.` : ''}\n\n[HOST]\nAnd the results speak for themselves?\n\n[GUEST]\nAbsolutely. We let the numbers do the talking. Every single investor gets full transparency into where their money is going and how it's performing.\n\n[HOST]\n${promoLine} ${urlLine}`;
  }

  if (style === 'narrative') {
    return `[NARRATOR - warm, cinematic]\nImagine waking up knowing your money is working harder than you are.\n\n[SFX: gentle morning ambiance]\n\nThat's the reality for thousands of investors who discovered ${product}.\n\n${offer}\n\n[SFX: subtle uplifting music builds]\n\n${audience ? `Built specifically for ${audience}.` : 'Built for people who want more from their investments.'}\n\nNo complexity. No guesswork. Just results.\n\n[NARRATOR]\n${promoLine}\n${urlLine}\n\n${product}. Invest smarter.`;
  }

  return `[ANNOUNCER]\nThis episode is brought to you by ${product}.\n\n${offer}\n\n${audience ? `If you're ${audience}, this is for you.` : 'If you want real results, this is for you.'}\n\n${promoLine}\n${urlLine}\n\n${product}. The smart way to invest.`;
}

function generatePodcastScriptB(style: string, product: string, offer: string, audience: string, duration: string, promo: string, url: string): string {
  const promoLine = promo ? `And listeners get an exclusive deal with code ${promo}.` : '';
  const urlLine = url ? `Visit ${url} — link in the show notes.` : '';

  return `[HOST]\nQuick break to tell you about ${product} — and honestly, I wish I'd found them sooner.\n\nHere's the deal: ${offer}\n\n${audience ? `If you're ${audience}, pay attention.` : 'If you\'re looking for something that actually delivers, pay attention.'}\n\nWhat I respect about ${product} is they don't overpromise. They let results speak. And from what I've seen, those results are impressive.\n\n${promoLine}\n${urlLine}\n\nOkay, back to the show.`;
}

function generateSpeakerNotes(style: string, tone: string): string {
  const toneLabel = tone || 'conversational';
  return `Tone: ${toneLabel}. Speak naturally as if recommending to a friend. Pause briefly after the hook to let it land. Emphasize the key benefit with vocal variety. The CTA should feel like a genuine suggestion, not a hard sell.`;
}

function generateSoundDesign(style: string): string {
  if (style === 'narrative') return 'Ambient pad underneath, subtle morning SFX (birds, coffee), music swell at CTA. Keep it cinematic but not overpowering.';
  if (style === 'dynamic-insert') return 'Clean, branded intro jingle (2s). Minimal background music. Sharp cut to sponsor message. Outro sting.';
  if (style === 'interview-clip') return 'Natural conversation room tone. Light background music during transitions. No heavy processing — keep it authentic.';
  return 'No music needed for host-read. Natural podcast audio environment. Optional light music bed under CTA only.';
}
