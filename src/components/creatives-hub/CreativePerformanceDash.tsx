import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  Image,
  BarChart3,
  ArrowUpRight,
  Search,
  Filter,
  Eye,
  MousePointerClick,
  DollarSign,
  Layers,
  Trophy,
  Star,
} from 'lucide-react';
import type { Client } from '@/hooks/useClients';

interface Creative {
  id: string;
  title: string;
  type: string;
  status: string;
  platform: string;
  file_url: string | null;
  client_id: string | null;
  ai_performance_score: number | null;
  created_at: string;
}

interface CreativePerformanceDashProps {
  clients: Client[];
  creatives: Creative[];
}

export function CreativePerformanceDash({ clients, creatives }: CreativePerformanceDashProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');

  const getClientName = (clientId: string | null) => {
    if (!clientId) return 'Unassigned';
    return clients.find(c => c.id === clientId)?.name || 'Unknown';
  };

  const scoredCreatives = useMemo(() => {
    return creatives
      .filter(c => {
        if (filterClient !== 'all' && c.client_id !== filterClient) return false;
        if (filterPlatform !== 'all' && c.platform !== filterPlatform) return false;
        if (filterType !== 'all' && c.type !== filterType) return false;
        if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.ai_performance_score || 0) - (a.ai_performance_score || 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [creatives, filterClient, filterPlatform, filterType, searchQuery, sortBy]);

  const topScoredCreatives = scoredCreatives.filter(c => c.ai_performance_score && c.ai_performance_score > 0);

  const stats = useMemo(() => {
    const scored = creatives.filter(c => c.ai_performance_score && c.ai_performance_score > 0);
    const avgScore = scored.length > 0 ? scored.reduce((sum, c) => sum + (c.ai_performance_score || 0), 0) / scored.length : 0;
    const platforms = new Set(creatives.map(c => c.platform).filter(Boolean));
    return {
      totalCreatives: creatives.length,
      avgScore: Math.round(avgScore * 10) / 10,
      topScore: scored.length > 0 ? Math.max(...scored.map(c => c.ai_performance_score || 0)) : 0,
      platforms: platforms.size,
      launched: creatives.filter(c => c.status === 'launched').length,
    };
  }, [creatives]);

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Creatives', value: stats.totalCreatives, icon: Layers },
          { label: 'Avg Score', value: stats.avgScore, icon: BarChart3 },
          { label: 'Top Score', value: stats.topScore, icon: Trophy },
          { label: 'Platforms', value: stats.platforms, icon: Eye },
          { label: 'Launched', value: stats.launched, icon: ArrowUpRight },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-xl font-bold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search creatives..."
              className="bg-background/50 rounded-xl h-9"
            />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="bg-background/50 w-40 rounded-xl h-9">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="bg-background/50 w-32 rounded-xl h-9">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="bg-background/50 w-28 rounded-xl h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="copy">Copy</SelectItem>
            </SelectContent>
          </Select>
          <div className="inline-flex items-center bg-muted/50 rounded-full p-0.5 border border-border/50">
            <button
              onClick={() => setSortBy('score')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${sortBy === 'score' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
            >
              By Score
            </button>
            <button
              onClick={() => setSortBy('date')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${sortBy === 'date' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
            >
              By Date
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Creatives grid */}
      {scoredCreatives.length === 0 ? (
        <Card className="border-dashed border-border/50 p-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <h3 className="font-semibold text-muted-foreground mb-1">No creatives match your filters</h3>
          <p className="text-xs text-muted-foreground/60">Try adjusting your search or filter criteria.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {scoredCreatives.map((creative, idx) => {
            const isTop = topScoredCreatives.indexOf(creative) < 3 && sortBy === 'score';
            return (
              <Card
                key={creative.id}
                className={`
                  overflow-hidden group hover:shadow-lg transition-all duration-200 border-border/50 bg-card/50
                  ${isTop ? 'ring-1 ring-primary/20' : ''}
                `}
              >
                <div className="relative aspect-square bg-muted/30 overflow-hidden">
                  {creative.file_url ? (
                    <img src={creative.file_url} alt={creative.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                      <Image className="h-8 w-8" />
                    </div>
                  )}
                  {isTop && (
                    <div className="absolute top-2 left-2">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-foreground text-background text-[10px] font-bold shadow-sm">
                        {topScoredCreatives.indexOf(creative) + 1}
                      </span>
                    </div>
                  )}
                  {creative.ai_performance_score && creative.ai_performance_score > 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[10px] gap-1 font-semibold">
                        <TrendingUp className="h-3 w-3 text-primary" />
                        {creative.ai_performance_score}
                      </Badge>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <CardContent className="p-3">
                  <p className="text-xs font-medium truncate">{creative.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{getClientName(creative.client_id)}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="secondary" className="text-[9px] capitalize">{creative.platform}</Badge>
                    <Badge variant="secondary" className="text-[9px] capitalize">{creative.type}</Badge>
                    <Badge
                      className={`text-[9px] capitalize ml-auto ${
                        creative.status === 'launched' ? 'bg-blue-500/15 text-blue-600 border-blue-500/20' :
                        creative.status === 'approved' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' :
                        'bg-muted text-muted-foreground'
                      }`}
                      variant="outline"
                    >
                      {creative.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
