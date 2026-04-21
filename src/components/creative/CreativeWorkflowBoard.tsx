import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Clock,
  Check,
  X,
  Rocket,
  RefreshCw,
  MessageSquare,
  Image,
  Video,
  Search,
  ChevronRight,
  Eye,
  Download,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAllCreatives } from '@/hooks/useAllCreatives';
import { useClients } from '@/hooks/useClients';
import { useUpdateCreativeStatus } from '@/hooks/useCreatives';
import { toast } from 'sonner';

const PIPELINE_COLUMNS = [
  { id: 'draft', label: 'Draft', color: 'bg-slate-400', bgColor: 'bg-slate-500/5', borderColor: 'border-slate-500/15', textColor: 'text-slate-600 dark:text-slate-400' },
  { id: 'pending', label: 'In Review', color: 'bg-amber-400', bgColor: 'bg-amber-500/5', borderColor: 'border-amber-500/15', textColor: 'text-amber-600 dark:text-amber-400' },
  { id: 'revisions', label: 'Revisions', color: 'bg-orange-400', bgColor: 'bg-orange-500/5', borderColor: 'border-orange-500/15', textColor: 'text-orange-600 dark:text-orange-400' },
  { id: 'approved', label: 'Approved', color: 'bg-green-400', bgColor: 'bg-green-500/5', borderColor: 'border-green-500/15', textColor: 'text-green-600 dark:text-green-400' },
  { id: 'launched', label: 'Launched', color: 'bg-blue-400', bgColor: 'bg-blue-500/5', borderColor: 'border-blue-500/15', textColor: 'text-blue-600 dark:text-blue-400' },
];

export function CreativeWorkflowBoard({ embedded = false }: { embedded?: boolean }) {
  const { data: creatives = [] } = useAllCreatives();
  const { data: clients = [] } = useClients();
  const updateStatus = useUpdateCreativeStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');

  const clientMap = useMemo(() => {
    return clients.reduce((acc, client) => {
      acc[client.id] = client.name;
      return acc;
    }, {} as Record<string, string>);
  }, [clients]);

  const filteredCreatives = useMemo(() => {
    return creatives.filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (clientMap[c.client_id] || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClient = clientFilter === 'all' || c.client_id === clientFilter;
      return matchesSearch && matchesClient;
    });
  }, [creatives, searchQuery, clientFilter, clientMap]);

  const columnCreatives = useMemo(() => {
    return PIPELINE_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filteredCreatives.filter(c => c.status === col.id);
      return acc;
    }, {} as Record<string, typeof creatives>);
  }, [filteredCreatives]);

  const handleStatusChange = (creativeId: string, clientId: string, title: string, newStatus: string) => {
    updateStatus.mutate({
      id: creativeId,
      status: newStatus as any,
      clientId,
      creativeTitle: title,
    });
    toast.success(`Moved to ${newStatus}`);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-3 w-3" />;
      case 'video': return <Video className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  const getNextStatus = (current: string): string | null => {
    const order = ['draft', 'pending', 'approved', 'launched'];
    const idx = order.indexOf(current);
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1e] to-[#0d0d10] p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Creative Pipeline</h2>
              <p className="text-sm text-white/40">Kanban view of your creative workflow — drag creatives across stages</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            {PIPELINE_COLUMNS.map(col => (
              <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.06]">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <span className="text-xs font-medium text-white/60">{col.label}</span>
                <span className="text-xs font-bold text-white/40">{columnCreatives[col.id]?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search creatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-muted/30 border-border/50"
          />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px] h-10 rounded-xl bg-muted/30 border-border/50">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {PIPELINE_COLUMNS.map(col => (
          <div key={col.id} className="flex-shrink-0 w-[280px]">
            {/* Column Header */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl ${col.bgColor} border ${col.borderColor} border-b-0`}>
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                <span className={`text-sm font-semibold ${col.textColor}`}>{col.label}</span>
              </div>
              <span className="text-xs font-bold text-muted-foreground/50">{columnCreatives[col.id]?.length || 0}</span>
            </div>

            {/* Column Content */}
            <ScrollArea className={`h-[500px] border ${col.borderColor} border-t-0 rounded-b-2xl bg-muted/10`}>
              <div className="p-2.5 space-y-2.5">
                {(columnCreatives[col.id] || []).length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-xs text-muted-foreground/40">No creatives</p>
                  </div>
                ) : (
                  (columnCreatives[col.id] || []).map(creative => {
                    const nextStatus = getNextStatus(creative.status);
                    return (
                      <Card key={creative.id} className="rounded-xl border-border/40 hover:shadow-md hover:border-primary/15 transition-all duration-200 group cursor-pointer">
                        <CardContent className="p-3">
                          {/* Creative thumbnail */}
                          {creative.file_url && creative.type === 'image' && (
                            <div className="aspect-video rounded-lg overflow-hidden mb-2.5 bg-muted">
                              <img src={creative.file_url} alt={creative.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {creative.file_url && creative.type === 'video' && (
                            <div className="aspect-video rounded-lg overflow-hidden mb-2.5 bg-muted relative">
                              <video src={creative.file_url} className="w-full h-full object-cover" muted />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-8 w-8 rounded-full bg-black/40 flex items-center justify-center">
                                  <Video className="h-3.5 w-3.5 text-white" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex items-start gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{creative.title}</p>
                              <p className="text-[10px] text-muted-foreground/50 truncate">{clientMap[creative.client_id] || 'Unknown'}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {getTypeIcon(creative.type)}
                              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 rounded-md">{creative.platform}</Badge>
                            </div>
                          </div>

                          {/* Comments & Time */}
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground/40">
                            <span>{formatDistanceToNow(new Date(creative.created_at), { addSuffix: true })}</span>
                            {creative.comments?.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="h-2.5 w-2.5" /> {creative.comments.length}
                              </span>
                            )}
                          </div>

                          {/* Quick advance button */}
                          {nextStatus && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(creative.id, creative.client_id, creative.title, nextStatus);
                              }}
                              className="w-full mt-2 h-7 text-[10px] gap-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Move to {PIPELINE_COLUMNS.find(c => c.id === nextStatus)?.label}
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          )}

                          {creative.source === 'ai-auto' && (
                            <div className="flex items-center gap-1 mt-1.5">
                              <Sparkles className="h-2.5 w-2.5 text-violet-500" />
                              <span className="text-[9px] text-violet-500 font-medium">AI Generated</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
