import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Eye, FileText, Video, Type, Edit2, Trash2, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreativeBriefs, useUpdateBriefStatus, CreativeBrief } from '@/hooks/useCreativeBriefs';
import { useAllAdScripts, useUpdateAdScript, useDeleteAdScript, AdScript } from '@/hooks/useAdScripts';
import { BriefDetailDialog } from '@/components/briefs/BriefDetailDialog';
import { format } from 'date-fns';
import { toast } from 'sonner';

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

function ScriptEditDialog({ script, open, onOpenChange }: { script: AdScript | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const updateScript = useUpdateAdScript();
  const [hook, setHook] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [notes, setNotes] = useState('');

  useState(() => {
    if (script) {
      setHook(script.hook || '');
      setBody(script.body || '');
      setCta(script.cta || '');
      setNotes(script.notes || '');
    }
  });

  if (!script) return null;

  const handleSave = () => {
    updateScript.mutate({ id: script.id, hook, body, cta, notes });
    onOpenChange(false);
  };

  const handleCopy = () => {
    const text = `HOOK: ${hook}\n\nBODY: ${body}\n\nCTA: ${cta}`;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {script.script_type === 'video' ? <Video className="h-4 w-4" /> : <Type className="h-4 w-4" />}
            {script.title}
            <Badge variant="outline" className="ml-2">{script.script_type}</Badge>
            {script.duration_seconds && <Badge variant="secondary">{script.duration_seconds}s</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">{script.script_type === 'video' ? 'Hook (First 3 seconds)' : 'Headline'}</label>
            <Textarea value={hook} onChange={e => setHook(e.target.value)} rows={2} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{script.script_type === 'video' ? 'Body Script' : 'Primary Text'}</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={5} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">CTA</label>
            <Input value={cta} onChange={e => setCta(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Production notes..." />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
            <Button size="sm" onClick={handleSave} disabled={updateScript.isPending}><Check className="h-4 w-4 mr-1" />Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CreativeBriefs({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const { data: briefs = [], isLoading } = useCreativeBriefs();
  const { data: scripts = [], isLoading: scriptsLoading } = useAllAdScripts();
  const updateStatus = useUpdateBriefStatus();
  const updateScript = useUpdateAdScript();
  const deleteScript = useDeleteAdScript();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrief, setSelectedBrief] = useState<CreativeBrief | null>(null);
  const [editScript, setEditScript] = useState<AdScript | null>(null);
  const [scriptTypeFilter, setScriptTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return briefs.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (searchQuery && !b.client_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [briefs, statusFilter, searchQuery]);

  const filteredScripts = useMemo(() => {
    return scripts.filter((s) => {
      if (scriptTypeFilter !== 'all' && s.script_type !== scriptTypeFilter) return false;
      if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [scripts, scriptTypeFilter, searchQuery]);

  // Find client name from briefs for scripts
  const briefMap = useMemo(() => {
    const map: Record<string, string> = {};
    briefs.forEach(b => { map[b.id] = b.client_name; });
    return map;
  }, [briefs]);

  return (
    <>
      <div className={embedded ? "space-y-4" : "min-h-screen bg-background"}>
        {!embedded && (
          <header className="border-b bg-card px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Creative Briefs & Scripts</h1>
                <p className="text-sm text-muted-foreground">AI-generated weekly briefs and ad scripts</p>
              </div>
            </div>
          </header>
        )}
        {embedded && (
          <div>
            <h2 className="text-lg font-bold">Creative Briefs & Scripts</h2>
            <p className="text-sm text-muted-foreground">AI-generated weekly briefs and ad scripts — runs every Monday 5 AM</p>
          </div>
        )}

        <div className={embedded ? "" : "p-6 space-y-4"}>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Tabs defaultValue="briefs" className="space-y-4">
            <TabsList>
              <TabsTrigger value="briefs" className="gap-2">
                <FileText className="h-4 w-4" />
                Briefs ({briefs.length})
              </TabsTrigger>
              <TabsTrigger value="scripts" className="gap-2">
                <Video className="h-4 w-4" />
                Scripts ({scripts.length})
              </TabsTrigger>
            </TabsList>

            {/* Briefs Tab */}
            <TabsContent value="briefs" className="space-y-4">
              <div className="flex gap-3">
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

              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading briefs...</div>
              ) : filtered.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                  <p className="text-muted-foreground">No creative briefs found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Briefs auto-generate every Monday or from the Ads Manager
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Source</TableHead>
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
                            <Badge variant={brief.source === 'weekly_auto' ? 'secondary' : 'outline'} className="text-xs">
                              {brief.source === 'weekly_auto' ? 'Weekly Auto' : brief.source === 'ai_brief' ? 'Manual' : brief.source}
                            </Badge>
                          </TableCell>
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
                            <Button variant="ghost" size="sm" onClick={() => setSelectedBrief(brief)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Scripts Tab */}
            <TabsContent value="scripts" className="space-y-4">
              <div className="flex gap-3">
                <Select value={scriptTypeFilter} onValueChange={setScriptTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="video">Video Scripts</SelectItem>
                    <SelectItem value="static">Static Ad Copy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold">{scripts.length}</p>
                  <p className="text-xs text-muted-foreground">Total Scripts</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold">{scripts.filter(s => s.script_type === 'video').length}</p>
                  <p className="text-xs text-muted-foreground">Video Scripts</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold">{scripts.filter(s => s.script_type === 'static').length}</p>
                  <p className="text-xs text-muted-foreground">Static Ad Copy</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold">{scripts.filter(s => s.status === 'approved').length}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </Card>
              </div>

              {scriptsLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading scripts...</div>
              ) : filteredScripts.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                  <p className="text-muted-foreground">No scripts found</p>
                  <p className="text-sm text-muted-foreground mt-1">Scripts auto-generate with weekly briefs</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredScripts.map((script) => (
                    <Card key={script.id} className="overflow-hidden hover:border-primary/50 transition-all">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {script.script_type === 'video' ? (
                              <Video className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Type className="h-4 w-4 text-green-500" />
                            )}
                            <CardTitle className="text-sm truncate">{script.title}</CardTitle>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant={script.status === 'approved' ? 'default' : 'outline'} className="text-xs">
                              {script.status}
                            </Badge>
                            {script.duration_seconds && (
                              <Badge variant="secondary" className="text-xs">{script.duration_seconds}s</Badge>
                            )}
                          </div>
                        </div>
                        {script.brief_id && briefMap[script.brief_id] && (
                          <p className="text-xs text-muted-foreground">{briefMap[script.brief_id]}</p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {script.hook && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{script.script_type === 'video' ? 'Hook' : 'Headline'}</p>
                            <p className="text-sm line-clamp-2">{script.hook}</p>
                          </div>
                        )}
                        {script.body && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Body</p>
                            <p className="text-sm line-clamp-3">{script.body}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditScript(script)}>
                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updateScript.mutate({ id: script.id, status: script.status === 'approved' ? 'draft' : 'approved' });
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { if (confirm('Delete this script?')) deleteScript.mutate(script.id); }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(script.created_at), 'MMM d, yyyy')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BriefDetailDialog
        brief={selectedBrief}
        open={!!selectedBrief}
        onOpenChange={(open) => !open && setSelectedBrief(null)}
      />
      <ScriptEditDialog
        script={editScript}
        open={!!editScript}
        onOpenChange={(open) => !open && setEditScript(null)}
      />
    </>
  );
}
