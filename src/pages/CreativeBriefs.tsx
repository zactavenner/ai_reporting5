import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreativeBriefs, useUpdateBriefStatus, CreativeBrief } from '@/hooks/useCreativeBriefs';
import { BriefDetailDialog } from '@/components/briefs/BriefDetailDialog';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'success'> = {
  pending: 'default',
  in_production: 'secondary',
  completed: 'success',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_production: 'In Production',
  completed: 'Completed',
};

export default function CreativeBriefs() {
  const navigate = useNavigate();
  const { data: briefs = [], isLoading } = useCreativeBriefs();
  const updateStatus = useUpdateBriefStatus();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrief, setSelectedBrief] = useState<CreativeBrief | null>(null);

  const filtered = useMemo(() => {
    return briefs.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (searchQuery && !b.client_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [briefs, statusFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Creative Briefs</h1>
            <p className="text-sm text-muted-foreground">AI-generated briefs for creative production</p>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading briefs...</div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground">No creative briefs found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate briefs from the Ads Manager tab on any client page
            </p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Hook Patterns</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((brief) => (
                  <TableRow key={brief.id}>
                    <TableCell className="font-medium">{brief.client_name}</TableCell>
                    <TableCell>
                      <Select
                        value={brief.status}
                        onValueChange={(val) => updateStatus.mutate({ id: brief.id, status: val })}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <Badge variant={STATUS_COLORS[brief.status] || 'default'} className="text-xs">
                            {STATUS_LABELS[brief.status] || brief.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_production">In Production</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(brief.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {(brief.hook_patterns || []).slice(0, 2).join(', ')}
                      {(brief.hook_patterns || []).length > 2 && '...'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedBrief(brief)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <BriefDetailDialog
        brief={selectedBrief}
        open={!!selectedBrief}
        onOpenChange={(open) => !open && setSelectedBrief(null)}
      />
    </div>
  );
}
