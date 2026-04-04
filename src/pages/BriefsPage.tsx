import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Inbox, Loader2, FileText, Sparkles, ChevronDown, RefreshCw, Save, Eye, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Brief {
  id: string;
  client_name: string;
  status: string;
  hook_patterns: string[] | null;
  offer_angles: string[] | null;
  recommended_variations: number | null;
  winning_ad_summary: string | null;
  full_brief_json: Record<string, unknown> | null;
  created_at: string;
}

interface GeneratedScript {
  script_name: string;
  format: string;
  hook: string;
  body: string;
  cta: string;
  visual_direction: string;
  estimated_length: string | null;
  notes: string | null;
}

interface AdScript {
  id: string;
  brief_id: string | null;
  client_name: string;
  script_name: string;
  format: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  visual_direction: string | null;
  estimated_length: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-primary/10 text-primary",
  in_production: "bg-accent text-accent-foreground",
  completed: "bg-primary text-primary-foreground",
};

const FORMAT_COLORS: Record<string, string> = {
  static: "bg-secondary text-secondary-foreground",
  video: "bg-primary/10 text-primary",
  carousel: "bg-accent text-accent-foreground",
};

export default function BriefsPage() {
  const { toast } = useToast();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [scripts, setScripts] = useState<AdScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null);
  const [generatedScripts, setGeneratedScripts] = useState<Record<string, GeneratedScript[]>>({});
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [savingBriefId, setSavingBriefId] = useState<string | null>(null);
  const [viewScript, setViewScript] = useState<AdScript | null>(null);
  const [filterClient, setFilterClient] = useState("");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    const [briefsRes, scriptsRes] = await Promise.all([
      supabase.from("creative_briefs").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("ad_scripts").select("*").order("created_at", { ascending: false }),
    ]);
    setBriefs((briefsRes.data as unknown as Brief[]) || []);
    setScripts((scriptsRes.data as unknown as AdScript[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerate = async (brief: Brief) => {
    setGeneratingBriefId(brief.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ad-scripts", {
        body: {
          brief_id: brief.id,
          brief_data: {
            client_name: brief.client_name,
            hook_patterns: brief.hook_patterns,
            offer_angles: brief.offer_angles,
            recommended_variations: brief.recommended_variations,
            winning_ad_summary: brief.winning_ad_summary,
          },
        },
      });
      if (error) throw error;
      setGeneratedScripts((prev) => ({ ...prev, [brief.id]: data.scripts }));
      setExpandedBrief(brief.id);
    } catch (err: unknown) {
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGeneratingBriefId(null);
    }
  };

  const handleSaveScripts = async (briefId: string, clientName: string) => {
    const scripts = generatedScripts[briefId];
    if (!scripts) return;
    setSavingBriefId(briefId);
    try {
      const rows = scripts.map((s) => ({
        brief_id: briefId,
        client_id: '00000000-0000-0000-0000-000000000000',
        title: s.script_name,
        script_type: s.format || 'static',
        hook: s.hook,
        body: s.body,
        cta: s.cta,
        notes: s.notes,
        status: "draft",
      }));
      const { error } = await (supabase.from("ad_scripts") as any).insert(rows);
      if (error) throw error;
      toast({ title: "Scripts saved", description: `${rows.length} scripts saved as drafts` });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSavingBriefId(null);
    }
  };

  const handleStatusChange = async (scriptId: string, newStatus: string) => {
    const { error } = await supabase.from("ad_scripts").update({ status: newStatus }).eq("id", scriptId);
    if (error) {
      toast({ title: "Update failed", variant: "destructive" });
    } else {
      setScripts((prev) => prev.map((s) => (s.id === scriptId ? { ...s, status: newStatus } : s)));
    }
  };

  const pendingCount = briefs.length;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const scriptsThisWeek = scripts.filter((s) => s.created_at >= weekAgo).length;
  const inProductionCount = scripts.filter((s) => s.status === "in_production").length;

  const filteredScripts = useMemo(() => {
    return scripts.filter((s) => {
      if (filterClient && !s.client_name.toLowerCase().includes(filterClient.toLowerCase())) return false;
      if (filterFormat !== "all" && s.format !== filterFormat) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      return true;
    });
  }, [scripts, filterClient, filterFormat, filterStatus]);

  return (
    <AppLayout breadcrumbs={[{ label: "AI Briefs" }]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">AI Briefs</h1>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-4 text-sm">
          <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            {pendingCount} pending briefs
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {scriptsThisWeek} scripts this week
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
            <Loader2 className="h-3.5 w-3.5 mr-1.5" />
            {inProductionCount} in production
          </Badge>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending Briefs</TabsTrigger>
            <TabsTrigger value="scripts">Generated Scripts</TabsTrigger>
          </TabsList>

          {/* Tab 1: Pending Briefs */}
          <TabsContent value="pending" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : briefs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No pending briefs. Briefs will appear here when submitted.</p>
                </CardContent>
              </Card>
            ) : (
              briefs.map((brief) => (
                <Collapsible
                  key={brief.id}
                  open={expandedBrief === brief.id}
                  onOpenChange={(open) => setExpandedBrief(open ? brief.id : null)}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <CardTitle className="text-lg">{brief.client_name}</CardTitle>
                          <CardDescription>
                            Created {format(new Date(brief.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </CardDescription>
                        </div>
                        <Button
                          onClick={() => handleGenerate(brief)}
                          disabled={generatingBriefId === brief.id}
                        >
                          {generatingBriefId === brief.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating 3 scripts...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Generate Creatives
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {brief.hook_patterns && brief.hook_patterns.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Hook Patterns</p>
                          <div className="flex flex-wrap gap-1.5">
                            {brief.hook_patterns.map((h, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {brief.offer_angles && brief.offer_angles.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Offer Angles</p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside">
                            {brief.offer_angles.slice(0, 4).map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {brief.recommended_variations || 3} recommended variations
                      </p>

                      {/* Expanded: generated scripts */}
                      <CollapsibleContent className="space-y-4 pt-4 border-t border-border">
                        {generatedScripts[brief.id]?.map((script, i) => (
                          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{script.script_name}</p>
                              <Badge className={FORMAT_COLORS[script.format] || ""}>{script.format}</Badge>
                            </div>
                            <div className="grid gap-2 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">Hook: </span>
                                <span>{script.hook}</span>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Body: </span>
                                <span className="whitespace-pre-line">{script.body}</span>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">CTA: </span>
                                <span>{script.cta}</span>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Visual: </span>
                                <span>{script.visual_direction}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {generatedScripts[brief.id] && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleSaveScripts(brief.id, brief.client_name)}
                              disabled={savingBriefId === brief.id}
                            >
                              {savingBriefId === brief.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              Save All Scripts
                            </Button>
                            <Button variant="outline" onClick={() => handleGenerate(brief)} disabled={generatingBriefId === brief.id}>
                              <RefreshCw className="h-4 w-4" />
                              Regenerate
                            </Button>
                          </div>
                        )}
                      </CollapsibleContent>

                      {generatedScripts[brief.id] && expandedBrief !== brief.id && (
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full">
                            <ChevronDown className="h-4 w-4 mr-1" />
                            Show {generatedScripts[brief.id].length} generated scripts
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </CardContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>

          {/* Tab 2: Generated Scripts */}
          <TabsContent value="scripts" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Filter by client..."
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="w-48"
              />
              <Select value={filterFormat} onValueChange={setFilterFormat}>
                <SelectTrigger className="w-36">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="in_production">In Production</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredScripts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No scripts found. Generate some from the Pending Briefs tab.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Script Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScripts.map((script) => (
                      <TableRow key={script.id}>
                        <TableCell className="font-medium">{script.script_name}</TableCell>
                        <TableCell>{script.client_name}</TableCell>
                        <TableCell>
                          <Badge className={FORMAT_COLORS[script.format] || ""} variant="secondary">
                            {script.format}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={script.status}
                            onValueChange={(val) => handleStatusChange(script.id, val)}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <Badge className={STATUS_COLORS[script.status] || ""} variant="secondary">
                                {script.status.replace("_", " ")}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="in_production">In Production</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(script.created_at), "MMM d")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setViewScript(script)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* View Script Dialog */}
      <Dialog open={!!viewScript} onOpenChange={() => setViewScript(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewScript?.script_name}</DialogTitle>
          </DialogHeader>
          {viewScript && (
            <div className="space-y-4 text-sm">
              <div className="flex gap-2">
                <Badge className={FORMAT_COLORS[viewScript.format] || ""}>{viewScript.format}</Badge>
                <Badge className={STATUS_COLORS[viewScript.status] || ""}>{viewScript.status.replace("_", " ")}</Badge>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">Client</p>
                <p>{viewScript.client_name}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">Hook</p>
                <p>{viewScript.hook || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">Body</p>
                <p className="whitespace-pre-line">{viewScript.body || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">CTA</p>
                <p>{viewScript.cta || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">Visual Direction</p>
                <p>{viewScript.visual_direction || "—"}</p>
              </div>
              {viewScript.estimated_length && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Estimated Length</p>
                  <p>{viewScript.estimated_length}</p>
                </div>
              )}
              {viewScript.notes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Notes</p>
                  <p>{viewScript.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
