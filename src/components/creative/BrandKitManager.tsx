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
  Palette,
  Type,
  Image,
  Volume2,
  FileText,
  Plus,
  Check,
  X,
  ChevronRight,
  Save,
  Sparkles,
  Globe,
  Target,
  Lightbulb,
  Eye,
  Copy,
  Trash2,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';

interface BrandKitManagerProps {
  clientId?: string;
}

interface BrandKit {
  id: string;
  clientId: string;
  clientName: string;
  colors: { hex: string; name: string; usage: string }[];
  fonts: { name: string; usage: string; weight: string }[];
  voiceTone: string;
  targetAudience: string;
  brandValues: string;
  dosAndDonts: { dos: string[]; donts: string[] };
  logoUrl?: string;
  style: string;
}

const DEFAULT_BRAND_KIT: Omit<BrandKit, 'id' | 'clientId' | 'clientName'> = {
  colors: [
    { hex: '#1a1a2e', name: 'Primary Dark', usage: 'Backgrounds, headers' },
    { hex: '#e94560', name: 'Accent Red', usage: 'CTAs, highlights' },
    { hex: '#0f3460', name: 'Deep Blue', usage: 'Body text, secondary' },
    { hex: '#f5f5f5', name: 'Light Gray', usage: 'Backgrounds, cards' },
  ],
  fonts: [
    { name: 'Inter', usage: 'Headlines', weight: '700' },
    { name: 'Inter', usage: 'Body copy', weight: '400' },
  ],
  voiceTone: 'Professional yet approachable. Confident without being aggressive. Data-driven with a human touch.',
  targetAudience: '',
  brandValues: '',
  dosAndDonts: {
    dos: ['Use specific numbers and results', 'Lead with the benefit', 'Include social proof'],
    donts: ['Use hype language without proof', 'Make guarantees we can\'t back up', 'Use all caps excessively'],
  },
  style: 'premium',
};

const STYLE_OPTIONS = [
  { id: 'premium', label: 'Premium / Luxury', description: 'Elegant, sophisticated' },
  { id: 'bold', label: 'Bold / Direct', description: 'High-contrast, attention-grabbing' },
  { id: 'minimal', label: 'Minimal / Clean', description: 'Whitespace-forward, modern' },
  { id: 'warm', label: 'Warm / Friendly', description: 'Approachable, trust-building' },
  { id: 'tech', label: 'Tech / Modern', description: 'Futuristic, innovative' },
  { id: 'editorial', label: 'Editorial', description: 'Magazine-quality, story-driven' },
];

export function BrandKitManager({ clientId }: BrandKitManagerProps) {
  const { data: clients = [] } = useClients();
  const [selectedClientId, setSelectedClientId] = useState(clientId || '');
  const [editMode, setEditMode] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#');
  const [newColorName, setNewColorName] = useState('');

  // In a real app this would come from Supabase. Using local state for demo.
  const [brandKits, setBrandKits] = useState<Record<string, BrandKit>>({});

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const currentKit = selectedClientId ? brandKits[selectedClientId] : undefined;

  const initializeKit = () => {
    if (!selectedClientId || !selectedClient) return;
    const kit: BrandKit = {
      ...DEFAULT_BRAND_KIT,
      id: `kit-${Date.now()}`,
      clientId: selectedClientId,
      clientName: selectedClient.name,
      colors: selectedClient.brand_colors?.length
        ? selectedClient.brand_colors.map((hex: string, i: number) => ({ hex, name: `Color ${i + 1}`, usage: '' }))
        : DEFAULT_BRAND_KIT.colors,
      fonts: selectedClient.brand_fonts?.length
        ? selectedClient.brand_fonts.map((name: string) => ({ name, usage: 'General', weight: '400' }))
        : DEFAULT_BRAND_KIT.fonts,
      targetAudience: selectedClient.target_audience || '',
    };
    setBrandKits(prev => ({ ...prev, [selectedClientId]: kit }));
    setEditMode(true);
    toast.success(`Brand kit initialized for ${selectedClient.name}`);
  };

  const updateKit = (updates: Partial<BrandKit>) => {
    if (!selectedClientId) return;
    setBrandKits(prev => ({
      ...prev,
      [selectedClientId]: { ...prev[selectedClientId], ...updates },
    }));
  };

  const addColor = () => {
    if (!currentKit || !newColorHex || newColorHex === '#') return;
    updateKit({
      colors: [...currentKit.colors, { hex: newColorHex, name: newColorName || 'New Color', usage: '' }],
    });
    setNewColorHex('#');
    setNewColorName('');
  };

  const removeColor = (index: number) => {
    if (!currentKit) return;
    updateKit({ colors: currentKit.colors.filter((_, i) => i !== index) });
  };

  const handleSave = () => {
    setEditMode(false);
    toast.success('Brand kit saved successfully');
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1d1d1f] via-[#2a2a2e] to-[#1d1d1f] p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <Palette className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Brand Kit Manager</h2>
              <p className="text-sm text-white/40">Define brand identity per client — colors, fonts, voice, and guidelines for consistent AI output</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Palette className="h-3 w-3 text-fuchsia-400" />Color Palettes
            </Badge>
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Type className="h-3 w-3 text-blue-400" />Typography
            </Badge>
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Volume2 className="h-3 w-3 text-green-400" />Voice & Tone
            </Badge>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      {/* Client Selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-sm">
          <Select value={selectedClientId} onValueChange={(v) => { setSelectedClientId(v); setEditMode(false); }}>
            <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-border/50 text-base">
              <SelectValue placeholder="Select a client to manage brand kit" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {client.name?.charAt(0)?.toUpperCase()}
                    </div>
                    {client.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedClientId && !currentKit && (
          <Button onClick={initializeKit} className="gap-2 rounded-xl h-12 px-6 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-700 hover:to-purple-700">
            <Plus className="h-4 w-4" />
            Create Brand Kit
          </Button>
        )}
        {currentKit && !editMode && (
          <Button onClick={() => setEditMode(true)} variant="outline" className="gap-2 rounded-xl h-12">
            Edit Kit
          </Button>
        )}
        {currentKit && editMode && (
          <Button onClick={handleSave} className="gap-2 rounded-xl h-12 bg-gradient-to-r from-fuchsia-600 to-purple-600">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        )}
      </div>

      {/* No client selected state */}
      {!selectedClientId && (
        <div className="text-center py-20">
          <div className="h-20 w-20 rounded-3xl bg-fuchsia-500/10 flex items-center justify-center mx-auto mb-5">
            <Palette className="h-10 w-10 text-fuchsia-500/30" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground/70">Select a client to manage their brand kit</p>
          <p className="text-sm text-muted-foreground/40 mt-1">Brand kits ensure all AI-generated content stays on-brand</p>
        </div>
      )}

      {/* No kit yet state */}
      {selectedClientId && !currentKit && (
        <div className="text-center py-20">
          <div className="h-20 w-20 rounded-3xl bg-fuchsia-500/10 flex items-center justify-center mx-auto mb-5">
            <Plus className="h-10 w-10 text-fuchsia-500/30" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground/70">No brand kit yet for {selectedClient?.name}</p>
          <p className="text-sm text-muted-foreground/40 mt-1">Create one to keep all AI creatives on-brand</p>
        </div>
      )}

      {/* Brand Kit Editor */}
      {currentKit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ─── Color Palette ─── */}
          <Card className="rounded-2xl border-border/50 overflow-hidden">
            <div className="p-5 border-b bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-fuchsia-500/15 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-fuchsia-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Color Palette</h3>
                  <p className="text-[11px] text-muted-foreground/60">Brand colors used across all AI content</p>
                </div>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {currentKit.colors.map((color, i) => (
                  <div
                    key={i}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-border/30 hover:border-border/60 transition-colors"
                  >
                    <div
                      className="h-10 w-10 rounded-xl border shadow-sm flex-shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{color.name}</p>
                      <p className="text-[10px] text-muted-foreground/50 font-mono">{color.hex}</p>
                      {color.usage && (
                        <p className="text-[10px] text-muted-foreground/40 truncate">{color.usage}</p>
                      )}
                    </div>
                    {editMode && (
                      <button onClick={() => removeColor(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {editMode && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                  <input
                    type="color"
                    value={newColorHex === '#' ? '#000000' : newColorHex}
                    onChange={(e) => setNewColorHex(e.target.value)}
                    className="h-9 w-9 rounded-lg cursor-pointer border-0"
                  />
                  <Input
                    placeholder="Color name"
                    value={newColorName}
                    onChange={(e) => setNewColorName(e.target.value)}
                    className="h-9 text-xs rounded-lg flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addColor} className="h-9 rounded-lg gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Typography ─── */}
          <Card className="rounded-2xl border-border/50 overflow-hidden">
            <div className="p-5 border-b bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Type className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Typography</h3>
                  <p className="text-[11px] text-muted-foreground/60">Font families and weights</p>
                </div>
              </div>
            </div>
            <CardContent className="p-5 space-y-3">
              {currentKit.fonts.map((font, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/30">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-500">Aa</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold">{font.name}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {font.usage} · Weight: {font.weight}
                    </p>
                  </div>
                </div>
              ))}
              {editMode && (
                <Button size="sm" variant="outline" className="w-full rounded-lg gap-1 mt-2">
                  <Plus className="h-3 w-3" /> Add Font
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ─── Voice & Tone ─── */}
          <Card className="rounded-2xl border-border/50 overflow-hidden">
            <div className="p-5 border-b bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-green-500/15 flex items-center justify-center">
                  <Volume2 className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Voice & Tone</h3>
                  <p className="text-[11px] text-muted-foreground/60">How the brand speaks in all content</p>
                </div>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              {editMode ? (
                <Textarea
                  value={currentKit.voiceTone}
                  onChange={(e) => updateKit({ voiceTone: e.target.value })}
                  placeholder="Describe the brand voice and tone..."
                  className="min-h-[100px] rounded-xl resize-none bg-muted/20 border-border/30 text-sm"
                />
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">{currentKit.voiceTone}</p>
              )}

              {/* Visual Style */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Visual Style</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLE_OPTIONS.map(style => (
                    <button
                      key={style.id}
                      onClick={() => editMode && updateKit({ style: style.id })}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                        currentKit.style === style.id
                          ? 'bg-green-500/10 border-green-500/30'
                          : editMode ? 'bg-muted/20 hover:bg-muted/40 border-border/30' : 'bg-muted/10 border-border/20'
                      } ${!editMode && currentKit.style !== style.id ? 'opacity-40' : ''}`}
                    >
                      <p className="text-xs font-semibold">{style.label}</p>
                      <p className="text-[10px] text-muted-foreground/50">{style.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Brand Guidelines ─── */}
          <Card className="rounded-2xl border-border/50 overflow-hidden">
            <div className="p-5 border-b bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Creative Guidelines</h3>
                  <p className="text-[11px] text-muted-foreground/60">Do's and don'ts for AI content generation</p>
                </div>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              {/* Do's */}
              <div>
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Check className="h-3 w-3" /> Do's
                </p>
                <div className="space-y-1.5">
                  {currentKit.dosAndDonts.dos.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
                      <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {editMode ? (
                        <Input
                          value={item}
                          onChange={(e) => {
                            const newDos = [...currentKit.dosAndDonts.dos];
                            newDos[i] = e.target.value;
                            updateKit({ dosAndDonts: { ...currentKit.dosAndDonts, dos: newDos } });
                          }}
                          className="h-6 text-xs border-0 bg-transparent p-0 focus-visible:ring-0"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{item}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Don'ts */}
              <div>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <X className="h-3 w-3" /> Don'ts
                </p>
                <div className="space-y-1.5">
                  {currentKit.dosAndDonts.donts.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                      <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      {editMode ? (
                        <Input
                          value={item}
                          onChange={(e) => {
                            const newDonts = [...currentKit.dosAndDonts.donts];
                            newDonts[i] = e.target.value;
                            updateKit({ dosAndDonts: { ...currentKit.dosAndDonts, donts: newDonts } });
                          }}
                          className="h-6 text-xs border-0 bg-transparent p-0 focus-visible:ring-0"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{item}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="pt-3 border-t border-border/20">
                <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="h-3 w-3" /> Target Audience
                </label>
                {editMode ? (
                  <Textarea
                    value={currentKit.targetAudience}
                    onChange={(e) => updateKit({ targetAudience: e.target.value })}
                    placeholder="Describe the ideal customer profile..."
                    className="mt-2 min-h-[60px] rounded-xl resize-none bg-muted/20 border-border/30 text-sm"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {currentKit.targetAudience || 'Not specified'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
