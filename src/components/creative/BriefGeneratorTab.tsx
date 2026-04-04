import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sparkles,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  Target,
  Megaphone,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Copy,
} from 'lucide-react';
import {
  useCreativeBriefs,
  useGenerateBrief,
  useGenerateScripts,
  useUpdateBriefStatus,
  useUpdateScriptStatus,
  useAdScripts,
  type CreativeBrief,
  type AdScript,
} from '@/hooks/useCreativeBriefs';

interface BriefGeneratorTabProps {
  clientId: string;
  clientName: string;
}

const REASON_OPTIONS = [
  { value: 'scaling', label: 'Scaling — Find new angles to scale' },
  { value: 'high_cpa', label: 'High CPA — Costs are rising, need fresh creative' },
  { value: 'fatigue', label: 'Fatigue — Current ads losing performance' },
  { value: 'new_angle', label: 'New Angle — Explore untested messaging' },
];

function getStatusColor(status: string) {
  switch (status) {
    case 'pending':
    case 'draft':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'in_production':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'approved':
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

const REJECTION_REASONS = [
  'Off-brand — Doesn\'t match our voice or positioning',
  'Weak hook — Not compelling enough to stop the scroll',
  'Wrong audience — Messaging doesn\'t speak to our ICP',
  'Too generic — Lacks specificity or differentiation',
  'Bad format — Wrong structure for this ad type',
];

function RejectionDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  itemType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
  itemType: 'brief' | 'script';
}) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const reason = selectedReason === 'custom' ? customReason : selectedReason;

  const handleConfirm = () => {
    onConfirm(reason);
    setSelectedReason('');
    setCustomReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {itemType === 'brief' ? 'Brief' : 'Script'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Why are you rejecting this {itemType}? This feedback improves future AI generations.
          </p>
          <div className="space-y-2">
            {REJECTION_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  selectedReason === r
                    ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                    : 'border-transparent hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="rejection-reason"
                  value={r}
                  checked={selectedReason === r}
                  onChange={() => { setSelectedReason(r); setCustomReason(''); }}
                  className="accent-red-500"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
            <label
              className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                selectedReason === 'custom'
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                  : 'border-transparent hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                name="rejection-reason"
                value="custom"
                checked={selectedReason === 'custom'}
                onChange={() => setSelectedReason('custom')}
                className="accent-red-500"
              />
              <span className="text-sm">Other reason</span>
            </label>
            {selectedReason === 'custom' && (
              <Textarea
                placeholder="Describe what's wrong and what you'd prefer..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-2"
                rows={3}
              />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={!reason.trim() || isPending}
            >
              {isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
              Reject {itemType === 'brief' ? 'Brief' : 'Script'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScriptCard({ script, clientId }: { script: AdScript; clientId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const updateStatus = useUpdateScriptStatus();

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className="border hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium line-clamp-1">{script.title}</CardTitle>
          <Badge className={getStatusColor(script.status)}>{script.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{script.angle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Headline</span>
            <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => copyText(script.headline, 'headline')}>
              {copied === 'headline' ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-sm font-semibold">{script.headline}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Body Copy</span>
            <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => copyText(script.body_copy, 'body')}>
              {copied === 'body' ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{script.body_copy}</p>
        </div>

        {script.hook && (
          <div>
            <span className="text-xs font-medium text-muted-foreground">Hook</span>
            <p className="text-sm italic mt-0.5">"{script.hook}"</p>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>CTA: <span className="font-medium text-foreground">{script.cta}</span></span>
        </div>

        {script.headlines && script.headlines.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ChevronRight className="h-3 w-3" />
              {script.headlines.length} headline variants
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1 pl-4">
              {script.headlines.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span>{h}</span>
                  <Button variant="ghost" size="sm" className="h-4 px-1" onClick={() => copyText(h, `h${i}`)}>
                    {copied === `h${i}` ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex gap-2 pt-2 border-t">
          {script.status === 'draft' && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-green-600 hover:text-green-700"
                onClick={() => updateStatus.mutate({ scriptId: script.id, status: 'approved', clientId })}
                disabled={updateStatus.isPending}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-600 hover:text-red-700"
                onClick={() => setShowRejectDialog(true)}
                disabled={updateStatus.isPending}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
            </>
          )}
          {script.status === 'rejected' && script.rejection_reason && (
            <p className="text-xs text-red-600 dark:text-red-400 italic w-full">
              Reason: {script.rejection_reason}
            </p>
          )}
          {script.status === 'approved' && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => updateStatus.mutate({ scriptId: script.id, status: 'in_production', clientId })}
              disabled={updateStatus.isPending}
            >
              <Zap className="h-3 w-3 mr-1" />
              Send to Production
            </Button>
          )}
        </div>
      </CardContent>
      <RejectionDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        isPending={updateStatus.isPending}
        itemType="script"
        onConfirm={(reason) => {
          updateStatus.mutate(
            { scriptId: script.id, status: 'rejected', clientId, rejectionReason: reason },
            { onSuccess: () => setShowRejectDialog(false) }
          );
        }}
      />
    </Card>
  );
}

function BriefDetail({ brief, clientId }: { brief: CreativeBrief; clientId: string }) {
  const { data: scripts = [], isLoading: scriptsLoading } = useAdScripts(brief.id);
  const generateScripts = useGenerateScripts();
  const updateBriefStatus = useUpdateBriefStatus();
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Objective</h4>
          <p className="text-sm">{brief.objective}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Creative Direction</h4>
          <p className="text-sm">{brief.creative_direction}</p>
        </div>
      </div>

      {brief.target_audience && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Target Audience</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Demographics:</span>
              <p>{brief.target_audience.demographics}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Psychographics:</span>
              <p>{brief.target_audience.psychographics}</p>
            </div>
            {brief.target_audience.pain_points?.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Pain Points:</span>
                <ul className="list-disc list-inside">
                  {brief.target_audience.pain_points.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {brief.target_audience.desires?.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Desires:</span>
                <ul className="list-disc list-inside">
                  {brief.target_audience.desires.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {brief.messaging_angles && brief.messaging_angles.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Messaging Angles</h4>
          <div className="space-y-2">
            {brief.messaging_angles.map((angle, i) => (
              <Card key={i} className="bg-muted/30">
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded bg-primary/10 text-primary font-bold text-xs w-6 h-6 flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{angle.angle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Hook: "{angle.hook}"</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{angle.rationale}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {brief.performance_snapshot && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Performance Snapshot</h4>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Spend', value: `$${brief.performance_snapshot.spend?.toLocaleString() ?? '—'}` },
              { label: 'Leads', value: brief.performance_snapshot.leads?.toLocaleString() ?? '—' },
              { label: 'Funded', value: brief.performance_snapshot.funded?.toLocaleString() ?? '—' },
              { label: 'CPL', value: brief.performance_snapshot.cpl ? `$${brief.performance_snapshot.cpl.toFixed(2)}` : '—' },
              { label: 'CPF', value: brief.performance_snapshot.cpf ? `$${brief.performance_snapshot.cpf.toFixed(2)}` : '—' },
            ].map((m) => (
              <div key={m.label} className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-sm font-semibold">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Ad Scripts ({scripts.length})
          </h4>
          {brief.status === 'pending' && !scripts.some(s => s.status !== 'rejected') && (
            <Button
              size="sm"
              onClick={() => generateScripts.mutate({ clientId, briefId: brief.id })}
              disabled={generateScripts.isPending}
            >
              {generateScripts.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {scripts.length > 0 ? 'Regenerate Scripts' : 'Generate Scripts'}
            </Button>
          )}
        </div>

        {scriptsLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading scripts...</div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No scripts yet. Generate scripts from this brief's messaging angles.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script) => (
              <ScriptCard key={script.id} script={script} clientId={clientId} />
            ))}
          </div>
        )}
      </div>

      {(brief.status === 'pending' || brief.status === 'in_production') && (
        <div className="flex gap-2 border-t pt-3">
          {brief.status === 'pending' && scripts.some(s => s.status === 'approved' || s.status === 'in_production') && (
            <Button
              size="sm"
              variant="outline"
              className="text-blue-600 hover:text-blue-700"
              onClick={() => updateBriefStatus.mutate({ briefId: brief.id, status: 'in_production', clientId })}
              disabled={updateBriefStatus.isPending}
            >
              <Zap className="h-3 w-3 mr-1" />
              Move to Production
            </Button>
          )}
          {brief.status === 'in_production' && (
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 hover:text-green-700"
              onClick={() => updateBriefStatus.mutate({ briefId: brief.id, status: 'completed', clientId })}
              disabled={updateBriefStatus.isPending}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark Complete
            </Button>
          )}
          {brief.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => setShowRejectDialog(true)}
              disabled={updateBriefStatus.isPending}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Reject Brief
            </Button>
          )}
        </div>
      )}
      {brief.status === 'rejected' && brief.rejection_reason && (
        <p className="text-xs text-red-600 dark:text-red-400 italic border-t pt-2">
          Rejection reason: {brief.rejection_reason}
        </p>
      )}
      <RejectionDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        isPending={updateBriefStatus.isPending}
        itemType="brief"
        onConfirm={(reason) => {
          updateBriefStatus.mutate(
            { briefId: brief.id, status: 'rejected', clientId, rejectionReason: reason },
            { onSuccess: () => setShowRejectDialog(false) }
          );
        }}
      />
    </div>
  );
}

export function BriefGeneratorTab({ clientId, clientName }: BriefGeneratorTabProps) {
  const { data: briefs = [], isLoading } = useCreativeBriefs(clientId);
  const generateBrief = useGenerateBrief();
  const [reason, setReason] = useState('scaling');
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const handleGenerate = () => {
    generateBrief.mutate(
      { clientId, reason },
      {
        onSuccess: () => setShowGenerateDialog(false),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Creative Brief Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered creative briefs and ad scripts for {clientName}
          </p>
        </div>
        <Button onClick={() => setShowGenerateDialog(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          New Brief
        </Button>
      </div>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Creative Brief</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Analyze {clientName}'s top-performing Meta ads and generate a strategic creative brief with messaging angles.
            </p>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Generation Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generateBrief.isPending}
            >
              {generateBrief.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing performance data...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Brief
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">AI Creative Pipeline</p>
              <p className="text-xs text-muted-foreground">
                Generate briefs from Meta Ads performance data, then create production-ready ad scripts for each messaging angle.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading briefs...</div>
      ) : briefs.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-2">No Briefs Yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Generate your first AI creative brief to get started.
            </p>
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Brief
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <Card key={brief.id} className="hover:shadow-md transition-shadow">
              <Collapsible
                open={expandedBrief === brief.id}
                onOpenChange={(open) => setExpandedBrief(open ? brief.id : null)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedBrief === brief.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <CardTitle className="text-base">{brief.title}</CardTitle>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(brief.created_at).toLocaleDateString()}</span>
                            <span>·</span>
                            <span>{brief.platform}</span>
                            <span>·</span>
                            <span>{brief.ad_format}</span>
                            <span>·</span>
                            <span>{brief.generation_reason}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className={getStatusColor(brief.status)}>{brief.status}</Badge>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <BriefDetail brief={brief} clientId={clientId} />
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
