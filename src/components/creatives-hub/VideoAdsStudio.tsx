import { useState, lazy, Suspense } from 'react';
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
  Headphones,
  Camera,
  User,
  Film,
  Sparkles,
  Loader2,
  Play,
  Download,
  Copy,
  Check,
  Mic,
  Users,
  Radio,
  Volume2,
  Video,
  MonitorPlay,
  Eye,
  Wand2,
  Image,
  Layers,
  Smartphone,
  Square,
  ChevronRight,
  RotateCcw,
  Star,
} from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type VideoMode = 'podcast' | 'hyper-realistic' | 'avatar';

const PODCAST_STYLES = [
  { id: 'host-read', label: 'Host-Read Ad', description: 'Natural read by a single host', icon: Mic, gradient: 'from-orange-500 to-amber-600' },
  { id: 'interview-clip', label: 'Interview Clip', description: 'Two-person conversation style', icon: Users, gradient: 'from-blue-500 to-indigo-600' },
  { id: 'narrative', label: 'Narrative Story', description: 'Story-driven with sound design', icon: Radio, gradient: 'from-purple-500 to-violet-600' },
  { id: 'dynamic-insert', label: 'Dynamic Insert', description: 'Short, punchy ad spot', icon: Volume2, gradient: 'from-green-500 to-emerald-600' },
  { id: 'video-podcast', label: 'Video Podcast Clip', description: 'Camera-facing for YouTube & social', icon: Video, gradient: 'from-red-500 to-rose-600' },
  { id: 'audiogram', label: 'Audiogram / Reel', description: 'Waveform visual for social clips', icon: MonitorPlay, gradient: 'from-cyan-500 to-teal-600' },
];

const VISUAL_STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', description: 'Indistinguishable from real photography' },
  { id: 'cinematic', label: 'Cinematic 4K', description: 'Film-grade lighting and color grading' },
  { id: 'editorial', label: 'Editorial', description: 'High-fashion editorial look' },
  { id: 'lifestyle', label: 'Lifestyle Authentic', description: 'Natural, candid UGC feel' },
  { id: 'luxury', label: 'Luxury / Premium', description: 'High-end product showcase' },
  { id: 'tech-modern', label: 'Tech / Modern', description: 'Clean, futuristic aesthetic' },
];

const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16', description: 'Stories / Reels', icon: Smartphone },
  { id: '1:1', label: '1:1', description: 'Feed', icon: Square },
  { id: '16:9', label: '16:9', description: 'YouTube / Desktop', icon: MonitorPlay },
];

interface VideoAdsStudioProps {
  clients: Client[];
}

export function VideoAdsStudio({ clients }: VideoAdsStudioProps) {
  const [activeMode, setActiveMode] = useState<VideoMode>('podcast');
  const [selectedClient, setSelectedClient] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Podcast state
  const [podcastStyle, setPodcastStyle] = useState('host-read');
  const [podcastTopic, setPodcastTopic] = useState('');
  const [podcastScript, setPodcastScript] = useState('');
  const [podcastOutput, setPodcastOutput] = useState('');

  // Hyper-realistic state
  const [visualStyle, setVisualStyle] = useState('photorealistic');
  const [sceneDescription, setSceneDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [hyperOutput, setHyperOutput] = useState('');

  // Avatar state
  const [avatarScript, setAvatarScript] = useState('');
  const [avatarOutput, setAvatarOutput] = useState('');

  const MODE_TABS = [
    { id: 'podcast' as VideoMode, label: 'Podcast Ads', icon: Headphones, gradient: 'from-orange-500 to-amber-600' },
    { id: 'hyper-realistic' as VideoMode, label: 'Hyper-Realistic', icon: Camera, gradient: 'from-cyan-500 to-blue-600' },
    { id: 'avatar' as VideoMode, label: 'Avatar Videos', icon: User, gradient: 'from-violet-500 to-purple-600' },
  ];

  const handlePodcastGenerate = async () => {
    if (!podcastTopic.trim()) { toast.error('Enter a topic'); return; }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ad-script', {
        body: {
          offerDescription: podcastTopic,
          scriptType: `podcast-${podcastStyle}`,
          additionalContext: podcastScript || undefined,
          clientId: selectedClient || undefined,
        },
      });
      if (error) throw error;
      setPodcastOutput(data?.script || data?.content || 'Script generated.');
      toast.success('Podcast script generated');
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleHyperGenerate = async () => {
    if (!sceneDescription.trim()) { toast.error('Describe your scene'); return; }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-asset', {
        body: {
          prompt: sceneDescription,
          style: visualStyle,
          aspectRatio,
          type: 'hyper-realistic',
          clientId: selectedClient || undefined,
        },
      });
      if (error) throw error;
      setHyperOutput(data?.url || data?.imageUrl || 'Asset generated — check your assets library.');
      toast.success('Visual generated');
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAvatarGenerate = async () => {
    if (!avatarScript.trim()) { toast.error('Enter a script'); return; }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-avatar', {
        body: {
          script: avatarScript,
          clientId: selectedClient || undefined,
        },
      });
      if (error) throw error;
      setAvatarOutput(data?.videoUrl || data?.url || 'Avatar video queued for generation.');
      toast.success('Avatar video generation started');
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Mode selector - Apple-style pill tabs */}
      <div className="flex items-center gap-3">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMode(tab.id)}
            className={`
              group flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all duration-200
              ${activeMode === tab.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/50 bg-card/50 hover:border-border hover:shadow-sm'
              }
            `}
          >
            <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${tab.gradient} flex items-center justify-center shadow-sm`}>
              <tab.icon className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-sm font-semibold">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Client selector */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Client</label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="bg-background/50 max-w-xs">
              <SelectValue placeholder="Select client (optional)" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Podcast Ads Mode */}
      {activeMode === 'podcast' && (
        <div className="space-y-6">
          {/* Style selector grid */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Podcast Style</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PODCAST_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setPodcastStyle(style.id)}
                  className={`
                    group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200
                    ${podcastStyle === style.id
                      ? 'border-primary shadow-md'
                      : 'border-border/50 bg-card/50 hover:border-border hover:shadow-sm'
                    }
                  `}
                >
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center mb-3 shadow-sm`}>
                    <style.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold mb-0.5">{style.label}</h3>
                  <p className="text-[11px] text-muted-foreground">{style.description}</p>
                  {podcastStyle === style.id && (
                    <div className="absolute top-3 right-3">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Input/Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Topic / Offer</label>
                  <Textarea
                    value={podcastTopic}
                    onChange={(e) => setPodcastTopic(e.target.value)}
                    placeholder="What is the podcast ad about? Describe the offer..."
                    className="bg-background/50 min-h-[100px] resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Base Script (optional)</label>
                  <Textarea
                    value={podcastScript}
                    onChange={(e) => setPodcastScript(e.target.value)}
                    placeholder="Paste existing script to refine, or leave blank for AI-generated..."
                    className="bg-background/50 min-h-[80px] resize-none"
                  />
                </div>
                <Button
                  className="w-full h-11 rounded-xl font-semibold"
                  onClick={handlePodcastGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {isGenerating ? 'Generating...' : 'Generate Podcast Script'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Generated Script</h3>
                  {podcastOutput && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleCopy(podcastOutput)}>
                      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      Copy
                    </Button>
                  )}
                </div>
                {podcastOutput ? (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{podcastOutput}</pre>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
                    <Headphones className="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">Your podcast script will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Hyper-Realistic Mode */}
      {activeMode === 'hyper-realistic' && (
        <div className="space-y-6">
          {/* Visual style selector */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Visual Style</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {VISUAL_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setVisualStyle(style.id)}
                  className={`
                    group rounded-xl border p-4 text-left transition-all duration-200
                    ${visualStyle === style.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 bg-card/50 hover:border-border hover:shadow-sm'
                    }
                  `}
                >
                  <h3 className="text-sm font-semibold mb-0.5">{style.label}</h3>
                  <p className="text-[11px] text-muted-foreground">{style.description}</p>
                  {visualStyle === style.id && (
                    <Check className="h-3.5 w-3.5 text-primary mt-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Aspect Ratio</label>
            <div className="flex items-center gap-3">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => setAspectRatio(ratio.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all
                    ${aspectRatio === ratio.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 bg-card/50 hover:border-border'
                    }
                  `}
                >
                  <ratio.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <span className="text-sm font-semibold block">{ratio.label}</span>
                    <span className="text-[10px] text-muted-foreground">{ratio.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Scene description + output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Scene Description</label>
                  <Textarea
                    value={sceneDescription}
                    onChange={(e) => setSceneDescription(e.target.value)}
                    placeholder="Describe the hyper-realistic scene you want to create..."
                    className="bg-background/50 min-h-[160px] resize-none"
                  />
                </div>
                <Button
                  className="w-full h-11 rounded-xl font-semibold"
                  onClick={handleHyperGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  {isGenerating ? 'Generating...' : 'Generate Visual'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3">Output</h3>
                {hyperOutput ? (
                  hyperOutput.startsWith('http') ? (
                    <div className="rounded-2xl overflow-hidden bg-muted/30">
                      <img src={hyperOutput} alt="Generated visual" className="w-full h-auto" />
                      <div className="p-3 flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.open(hyperOutput, '_blank')}>
                          <Download className="h-3.5 w-3.5 mr-1" /> Download
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleCopy(hyperOutput)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy URL
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{hyperOutput}</p>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
                    <Camera className="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">Generated visuals will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Avatar Mode */}
      {activeMode === 'avatar' && (
        <div className="space-y-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 px-5 py-4 border-b border-border/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">AI Avatar Video Generator</h3>
                  <p className="text-xs text-muted-foreground">Create talking-head videos with AI avatars</p>
                </div>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Script</label>
                <Textarea
                  value={avatarScript}
                  onChange={(e) => setAvatarScript(e.target.value)}
                  placeholder="Enter the script for your avatar to read..."
                  className="bg-background/50 min-h-[160px] resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  className="flex-1 h-11 rounded-xl font-semibold"
                  onClick={handleAvatarGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {isGenerating ? 'Generating...' : 'Generate Avatar Video'}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => window.open('/avatar-ad-generator', '_blank')}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Full Editor
                </Button>
              </div>
              {avatarOutput && (
                <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                  {avatarOutput.startsWith('http') ? (
                    <video src={avatarOutput} controls className="w-full rounded-xl" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{avatarOutput}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
