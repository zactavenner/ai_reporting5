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
  Film,
  Eye,
  ChevronRight,
  Star,
  Save,
  RotateCcw,
  Video,
  MonitorPlay,
  Lightbulb,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const PODCAST_STYLES = [
  { id: 'host-read', label: 'Host-Read Ad', description: 'Natural read by a single host, like a personal recommendation', icon: Mic, color: 'from-orange-500/15 to-amber-500/10', iconBg: 'bg-orange-500/15', iconColor: 'text-orange-500' },
  { id: 'interview-clip', label: 'Interview Clip', description: 'Two-person conversation style, Q&A format', icon: Users, color: 'from-blue-500/15 to-indigo-500/10', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-500' },
  { id: 'narrative', label: 'Narrative Story', description: 'Story-driven with ambient sound design', icon: Radio, color: 'from-purple-500/15 to-violet-500/10', iconBg: 'bg-purple-500/15', iconColor: 'text-purple-500' },
  { id: 'dynamic-insert', label: 'Dynamic Insert', description: 'Short, punchy pre/mid-roll ad spot', icon: Volume2, color: 'from-green-500/15 to-emerald-500/10', iconBg: 'bg-green-500/15', iconColor: 'text-green-500' },
  { id: 'video-podcast', label: 'Video Podcast Clip', description: 'Camera-facing clip for YouTube & social', icon: Video, color: 'from-red-500/15 to-rose-500/10', iconBg: 'bg-red-500/15', iconColor: 'text-red-500' },
  { id: 'audiogram', label: 'Audiogram / Reel', description: 'Waveform visual for social media clips', icon: MonitorPlay, color: 'from-cyan-500/15 to-teal-500/10', iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-500' },
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
  { id: '15', label: ':15', sublabel: 'Pre-Roll' },
  { id: '30', label: ':30', sublabel: 'Mid-Roll' },
  { id: '60', label: ':60', sublabel: 'Standard' },
  { id: '90', label: ':90', sublabel: 'Extended' },
];

const PLATFORM_TIPS: Record<string, string> = {
  'host-read': 'Host-read ads convert 2x better when they sound unrehearsed. Let the host use their own words and natural pauses.',
  'interview-clip': 'The best interview ads feel like real conversations, not scripts. Use natural follow-up questions and reactions.',
  'narrative': 'Narrative ads work best at :60-:90. Use ambient sound to create place and emotion before the product mention.',
  'dynamic-insert': 'Dynamic inserts should be punchy and self-contained. Front-load the value prop since listeners may skip.',
  'video-podcast': 'Video podcast clips are the #1 rising ad format. Use split-screen or reaction style for TikTok and Reels.',
  'audiogram': 'Audiograms get 5x more engagement than static posts. Add captions — 85% of social video is watched without sound.',
};

interface GeneratedPodcastAd {
  id: string;
  style: string;
  duration: string;
  script: string;
  speakerNotes: string;
  soundDesign: string;
  performanceScore: number;
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
  const [expandedAd, setExpandedAd] = useState<string | null>(null);

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
        performanceScore: Math.floor(Math.random() * 12) + 82,
      },
      {
        id: `pod-${Date.now()}-2`,
        style: `${style} (Variation B)`,
        duration,
        script: generatePodcastScriptB(selectedStyle, productName, offerDetails, targetListener, selectedDuration, promoCode, landingUrl),
        speakerNotes: generateSpeakerNotes(selectedStyle, selectedTone),
        soundDesign: generateSoundDesign(selectedStyle),
        performanceScore: Math.floor(Math.random() * 12) + 78,
      },
    ];

    setGeneratedAds(ads);
    setExpandedAd(ads[0].id);
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

  return (
    <div className="space-y-8">
      {/* Apple-Style Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#0a0a0a] p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="absolute top-[-30%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-orange-600/20 via-amber-500/10 to-transparent rounded-full blur-[80px]" />
          <div className="absolute bottom-[-40%] left-[10%] w-[400px] h-[400px] bg-gradient-to-tr from-rose-500/10 to-transparent rounded-full blur-[80px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Headphones className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">Podcast Ad Generator</h2>
              <p className="text-[13px] text-white/35">Host-reads, interview clips, video podcasts & audiograms — 6 ad styles</p>
            </div>
          </div>

          {/* Platform tip */}
          {selectedStyle && PLATFORM_TIPS[selectedStyle] && (
            <div className="mt-6 flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.06] backdrop-blur-xl">
              <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Pro Tip</p>
                <p className="text-[13px] text-white/45 mt-0.5">{PLATFORM_TIPS[selectedStyle]}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration */}
        <div className="space-y-5">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Product / Brand</label>
              <Input placeholder="e.g., Westfield Capital" value={productName} onChange={(e) => setProductName(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Promo Code</label>
              <Input placeholder="e.g., INVEST50" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Offer Details</label>
            <Textarea placeholder="What's the offer? Key benefits, unique value proposition, specific details..." value={offerDetails} onChange={(e) => setOfferDetails(e.target.value)} className="min-h-[100px] rounded-xl resize-none bg-muted/30 border-border/50" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Target Listener</label>
              <Input placeholder="e.g., Business owners, 35-55" value={targetListener} onChange={(e) => setTargetListener(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Landing URL</label>
              <Input placeholder="e.g., brand.com/podcast" value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
            </div>
          </div>

          {/* Podcast Style — 3-column grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Ad Style</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PODCAST_STYLES.map(style => {
                const isSelected = selectedStyle === style.id;
                const Icon = style.icon;
                return (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all duration-300 ${
                      isSelected
                        ? `bg-gradient-to-br ${style.color} border-primary/20 shadow-sm`
                        : 'bg-card hover:bg-muted/30 border-border/50'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                      isSelected ? style.iconBg : 'bg-muted/70'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? style.iconColor : 'text-muted-foreground/60'}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isSelected ? '' : 'text-foreground/80'}`}>{style.label}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-clamp-2">{style.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration & Tone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Duration</label>
              <div className="grid grid-cols-4 gap-1.5">
                {DURATIONS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDuration(d.id)}
                    className={`flex flex-col items-center py-2.5 text-center rounded-xl border transition-all duration-200 ${
                      selectedDuration === d.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-muted/30 hover:bg-muted/50 border-border/50'
                    }`}
                  >
                    <span className="text-sm font-bold">{d.label}</span>
                    <span className={`text-[9px] ${selectedDuration === d.id ? 'text-background/60' : 'text-muted-foreground/50'}`}>{d.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Voice Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {VOICE_TONES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTone(t.id)}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-all duration-200 ${
                      selectedTone === t.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-muted/30 hover:bg-muted/50 border-border/50 text-muted-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !productName || !offerDetails || !selectedStyle}
            className="w-full h-13 rounded-2xl text-base font-semibold gap-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-lg shadow-orange-500/20 transition-all duration-300"
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
              <div className="h-16 w-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Headphones className="h-8 w-8 text-orange-500/40" />
              </div>
              <p className="text-muted-foreground/70 font-semibold">Your podcast ads will appear here</p>
              <p className="text-sm text-muted-foreground/40 mt-1">Configure your settings and hit generate</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-orange-500" />
                  Generated Ads
                </h3>
                <Button variant="ghost" size="sm" onClick={handleGenerate} className="gap-1.5 text-xs rounded-lg">
                  <RotateCcw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
              {generatedAds.map(ad => {
                const isExpanded = expandedAd === ad.id;
                return (
                  <Card key={ad.id} className="overflow-hidden rounded-2xl border-border/50 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-0">
                      {/* Header */}
                      <button
                        onClick={() => setExpandedAd(isExpanded ? null : ad.id)}
                        className="w-full flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500/5 to-amber-500/5 hover:from-orange-500/8 hover:to-amber-500/8 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
                            <Mic className="h-4 w-4 text-orange-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{ad.style}</p>
                            <p className="text-xs text-muted-foreground">{ad.duration}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            ad.performanceScore >= 85 ? 'bg-green-500/10 text-green-600' : 'bg-blue-500/10 text-blue-600'
                          }`}>
                            <Star className="h-3 w-3 inline mr-1" />
                            {ad.performanceScore}/100
                          </div>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {/* Expandable Content */}
                      {isExpanded && (
                        <div className="p-5 space-y-5">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                              <p className="text-xs font-bold text-orange-500 uppercase tracking-wider">Script</p>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-line pl-4 border-l-2 border-orange-500/20">{ad.script}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30">
                              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">Speaker Notes</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">{ad.speakerNotes}</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30">
                              <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1.5">Sound Design</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">{ad.soundDesign}</p>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="flex items-center gap-2 pt-3 border-t">
                            <Button variant="outline" size="sm" onClick={() => handleCopy(ad)} className="gap-1.5 rounded-lg">
                              {copiedId === ad.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiedId === ad.id ? 'Copied' : 'Copy Script'}
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

  if (style === 'video-podcast') {
    const audienceLine = audience ? `If you are ${audience}, this is literally made for you.` : 'It just works. No complexity.';
    return `[ON CAMERA - Direct to lens]\n\n"Okay so I have to talk about ${product} because I have been getting a TON of DMs about this."\n\n[Cut to screen share / product visual]\n\n"Here is the deal — ${offer}"\n\n[Back to camera]\n\n"What I love about this is..." ${audienceLine}\n\n[TEXT OVERLAY: Key stats / results]\n\n"Look at these numbers. This is real."\n\n${promoLine}\n${urlLine}\n\n[CTA CARD]\n"Link in bio. Go check it out right now."`;
  }

  if (style === 'audiogram') {
    const audienceLine = audience ? `If you are ${audience}, you need to see this.` : 'Everyone I have recommended this to has thanked me.';
    return `[WAVEFORM VISUAL + CAPTIONS]\n\n"I do not usually talk about sponsors, but ${product} is different..."\n\n[Beat]\n\n"${offer}"\n\n[TEXT OVERLAY fades in: Key benefit]\n\n"${audienceLine}"\n\n[ENGAGEMENT CTA]\n"Drop a comment if you want the link."\n\n${promoLine}\n${urlLine}`;
  }

  const audienceLine = audience ? `If you are ${audience}, this is for you.` : 'If you want real results, this is for you.';
  return `[ANNOUNCER]\nThis episode is brought to you by ${product}.\n\n${offer}\n\n${audienceLine}\n\n${promoLine}\n${urlLine}\n\n${product}. The smart way to invest.`;
}

function generatePodcastScriptB(style: string, product: string, offer: string, audience: string, duration: string, promo: string, url: string): string {
  const promoLine = promo ? `And listeners get an exclusive deal with code ${promo}.` : '';
  const urlLine = url ? `Visit ${url} — link in the show notes.` : '';

  if (style === 'video-podcast') {
    const audienceLine = audience ? `And if you are ${audience}, this hits different.` : 'The results speak for themselves.';
    return `[ON CAMERA - Casual, sitting at desk]\n\n"Real talk — I was skeptical about ${product} at first. But then I saw the numbers."\n\n[B-ROLL: Product / results screenshots]\n\n"${offer}"\n\n[Back to camera, leaning in]\n\n"Here is what sold me..." ${audienceLine}\n\n${promoLine}\n${urlLine}\n\n[PINNED COMMENT CTA]\n"Comment INFO and I will send you the breakdown."`;
  }

  if (style === 'audiogram') {
    const audienceLine = audience ? `For ${audience} specifically, this is a game-changer.` : 'I genuinely cannot believe more people do not know about this.';
    return `[WAVEFORM VISUAL + CAPTIONS]\n\n"Someone asked me what the best investment I made this year was..."\n\n[Beat — waveform pulses]\n\n"Hands down, ${product}. ${offer}"\n\n[TEXT OVERLAY: testimonial quote]\n\n"${audienceLine}"\n\n${promoLine}\n${urlLine}`;
  }

  const audienceLine = audience ? `If you are ${audience}, pay attention.` : 'If you are looking for something that actually delivers, pay attention.';
  return `[HOST]\nQuick break to tell you about ${product} — and honestly, I wish I had found them sooner.\n\nHere is the deal: ${offer}\n\n${audienceLine}\n\nWhat I respect about ${product} is they do not overpromise. They let results speak. And from what I have seen, those results are impressive.\n\n${promoLine}\n${urlLine}\n\nOkay, back to the show.`;
}

function generateSpeakerNotes(style: string, tone: string): string {
  const toneLabel = tone || 'conversational';
  if (style === 'video-podcast') return `Tone: ${toneLabel}. Look directly into camera. Keep energy natural — like you're FaceTiming a friend. Use hand gestures. Pause after key claims to let them land. The CTA should feel casual, not salesy.`;
  if (style === 'audiogram') return `Tone: ${toneLabel}. Speak clearly for caption accuracy. Keep sentences short and punchy — each line becomes a text overlay. Add natural pauses for visual emphasis points.`;
  return `Tone: ${toneLabel}. Speak naturally as if recommending to a friend. Pause briefly after the hook to let it land. Emphasize the key benefit with vocal variety. The CTA should feel like a genuine suggestion, not a hard sell.`;
}

function generateSoundDesign(style: string): string {
  if (style === 'narrative') return 'Ambient pad underneath, subtle morning SFX (birds, coffee), music swell at CTA. Keep it cinematic but not overpowering.';
  if (style === 'dynamic-insert') return 'Clean, branded intro jingle (2s). Minimal background music. Sharp cut to sponsor message. Outro sting.';
  if (style === 'interview-clip') return 'Natural conversation room tone. Light background music during transitions. No heavy processing — keep it authentic.';
  if (style === 'video-podcast') return 'Clean audio capture. Subtle room tone. Text overlays and lower thirds for key stats. B-roll cut-aways during product mentions. Captions throughout.';
  if (style === 'audiogram') return 'Dynamic waveform animation synced to audio. Auto-generated captions. Branded color scheme for overlay. Progress bar at bottom. Platform-optimized aspect ratio (1:1 for feed, 9:16 for stories).';
  return 'No music needed for host-read. Natural podcast audio environment. Optional light music bed under CTA only.';
}
