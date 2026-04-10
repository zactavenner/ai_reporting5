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
  Radar,
  Instagram,
  Search,
  ExternalLink,
  TrendingUp,
  Eye,
  Globe,
  ArrowRight,
  Sparkles,
  Download,
  Filter,
  Loader2,
  BookOpen,
  FileText,
  BarChart3,
} from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ResearchMode = 'scraper' | 'swipe-file' | 'trends';

interface AdResearchCenterProps {
  clients: Client[];
}

export function AdResearchCenter({ clients }: AdResearchCenterProps) {
  const [activeMode, setActiveMode] = useState<ResearchMode>('scraper');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const MODE_TABS = [
    { id: 'scraper' as ResearchMode, label: 'Ad Scraper', icon: Radar, description: 'Scrape competitor ads from Meta & more', gradient: 'from-indigo-500 to-blue-600' },
    { id: 'swipe-file' as ResearchMode, label: 'Swipe File', icon: BookOpen, description: 'Curated inspiration library', gradient: 'from-amber-500 to-orange-600' },
    { id: 'trends' as ResearchMode, label: 'Platform Intel', icon: TrendingUp, description: 'Instagram & ad platform trends', gradient: 'from-pink-500 to-rose-600' },
  ];

  const handleSearch = async () => {
    if (!searchQuery.trim()) { toast.error('Enter a search query'); return; }
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-fb-ads', {
        body: {
          query: searchQuery,
          clientId: selectedClient || undefined,
        },
      });
      if (error) throw error;
      setResults(data?.ads || data?.results || []);
      toast.success(`Found ${data?.ads?.length || 0} ads`);
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode selector */}
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
              <tab.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold block">{tab.label}</span>
              <span className="text-[10px] text-muted-foreground">{tab.description}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Ad Scraper */}
      {activeMode === 'scraper' && (
        <div className="space-y-4">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search competitor brand, product, or keyword..."
                    className="bg-background/50 h-11 rounded-xl"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="bg-background/50 w-48 rounded-xl">
                    <SelectValue placeholder="Client filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="h-11 px-6 rounded-xl font-semibold"
                  onClick={handleSearch}
                  disabled={isSearching}
                >
                  {isSearching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick links to full tools */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Meta Ad Library Scraper', desc: 'Deep scrape from Facebook Ad Library', icon: Globe, href: '/ad-scraping' },
              { label: 'Instagram Intel', desc: 'Instagram trend & creative analysis', icon: Instagram, href: '/instagram-intel' },
              { label: 'Ad Variations', desc: 'Generate variations of winning ads', icon: Sparkles, href: '/ad-variations' },
            ].map((tool) => (
              <button
                key={tool.label}
                onClick={() => window.open(tool.href, '_blank')}
                className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 text-left hover:shadow-sm hover:border-border transition-all"
              >
                <tool.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium">{tool.label}</h4>
                  <p className="text-[11px] text-muted-foreground">{tool.desc}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
              </button>
            ))}
          </div>

          {/* Results grid */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map((ad: any, idx: number) => (
                <Card key={idx} className="overflow-hidden border-border/50 bg-card/50 group hover:shadow-md transition-all">
                  <div className="aspect-square bg-muted/30 relative overflow-hidden">
                    {ad.image_url || ad.thumbnail ? (
                      <img src={ad.image_url || ad.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Eye className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-3 left-3 right-3">
                        <Button size="sm" variant="secondary" className="w-full h-8 text-xs rounded-lg">
                          <Download className="h-3 w-3 mr-1" /> Save to Swipe File
                        </Button>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium truncate">{ad.advertiser_name || ad.brand || 'Unknown Brand'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{ad.ad_text || ad.headline || ''}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {results.length === 0 && !isSearching && (
            <Card className="border-dashed border-border/50 p-12 text-center">
              <Radar className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
              <h3 className="font-semibold text-muted-foreground mb-1">Search competitor ads</h3>
              <p className="text-xs text-muted-foreground/60 max-w-[300px] mx-auto">
                Enter a brand name, product, or keyword to discover and analyze competitor ad creatives.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Swipe File */}
      {activeMode === 'swipe-file' && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm p-8 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
          <h3 className="font-semibold mb-1">Swipe File</h3>
          <p className="text-sm text-muted-foreground mb-4">Your curated library of winning ad inspiration</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" className="rounded-xl" onClick={() => window.open('/ad-scraping', '_blank')}>
              <Search className="h-4 w-4 mr-2" /> Find Ads to Save
            </Button>
          </div>
        </Card>
      )}

      {/* Platform Trends */}
      {activeMode === 'trends' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Instagram Intelligence', desc: 'Analyze trending content, hashtags, and creative patterns', icon: Instagram, href: '/instagram-intel', gradient: 'from-pink-500 to-rose-600' },
            { label: 'Meta Ad Library', desc: 'Browse and analyze active ads across Facebook & Instagram', icon: Globe, href: '/ad-scraping', gradient: 'from-blue-500 to-indigo-600' },
          ].map((platform) => (
            <button
              key={platform.label}
              onClick={() => window.open(platform.href, '_blank')}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 text-left hover:shadow-lg transition-all"
            >
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center mb-4 shadow-sm`}>
                <platform.icon className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-base font-semibold mb-1">{platform.label}</h3>
              <p className="text-sm text-muted-foreground">{platform.desc}</p>
              <ArrowRight className="absolute top-6 right-6 h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
