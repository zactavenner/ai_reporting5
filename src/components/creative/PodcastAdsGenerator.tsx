import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
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
  Pause,
  Download,
  Copy,
  Check,
  Loader2,
  Radio,
  Volume2,
  Clock,
  Users,
  Waveform,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const PODCAST_STYLES = [
  { id: 'host-read', label: 'Host-Read Ad', description: 'Natural read by a single host, like a personal recommendation', icon: Mic },
  { id: 'interview-clip', label: 'Interview Clip', description: 'Two-person conversation style, Q&A format', icon: Users },
  { id: 'narrative', label: 'Narrative Story', description: 'Story-driven format with ambient sound design', icon: Radio },
  { id: 'dynamic-insert', label: 'Dynamic Insert', description: 'Short, punchy pre-roll/mid-roll ad spot', icon: Volume2 },
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

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-yellow-500/10 border border-orange-500/20 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Headphones className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Podcast Ad Generator</h2>
              <p className="text-sm text-muted-foreground">Create compelling podcast ads — host-reads, interview clips, narrative stories, and dynamic inserts</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration */}
        <div className="space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Product / Brand Name</label>
              <Input
                placeholder="e.g., Westfield Capital"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Promo Code (optional)</label>
              <Input
                placeholder="e.g., INVEST50"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Offer Details</label>
            <Textarea
              placeholder="What's the offer? Include key benefits, unique value proposition, and any specific details the host should mention..."
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              className="min-h-[100px] rounded-xl resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Listener</label>
              <Input
                placeholder="e.g., Business owners, 35-55"
                value={targetListener}
                onChange={(e) => setTargetListener(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Landing URL</label>
              <Input
                placeholder="e.g., brand.com/podcast"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {/* Podcast Style */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Ad Style</label>
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
                        ? 'bg-orange-500/10 border-orange-500/30 shadow-sm'
                        : 'bg-background hover:bg-muted/30 border-border'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-orange-500/20' : 'bg-muted'
                    }`}>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-orange-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? 'text-orange-600 dark:text-orange-400' : ''}`}>{style.label}</p>
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
              <label className="text-sm font-medium">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDuration(d.id)}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all duration-200 ${
                      selectedDuration === d.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-border'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Voice Tone</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_TONES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTone(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
                      selectedTone === t.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-border'
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
            className="w-full h-12 rounded-xl text-base font-medium gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
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
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-2xl border-2 border-dashed border-muted-foreground/20 p-8">
              <div className="h-16 w-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Headphones className="h-8 w-8 text-orange-500/50" />
              </div>
              <p className="text-muted-foreground font-medium">Your podcast ads will appear here</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Configure your settings and hit generate</p>
            </div>
          ) : (
            generatedAds.map(ad => (
              <Card key={ad.id} className="overflow-hidden rounded-2xl border-orange-500/20">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500/5 to-amber-500/5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <Mic className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{ad.style}</p>
                        <p className="text-xs text-muted-foreground">{ad.duration}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(ad)} className="gap-1.5">
                        {copiedId === ad.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedId === ad.id ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-orange-500 uppercase tracking-wider mb-2">Script</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{ad.script}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl bg-muted/30">
                        <p className="text-xs font-medium text-blue-500 uppercase tracking-wider mb-1">Speaker Notes</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{ad.speakerNotes}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/30">
                        <p className="text-xs font-medium text-purple-500 uppercase tracking-wider mb-1">Sound Design</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{ad.soundDesign}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
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
