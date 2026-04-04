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
  Clapperboard,
  Eye,
  Loader2,
  Download,
  RotateCcw,
  Settings2,
  Film,
  Image,
  Wand2,
  Layers,
  MonitorPlay,
  Smartphone,
  Square,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

const VISUAL_STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', description: 'Indistinguishable from real photography' },
  { id: 'cinematic', label: 'Cinematic 4K', description: 'Film-grade lighting and color grading' },
  { id: 'editorial', label: 'Editorial / Magazine', description: 'High-fashion editorial look' },
  { id: 'lifestyle', label: 'Lifestyle Authentic', description: 'Natural, candid feel like real UGC' },
  { id: 'luxury', label: 'Luxury / Premium', description: 'High-end product showcase aesthetic' },
  { id: 'tech-modern', label: 'Tech / Modern', description: 'Clean, futuristic tech aesthetic' },
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

  const toggleScene = (sceneId: string) => {
    setSelectedScenes(prev =>
      prev.includes(sceneId)
        ? prev.filter(s => s !== sceneId)
        : prev.length < 4 ? [...prev, sceneId] : prev
    );
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

    // Simulate generation delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    setGeneratedVisuals(visuals);
    setIsGenerating(false);
    toast.success(`${visuals.length} hyper-realistic visuals generated`);
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-indigo-500/10 border border-cyan-500/20 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Camera className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Hyper-Realistic Ad Generator</h2>
              <p className="text-sm text-muted-foreground">Create photorealistic AI visuals for ads — product shots, lifestyle scenes, and cinematic content</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="gap-1 px-3 py-1"><Eye className="h-3 w-3" />Photorealistic Quality</Badge>
            <Badge variant="outline" className="gap-1 px-3 py-1"><Layers className="h-3 w-3" />Multi-Scene Batch</Badge>
            <Badge variant="outline" className="gap-1 px-3 py-1"><Film className="h-3 w-3" />Video-Ready Frames</Badge>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Brand / Company Description</label>
            <Textarea
              placeholder="Describe the brand: industry, aesthetic, target market, brand values..."
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
              className="min-h-[100px] rounded-xl resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Product / Offer Details</label>
            <Input
              placeholder="e.g., Luxury lakefront investment property in Lake Tahoe"
              value={productDetails}
              onChange={(e) => setProductDetails(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Color Palette (optional)</label>
            <Input
              placeholder="e.g., Navy blue, gold accents, white"
              value={colorPalette}
              onChange={(e) => setColorPalette(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Visual Style */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Visual Style</label>
            <div className="grid grid-cols-2 gap-2">
              {VISUAL_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                    selectedStyle === style.id
                      ? 'bg-cyan-500/10 border-cyan-500/30 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border'
                  }`}
                >
                  <p className={`text-sm font-medium ${selectedStyle === style.id ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>{style.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Aspect Ratio</label>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(ratio => {
                const Icon = ratio.icon;
                return (
                  <button
                    key={ratio.id}
                    onClick={() => setSelectedRatio(ratio.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all duration-200 ${
                      selectedRatio === ratio.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-border'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{ratio.label}</span>
                    <span className={`text-[10px] ${selectedRatio === ratio.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{ratio.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Batch Count */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Images to Generate</label>
            <div className="flex gap-2">
              {[2, 4, 8, 12].map(n => (
                <button
                  key={n}
                  onClick={() => setBatchCount(n)}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all duration-200 ${
                    batchCount === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted/50 border-border'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Prompt Instructions (optional)</label>
            <Textarea
              placeholder="Add specific visual details, props, settings, lighting notes..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[80px] rounded-xl resize-none"
            />
          </div>
        </div>

        {/* Right: Scene Selection & Output */}
        <div className="lg:col-span-3 space-y-6">
          {/* Scene Types */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Scene Types <span className="text-muted-foreground">(select up to 4)</span></label>
              <Badge variant="outline" className="text-xs">{selectedScenes.length}/4</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SCENE_TYPES.map(scene => {
                const isSelected = selectedScenes.includes(scene.id);
                return (
                  <button
                    key={scene.id}
                    onClick={() => toggleScene(scene.id)}
                    className={`px-3 py-3 text-sm font-medium rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                        : 'bg-background hover:bg-muted/30 border-border'
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
            className="w-full h-12 rounded-xl text-base font-medium gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
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
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Camera className="h-5 w-5 text-cyan-500" />
                Generated Visuals
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {generatedVisuals.map(visual => (
                  <Card key={visual.id} className="overflow-hidden rounded-2xl border-cyan-500/10 group">
                    <div className="aspect-square bg-gradient-to-br from-muted/50 to-muted relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center p-4">
                          <Camera className="h-10 w-10 text-cyan-500/30 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">AI Visual Preview</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{visual.aspectRatio}</p>
                        </div>
                      </div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" className="rounded-lg gap-1">
                          <Eye className="h-3 w-3" />Preview
                        </Button>
                        <Button variant="secondary" size="sm" className="rounded-lg gap-1">
                          <Download className="h-3 w-3" />Save
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="text-xs bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">{visual.style}</Badge>
                        <Badge variant="outline" className="text-xs">{visual.scene}</Badge>
                      </div>
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                          View prompt
                        </summary>
                        <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted/30 rounded-lg">{visual.prompt}</p>
                      </details>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border-2 border-dashed border-muted-foreground/20 p-8">
              <div className="h-16 w-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-4">
                <Camera className="h-8 w-8 text-cyan-500/50" />
              </div>
              <p className="text-muted-foreground font-medium">Your visuals will appear here</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Select style, scenes, and generate</p>
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
