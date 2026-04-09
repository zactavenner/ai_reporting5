import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  BookOpen,
  Play,
  Image,
  Film,
  Headphones,
  Mic,
  Eye,
  Heart,
  Star,
  Sparkles,
  ArrowRight,
  Monitor,
  Smartphone,
  TrendingUp,
  Zap,
  Target,
  Clock,
  Users,
  ChevronRight,
  Filter,
  LayoutGrid,
  List,
} from 'lucide-react';

// ─── Template Data ──────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  format: string;
  platform: string[];
  aspectRatio: string;
  duration?: string;
  description: string;
  tags: string[];
  popularity: number;
  isNew: boolean;
  preview: {
    gradient: string;
    icon: any;
  };
}

const TEMPLATES: Template[] = [
  // UGC / Talking Head
  {
    id: 'ugc-problem-solution',
    name: 'UGC Problem-Solution',
    category: 'UGC',
    format: 'video',
    platform: ['meta', 'tiktok'],
    aspectRatio: '9:16',
    duration: '30-60s',
    description: 'Person identifies a pain point, then reveals the solution. Highest converting UGC format for DTC.',
    tags: ['direct-response', 'conversion', 'ugc'],
    popularity: 98,
    isNew: false,
    preview: { gradient: 'from-rose-500 to-pink-600', icon: Users },
  },
  {
    id: 'ugc-unboxing',
    name: 'UGC Unboxing / First Impression',
    category: 'UGC',
    format: 'video',
    platform: ['tiktok', 'meta'],
    aspectRatio: '9:16',
    duration: '15-30s',
    description: 'Authentic unboxing experience with genuine reactions. High engagement on social platforms.',
    tags: ['awareness', 'engagement', 'ugc'],
    popularity: 92,
    isNew: false,
    preview: { gradient: 'from-orange-500 to-amber-600', icon: Eye },
  },
  {
    id: 'ugc-testimonial',
    name: 'UGC Testimonial / Results',
    category: 'UGC',
    format: 'video',
    platform: ['meta', 'youtube'],
    aspectRatio: '9:16',
    duration: '30-60s',
    description: 'Real person sharing their experience and results. Social proof format with high trust.',
    tags: ['social-proof', 'conversion', 'ugc'],
    popularity: 95,
    isNew: false,
    preview: { gradient: 'from-green-500 to-emerald-600', icon: Star },
  },

  // Podcast Ads
  {
    id: 'podcast-host-read',
    name: 'Podcast Host-Read',
    category: 'Podcast',
    format: 'audio',
    platform: ['podcast', 'youtube'],
    aspectRatio: 'audio',
    duration: '60-90s',
    description: 'Natural host-read ad that feels like a personal recommendation. 2x higher conversion than scripted reads.',
    tags: ['podcast', 'audio', 'host-read'],
    popularity: 90,
    isNew: false,
    preview: { gradient: 'from-violet-500 to-purple-600', icon: Mic },
  },
  {
    id: 'podcast-interview',
    name: 'Podcast Interview Clip',
    category: 'Podcast',
    format: 'video',
    platform: ['youtube', 'meta'],
    aspectRatio: '16:9',
    duration: '60-120s',
    description: 'Two-person Q&A style that builds authority and trust. Best for B2B and high-ticket offers.',
    tags: ['podcast', 'interview', 'authority'],
    popularity: 85,
    isNew: false,
    preview: { gradient: 'from-blue-500 to-indigo-600', icon: Headphones },
  },
  {
    id: 'podcast-video-clip',
    name: 'Video Podcast Reel',
    category: 'Podcast',
    format: 'video',
    platform: ['tiktok', 'meta', 'youtube'],
    aspectRatio: '9:16',
    duration: '15-30s',
    description: 'Camera-facing podcast clip optimized for social. #1 rising ad format for thought leadership.',
    tags: ['podcast', 'video', 'reels'],
    popularity: 94,
    isNew: true,
    preview: { gradient: 'from-red-500 to-rose-600', icon: Play },
  },

  // Static Ads
  {
    id: 'static-hero-product',
    name: 'Hero Product Shot',
    category: 'Static',
    format: 'image',
    platform: ['meta', 'google'],
    aspectRatio: '1:1',
    description: 'Premium product-centered static ad with bold headline and CTA. High CTR for retargeting.',
    tags: ['static', 'product', 'retargeting'],
    popularity: 88,
    isNew: false,
    preview: { gradient: 'from-cyan-500 to-blue-600', icon: Image },
  },
  {
    id: 'static-before-after',
    name: 'Before / After Split',
    category: 'Static',
    format: 'image',
    platform: ['meta', 'google'],
    aspectRatio: '1:1',
    description: 'Split-frame before/after comparison. Extremely high CTR for transformation-based offers.',
    tags: ['static', 'comparison', 'transformation'],
    popularity: 91,
    isNew: false,
    preview: { gradient: 'from-amber-500 to-orange-600', icon: TrendingUp },
  },
  {
    id: 'static-data-proof',
    name: 'Data / Results Card',
    category: 'Static',
    format: 'image',
    platform: ['meta', 'linkedin'],
    aspectRatio: '1:1',
    description: 'Numbers-forward creative showcasing key metrics and results. Best for B2B and finance.',
    tags: ['static', 'data', 'social-proof'],
    popularity: 83,
    isNew: false,
    preview: { gradient: 'from-emerald-500 to-teal-600', icon: Target },
  },

  // Hyper-Realistic
  {
    id: 'hyper-lifestyle',
    name: 'AI Lifestyle Scene',
    category: 'Hyper-Realistic',
    format: 'image',
    platform: ['meta', 'google'],
    aspectRatio: '4:5',
    description: 'Photorealistic AI-generated lifestyle scene with product integration. Premium brand feel.',
    tags: ['ai-generated', 'lifestyle', 'premium'],
    popularity: 87,
    isNew: true,
    preview: { gradient: 'from-indigo-500 to-violet-600', icon: Sparkles },
  },
  {
    id: 'hyper-cinematic',
    name: 'Cinematic Brand Hero',
    category: 'Hyper-Realistic',
    format: 'image',
    platform: ['youtube', 'meta'],
    aspectRatio: '16:9',
    description: 'Film-grade AI visual for brand storytelling. Dramatic lighting and color grading.',
    tags: ['ai-generated', 'cinematic', 'brand'],
    popularity: 82,
    isNew: true,
    preview: { gradient: 'from-slate-500 to-zinc-700', icon: Film },
  },

  // Direct Response
  {
    id: 'dr-hook-test',
    name: 'Hook A/B Test Pack',
    category: 'Direct Response',
    format: 'video',
    platform: ['meta', 'tiktok', 'youtube'],
    aspectRatio: '9:16',
    duration: '15-30s',
    description: '5 hook variations for the same body. The hook determines 80% of ad performance.',
    tags: ['direct-response', 'hooks', 'testing'],
    popularity: 96,
    isNew: false,
    preview: { gradient: 'from-pink-500 to-rose-600', icon: Zap },
  },
  {
    id: 'dr-vsl-opening',
    name: 'VSL Opening (First 60s)',
    category: 'Direct Response',
    format: 'video',
    platform: ['youtube', 'meta'],
    aspectRatio: '16:9',
    duration: '60s',
    description: 'The critical first 60 seconds of a Video Sales Letter. Pattern interrupt + curiosity loop.',
    tags: ['direct-response', 'vsl', 'long-form'],
    popularity: 80,
    isNew: false,
    preview: { gradient: 'from-yellow-500 to-orange-600', icon: Monitor },
  },
];

const CATEGORIES = ['All', 'UGC', 'Podcast', 'Static', 'Hyper-Realistic', 'Direct Response'];
const PLATFORMS = ['All', 'meta', 'tiktok', 'youtube', 'google', 'linkedin', 'podcast'];
const FORMATS = ['All', 'video', 'image', 'audio'];

export function TemplateLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlatform, setSelectedPlatform] = useState('All');
  const [selectedFormat, setSelectedFormat] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const filteredTemplates = TEMPLATES.filter(template => {
    if (selectedCategory !== 'All' && template.category !== selectedCategory) return false;
    if (selectedPlatform !== 'All' && !template.platform.includes(selectedPlatform)) return false;
    if (selectedFormat !== 'All' && template.format !== selectedFormat) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        template.name.toLowerCase().includes(q) ||
        template.description.toLowerCase().includes(q) ||
        template.tags.some(t => t.includes(q))
      );
    }
    return true;
  }).sort((a, b) => b.popularity - a.popularity);

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1d1d1f] via-[#2a2a2e] to-[#1d1d1f] p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Template Library</h2>
              <p className="text-sm text-white/40">Proven ad templates for every format, platform, and objective — start creating in seconds</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Users className="h-3 w-3 text-rose-400" />UGC Templates
            </Badge>
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Headphones className="h-3 w-3 text-violet-400" />Podcast Formats
            </Badge>
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Zap className="h-3 w-3 text-amber-400" />Direct Response
            </Badge>
            <Badge className="bg-white/[0.07] text-white/80 border-white/[0.08] backdrop-blur-sm gap-1.5 px-3 py-1 rounded-full text-xs font-medium">
              <Sparkles className="h-3 w-3 text-cyan-400" />AI Visuals
            </Badge>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-teal-500/8 rounded-full blur-3xl" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 ${
                selectedCategory === cat
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/30 hover:bg-muted/50 border-border/50 text-muted-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Secondary filters */}
        <div className="flex items-center gap-2 ml-auto">
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="h-9 w-[130px] rounded-lg text-xs bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map(p => (
                <SelectItem key={p} value={p}>{p === 'All' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedFormat} onValueChange={setSelectedFormat}>
            <SelectTrigger className="h-9 w-[110px] rounded-lg text-xs bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => (
                <SelectItem key={f} value={f}>{f === 'All' ? 'All Formats' : f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-muted/60' : 'hover:bg-muted/30'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-muted/60' : 'hover:bg-muted/30'}`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{filteredTemplates.length}</span> templates found
        </p>
      </div>

      {/* Template Grid */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => {
            const Icon = template.preview.icon;
            return (
              <Card
                key={template.id}
                className="group overflow-hidden rounded-2xl border-border/50 hover:shadow-xl hover:shadow-black/5 hover:border-primary/20 transition-all duration-300 cursor-pointer"
                onClick={() => setSelectedTemplate(template)}
              >
                {/* Preview area */}
                <div className={`relative h-44 bg-gradient-to-br ${template.preview.gradient} p-6`}>
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {template.isNew && (
                          <Badge className="bg-white/25 text-white border-0 text-[10px] font-bold backdrop-blur-sm">
                            NEW
                          </Badge>
                        )}
                        <Badge className="bg-white/20 text-white border-0 text-[10px] font-medium backdrop-blur-sm">
                          {template.format}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {template.platform.slice(0, 3).map(p => (
                          <span key={p} className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded font-medium backdrop-blur-sm">
                            {p}
                          </span>
                        ))}
                        {template.duration && (
                          <span className="text-[10px] text-white/50 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{template.duration}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <Button variant="secondary" size="sm" className="rounded-xl gap-1.5 shadow-lg">
                      <Eye className="h-3.5 w-3.5" />
                      Preview Template
                    </Button>
                  </div>
                </div>

                {/* Info */}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold leading-tight">{template.name}</h3>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      <span className="text-[10px] font-bold text-muted-foreground">{template.popularity}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2">{template.description}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {template.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 rounded-md font-medium">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filteredTemplates.map(template => {
            const Icon = template.preview.icon;
            return (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className="w-full group flex items-center gap-4 p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 hover:border-primary/20 hover:shadow-sm transition-all duration-200 text-left"
              >
                <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${template.preview.gradient} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{template.name}</h3>
                    {template.isNew && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px]">NEW</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{template.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-[9px] rounded-md">{template.category}</Badge>
                    <Badge variant="outline" className="text-[9px] rounded-md">{template.format}</Badge>
                    {template.duration && <span className="text-[10px] text-muted-foreground/40">{template.duration}</span>}
                    <span className="text-[10px] text-muted-foreground/40 ml-auto flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />{template.popularity}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <div className="text-center py-20">
          <Search className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-lg font-semibold text-muted-foreground/70">No templates match your filters</p>
          <p className="text-sm text-muted-foreground/40 mt-1">Try adjusting your search or filters</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedPlatform('All'); setSelectedFormat('All'); }}>
            Clear Filters
          </Button>
        </div>
      )}

      {/* Template Detail Modal (inline for now) */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedTemplate(null)}>
          <Card className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Preview header */}
            <div className={`relative h-56 bg-gradient-to-br ${selectedTemplate.preview.gradient} p-8`}>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div className="flex items-center justify-between">
                  <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    {(() => { const Icon = selectedTemplate.preview.icon; return <Icon className="h-7 w-7 text-white" />; })()}
                  </div>
                  <button onClick={() => setSelectedTemplate(null)} className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                    <span className="text-white text-sm">×</span>
                  </button>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedTemplate.name}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">{selectedTemplate.category}</Badge>
                    <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">{selectedTemplate.format}</Badge>
                    <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">{selectedTemplate.aspectRatio}</Badge>
                    {selectedTemplate.duration && (
                      <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm gap-1">
                        <Clock className="h-3 w-3" />{selectedTemplate.duration}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            </div>

            <CardContent className="p-8 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">About This Template</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedTemplate.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.platform.map(p => (
                      <Badge key={p} variant="outline" className="rounded-lg text-xs capitalize">{p}</Badge>
                    ))}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">Best For</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="rounded-lg text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button className="flex-1 h-12 rounded-2xl text-base font-semibold gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20">
                  <Sparkles className="h-5 w-5" />
                  Use This Template
                </Button>
                <Button variant="outline" className="h-12 rounded-2xl px-6">
                  <Heart className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
