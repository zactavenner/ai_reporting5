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
  Camera,
  Eye,
  Loader2,
  Download,
  Settings2,
  Film,
  Image,
  Wand2,
  Layers,
  MonitorPlay,
  Smartphone,
  Square,
  Star,
  Lightbulb,
  RotateCcw,
  ChevronRight,
  Check,
  Save,
  Copy,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const VISUAL_STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', description: 'Indistinguishable from real photography', tip: 'Best for product ads and lifestyle scenes' },
  { id: 'cinematic', label: 'Cinematic 4K', description: 'Film-grade lighting and color grading', tip: 'Best for brand storytelling and hero content' },
  { id: 'editorial', label: 'Editorial / Magazine', description: 'High-fashion editorial look', tip: 'Best for luxury and premium brands' },
  { id: 'lifestyle', label: 'Lifestyle Authentic', description: 'Natural, candid feel like real UGC', tip: 'Best for social media and Meta ads' },
  { id: 'luxury', label: 'Luxury / Premium', description: 'High-end product showcase aesthetic', tip: 'Best for finance, real estate, and premium offers' },
  { id: 'tech-modern', label: 'Tech / Modern', description: 'Clean, futuristic tech aesthetic', tip: 'Best for SaaS and tech products' },
];

const SCENE_TYPES = [
  { id: 'product-hero', label: 'Product Hero Shot' },
  { id: 'lifestyle-scene', label: 'Lifestyle Scene' },
  { id: 'testimonial-setting', label: 'Testimonial Setting' },
  { id: 'before-after', label: 'Before / After' },
  { id: 'comparison', label: 'Side-by-Side Comparison' },
  { id: 'environment', label: 'Environment / Location' },
  { id: 'data-overlay', label: 'Data Overlay Visual' },
  { id: 'social-proof', label: 'Social Proof Mockup' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1', icon: Square, description: 'Feed' },
  { id: '4:5', label: '4:5', icon: Smartphone, description: 'Instagram' },
  { id: '9:16', label: '9:16', icon: Smartphone, description: 'Story/Reel' },
  { id: '16:9', label: '16:9', icon: MonitorPlay, description: 'YouTube' },
];

interface GeneratedVisual {
  id: string;
  style: string;
  scene: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  status: 'generating' | 'complete' | 'error';
  imageUrl?: string;
}

export function HyperRealisticAds() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [productDetails, setProductDetails] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [customPrompt, setCustomPrompt] = useState('');
  const [colorPalette, setColorPalette] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVisuals, setGeneratedVisuals] = useState<GeneratedVisual[]>([]);
  const [batchCount, setBatchCount] = useState(4);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedStyleData = VISUAL_STYLES.find(s => s.id === selectedStyle);

  const toggleScene = (sceneId: string) => {
    setSelectedScenes(prev =>
      prev.includes(sceneId)
        ? prev.filter(s => s !== sceneId)
        : prev.length < 4 ? [...prev, sceneId] : prev
    );
  };

  const handleCopyPrompt = (visual: GeneratedVisual) => {
    navigator.clipboard.writeText(visual.prompt);
    setCopiedId(visual.id);
    toast.success('Prompt copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerate = async () => {
    if (!brandDescription || !selectedStyle || selectedScenes.length === 0) {
      toast.error('Please describe the brand, select a style, and choose at least one scene type');
      return;
    }

    setIsGenerating(true);

    const visuals: GeneratedVisual[] = selectedScenes.flatMap((sceneId) => {
      const scene = SCENE_TYPES.find(s => s.id === sceneId)?.label || sceneId;
      const style = VISUAL_STYLES.find(s => s.id === selectedStyle)?.label || selectedStyle;

      return Array.from({ length: Math.ceil(batchCount / selectedScenes.length) }, (_, i) => ({
        id: `vis-${Date.now()}-${sceneId}-${i}`,
        style,
        scene,
        prompt: buildPrompt(selectedStyle, sceneId, brandDescription, productDetails, customPrompt, colorPalette),
        negativePrompt: 'text, watermark, logo, blurry, low quality, distorted, deformed, ugly, duplicate, morbid, mutilated, extra fingers, poorly drawn, mutation',
        aspectRatio: selectedRatio,
        status: 'complete' as const,
      }));
    }).slice(0, batchCount);

    await new Promise(resolve => setTimeout(resolve, 2000));

    setGeneratedVisuals(visuals);
    setIsGenerating(false);
    toast.success(`${visuals.length} hyper-realistic visuals generated`);
  };

  return (
    <div className="space-y-8">
      {/* Apple-Style Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#0a0a0a] p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="absolute top-[-30%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-cyan-600/20 via-blue-500/10 to-transparent rounded-full blur-[80px]" />
          <div className="absolute bottom-[-40%] left-[10%] w-[400px] h-[400px] bg-gradient-to-tr from-teal-500/10 to-transparent rounded-full blur-[80px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Camera className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">Hyper-Realistic Visuals</h2>
              <p className="text-[13px] text-white/35">Photorealistic AI imagery — product shots, lifestyle scenes & cinematic content</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 mt-6 flex-wrap">
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <Eye className="h-3 w-3 text-cyan-400" />Photorealistic
            </Badge>
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <Layers className="h-3 w-3 text-blue-400" />Multi-Scene Batch
            </Badge>
            <Badge className="bg-white/[0.05] text-white/70 border-white/[0.06] backdrop-blur-xl gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium">
              <Film className="h-3 w-3 text-violet-400" />Video-Ready
            </Badge>
          </div>

          {/* Style-specific tip */}
          {selectedStyleData && (
            <div className="mt-6 flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.06] backdrop-blur-xl">
              <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{selectedStyleData.label} Style</p>
                <p className="text-[13px] text-white/45 mt-0.5">{selectedStyleData.tip}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-5">
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
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Brand / Company</label>
            <Textarea placeholder="Describe the brand: industry, aesthetic, target market, brand values..." value={brandDescription} onChange={(e) => setBrandDescription(e.target.value)} className="min-h-[100px] rounded-xl resize-none bg-muted/30 border-border/50" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Product / Offer</label>
            <Input placeholder="e.g., Luxury lakefront investment property in Lake Tahoe" value={productDetails} onChange={(e) => setProductDetails(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Color Palette</label>
            <Input placeholder="e.g., Navy blue, gold accents, white" value={colorPalette} onChange={(e) => setColorPalette(e.target.value)} className="h-11 rounded-xl bg-muted/30 border-border/50" />
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Visual Style</label>
            <div className="grid grid-cols-2 gap-1.5">
              {VISUAL_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                    selectedStyle === style.id
                      ? 'bg-cyan-500/10 border-cyan-500/30 shadow-sm'
                      : 'bg-muted/20 hover:bg-muted/40 border-border/50'
                  }`}
                >
                  <p className={`text-xs font-semibold ${selectedStyle === style.id ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>{style.label}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Aspect Ratio</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map(ratio => {
                const Icon = ratio.icon;
                return (
                  <button
                    key={ratio.id}
                    onClick={() => setSelectedRatio(ratio.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all duration-200 ${
                      selectedRatio === ratio.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-muted/20 hover:bg-muted/40 border-border/50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-bold">{ratio.label}</span>
                    <span className={`text-[9px] ${selectedRatio === ratio.id ? 'text-background/60' : 'text-muted-foreground/50'}`}>{ratio.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Batch Count */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Batch Size</label>
            <div className="flex gap-1.5">
              {[2, 4, 8, 12].map(n => (
                <button
                  key={n}
                  onClick={() => setBatchCount(n)}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-all duration-200 ${
                    batchCount === n
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/20 hover:bg-muted/40 border-border/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Additional Instructions</label>
            <Textarea placeholder="Add specific visual details, props, settings, lighting notes..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className="min-h-[80px] rounded-xl resize-none bg-muted/30 border-border/50" />
          </div>
        </div>

        {/* Right: Scene Selection & Output */}
        <div className="lg:col-span-3 space-y-6">
          {/* Scene Types */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Scene Types <span className="text-muted-foreground/40 normal-case">(up to 4)</span></label>
              <span className="text-xs font-bold text-muted-foreground/50">{selectedScenes.length}/4</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SCENE_TYPES.map(scene => {
                const isSelected = selectedScenes.includes(scene.id);
                return (
                  <button
                    key={scene.id}
                    onClick={() => toggleScene(scene.id)}
                    className={`px-3 py-3 text-xs font-semibold rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                        : 'bg-muted/20 hover:bg-muted/40 border-border/50'
                    }`}
                  >
                    {scene.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !brandDescription || !selectedStyle || selectedScenes.length === 0}
            className="w-full h-13 rounded-2xl text-base font-semibold gap-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 shadow-lg shadow-cyan-500/20 transition-all duration-300"
          >
            {isGenerating ? (
              <><Loader2 className="h-5 w-5 animate-spin" />Generating {batchCount} Visuals...</>
            ) : (
              <><Sparkles className="h-5 w-5" />Generate {batchCount} Hyper-Realistic Visuals</>
            )}
          </Button>

          {/* Generated Visuals Grid */}
          {generatedVisuals.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Camera className="h-5 w-5 text-cyan-500" />
                  Generated Visuals
                </h3>
                <Button variant="ghost" size="sm" onClick={handleGenerate} className="gap-1.5 text-xs rounded-lg">
                  <RotateCcw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {generatedVisuals.map(visual => (
                  <Card key={visual.id} className="overflow-hidden rounded-2xl border-border/50 group hover:shadow-lg transition-all duration-300">
                    <div className="aspect-square bg-gradient-to-br from-muted/30 to-muted/60 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center p-4">
                          <Camera className="h-10 w-10 text-cyan-500/25 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground/50 font-medium">AI Visual Preview</p>
                          <p className="text-[10px] text-muted-foreground/30 mt-1">{visual.aspectRatio}</p>
                        </div>
                      </div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" className="rounded-lg gap-1 shadow-lg">
                          <Eye className="h-3 w-3" />Preview
                        </Button>
                        <Button variant="secondary" size="sm" className="rounded-lg gap-1 shadow-lg">
                          <Download className="h-3 w-3" />Save
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 rounded-lg">{visual.style}</Badge>
                        <Badge variant="outline" className="text-[10px] rounded-lg">{visual.scene}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] gap-1 px-2 rounded-md"
                          onClick={() => handleCopyPrompt(visual)}
                        >
                          {copiedId === visual.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === visual.id ? 'Copied' : 'Copy prompt'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8">
              <div className="h-16 w-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-4">
                <Camera className="h-8 w-8 text-cyan-500/40" />
              </div>
              <p className="text-muted-foreground/70 font-semibold">Your visuals will appear here</p>
              <p className="text-sm text-muted-foreground/40 mt-1">Select style, scenes, and generate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPrompt(style: string, scene: string, brand: string, product: string, custom: string, colors: string): string {
  const styleMap: Record<string, string> = {
    'photorealistic': 'Ultra photorealistic, 8K resolution, natural lighting, shot on Canon EOS R5',
    'cinematic': 'Cinematic 4K, anamorphic lens, dramatic lighting, film color grading, shallow depth of field',
    'editorial': 'High-fashion editorial photography, studio lighting, clean composition, magazine quality',
    'lifestyle': 'Authentic lifestyle photography, natural light, candid feel, warm tones, relatable',
    'luxury': 'Luxury product photography, dramatic lighting, premium materials, elegant composition, gold accents',
    'tech-modern': 'Clean modern tech aesthetic, minimalist, cool tones, futuristic, precise lighting',
  };

  const sceneMap: Record<string, string> = {
    'product-hero': 'Hero product shot, centered composition, dramatic lighting on subject',
    'lifestyle-scene': 'Lifestyle scene with person interacting with product, natural environment',
    'testimonial-setting': 'Professional testimonial setting, clean background, confident subject',
    'before-after': 'Split composition showing transformation, clear visual contrast',
    'comparison': 'Side-by-side comparison layout, equal emphasis on both sides',
    'environment': 'Wide establishing shot of location/environment, architectural detail',
    'data-overlay': 'Modern data visualization overlaid on real-world scene',
    'social-proof': 'Social media mockup with engagement metrics, authentic feel',
  };

  const parts = [
    styleMap[style] || 'Photorealistic, high quality',
    sceneMap[scene] || scene,
    brand,
    product,
    colors ? `Color palette: ${colors}` : '',
    custom,
    'professional advertising photography, award-winning composition',
  ].filter(Boolean);

  return parts.join('. ');
}
