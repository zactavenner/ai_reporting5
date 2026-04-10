import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Check,
  X,
  Clock,
  Eye,
  Rocket,
  MessageSquare,
  Search,
  ArrowRight,
  ExternalLink,
  Image,
  Video,
  FileText,
  Send,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useUpdateCreativeStatus, useAddCreativeComment } from '@/hooks/useCreatives';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { formatDistanceToNow } from 'date-fns';
import type { Client } from '@/hooks/useClients';
import { toast } from 'sonner';

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
  comments?: any;
}

interface CreativeReviewPortalProps {
  clients: Client[];
  creatives: Creative[];
  statusCounts: {
    all: number;
    pending: number;
    approved: number;
    launched: number;
    revisions: number;
    rejected: number;
  };
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'revisions' | 'rejected' | 'launched';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Check }> = {
  pending: { label: 'Pending', color: 'bg-amber-500/15 text-amber-600 border-amber-500/20', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20', icon: Check },
  launched: { label: 'Launched', color: 'bg-blue-500/15 text-blue-600 border-blue-500/20', icon: Rocket },
  revisions: { label: 'Revisions', color: 'bg-orange-500/15 text-orange-600 border-orange-500/20', icon: RotateCcw },
  rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-600 border-red-500/20', icon: X },
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground border-border', icon: FileText },
};

export function CreativeReviewPortal({ clients, creatives, statusCounts }: CreativeReviewPortalProps) {
  const navigate = useNavigate();
  const { currentMember } = useTeamMember();
  const updateStatus = useUpdateCreativeStatus();
  const addComment = useAddCreativeComment();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterClient, setFilterClient] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [newComment, setNewComment] = useState('');

  const getClientName = (clientId: string | null) => {
    if (!clientId) return 'Unassigned';
    return clients.find(c => c.id === clientId)?.name || 'Unknown';
  };

  const filteredCreatives = useMemo(() => {
    return creatives.filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterClient !== 'all' && c.client_id !== filterClient) return false;
      if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      // Pending first, then by date
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [creatives, filterStatus, filterClient, searchQuery]);

  const handleStatusUpdate = (creativeId: string, status: string) => {
    updateStatus.mutate(
      { id: creativeId, status },
      {
        onSuccess: () => {
          toast.success(`Creative ${status}`);
          setSelectedCreative(null);
        },
        onError: (err: any) => toast.error(err.message || 'Update failed'),
      }
    );
  };

  const handleAddComment = (creativeId: string) => {
    if (!newComment.trim()) return;
    addComment.mutate(
      {
        id: creativeId,
        comment: {
          text: newComment,
          author: currentMember?.name || 'Agency',
          timestamp: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast.success('Comment added');
          setNewComment('');
        },
        onError: (err: any) => toast.error(err.message || 'Failed'),
      }
    );
  };

  const statusFilters: { id: FilterStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: statusCounts.all },
    { id: 'pending', label: 'Pending', count: statusCounts.pending },
    { id: 'approved', label: 'Approved', count: statusCounts.approved },
    { id: 'launched', label: 'Launched', count: statusCounts.launched },
    { id: 'revisions', label: 'Revisions', count: statusCounts.revisions },
    { id: 'rejected', label: 'Rejected', count: statusCounts.rejected },
  ];

  return (
    <div className="space-y-6">
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {statusFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setFilterStatus(filter.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all
              ${filterStatus === filter.id
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }
            `}
          >
            {filter.label}
            {filter.count > 0 && (
              <span className={`
                inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1
                ${filterStatus === filter.id ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'}
              `}>
                {filter.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + client filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creatives..."
            className="pl-9 bg-card/50 border-border/50 rounded-xl h-10"
          />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="bg-card/50 border-border/50 w-48 rounded-xl h-10">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Creative cards */}
      {filteredCreatives.length === 0 ? (
        <Card className="border-dashed border-border/50 p-12 text-center">
          <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <h3 className="font-semibold text-muted-foreground mb-1">
            {filterStatus === 'pending' ? 'All caught up!' : 'No creatives found'}
          </h3>
          <p className="text-xs text-muted-foreground/60">
            {filterStatus === 'pending'
              ? 'No creatives are waiting for review.'
              : 'Try adjusting your filters.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCreatives.map((creative) => {
            const config = STATUS_CONFIG[creative.status] || STATUS_CONFIG.draft;
            const StatusIcon = config.icon;
            return (
              <Card
                key={creative.id}
                className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all cursor-pointer"
                onClick={() => setSelectedCreative(creative)}
              >
                <div className="relative aspect-[4/3] bg-muted/30 overflow-hidden">
                  {creative.file_url ? (
                    creative.type === 'video' ? (
                      <div className="relative w-full h-full">
                        <video src={creative.file_url} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-12 w-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Video className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img src={creative.file_url} alt={creative.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}

                  {/* Status badge overlay */}
                  <div className="absolute top-2 left-2">
                    <Badge variant="outline" className={`${config.color} text-[10px] font-semibold gap-1 backdrop-blur-sm`}>
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>

                  {/* Hover actions */}
                  {creative.status === 'pending' && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700"
                        onClick={(e) => { e.stopPropagation(); handleStatusUpdate(creative.id, 'approved'); }}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 h-8 text-xs rounded-lg"
                        onClick={(e) => { e.stopPropagation(); handleStatusUpdate(creative.id, 'revisions'); }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Revisions
                      </Button>
                    </div>
                  )}
                </div>

                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate">{creative.title}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11px] text-muted-foreground">{getClientName(creative.client_id)}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(creative.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="secondary" className="text-[9px] capitalize">{creative.platform}</Badge>
                    <Badge variant="secondary" className="text-[9px] capitalize">{creative.type}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Creative detail dialog */}
      <Dialog open={!!selectedCreative} onOpenChange={(open) => !open && setSelectedCreative(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedCreative && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="truncate">{selectedCreative.title}</span>
                  <Badge
                    variant="outline"
                    className={`${STATUS_CONFIG[selectedCreative.status]?.color || ''} text-[10px] flex-shrink-0`}
                  >
                    {selectedCreative.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Preview */}
                <div className="rounded-2xl overflow-hidden bg-muted/30 border border-border/30">
                  {selectedCreative.file_url ? (
                    selectedCreative.type === 'video' ? (
                      <video src={selectedCreative.file_url} controls className="w-full max-h-[400px]" />
                    ) : (
                      <img src={selectedCreative.file_url} alt="" className="w-full max-h-[400px] object-contain" />
                    )
                  ) : (
                    <div className="h-48 flex items-center justify-center">
                      <FileText className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}
                </div>

                {/* Meta info */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Client</p>
                    <p className="text-sm font-medium">{getClientName(selectedCreative.client_id)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Platform</p>
                    <p className="text-sm font-medium capitalize">{selectedCreative.platform}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Type</p>
                    <p className="text-sm font-medium capitalize">{selectedCreative.type}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  {selectedCreative.status === 'pending' && (
                    <>
                      <Button
                        className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-semibold"
                        onClick={() => handleStatusUpdate(selectedCreative.id, 'approved')}
                      >
                        <Check className="h-4 w-4 mr-2" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-10 rounded-xl font-semibold"
                        onClick={() => handleStatusUpdate(selectedCreative.id, 'revisions')}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" /> Request Revisions
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 rounded-xl text-destructive hover:bg-destructive/10"
                        onClick={() => handleStatusUpdate(selectedCreative.id, 'rejected')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {selectedCreative.status === 'approved' && (
                    <Button
                      className="h-10 rounded-xl font-semibold"
                      onClick={() => handleStatusUpdate(selectedCreative.id, 'launched')}
                    >
                      <Rocket className="h-4 w-4 mr-2" /> Mark as Launched
                    </Button>
                  )}
                  {selectedCreative.client_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-xs"
                      onClick={() => navigate(`/client/${selectedCreative.client_id}/creatives`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Full View
                    </Button>
                  )}
                </div>

                {/* Comment section */}
                <div className="border-t border-border/50 pt-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Comments & Feedback
                  </h4>

                  {/* Existing comments */}
                  {selectedCreative.comments && Array.isArray(selectedCreative.comments) && selectedCreative.comments.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {(selectedCreative.comments as any[]).map((comment: any, idx: number) => (
                        <div key={idx} className="bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold">{comment.author}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {comment.timestamp && formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* New comment */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add feedback or instructions..."
                      className="flex-1 bg-muted/30 border-border/30 rounded-xl h-10"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment(selectedCreative.id)}
                    />
                    <Button
                      size="sm"
                      className="h-10 px-4 rounded-xl"
                      onClick={() => handleAddComment(selectedCreative.id)}
                      disabled={!newComment.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
