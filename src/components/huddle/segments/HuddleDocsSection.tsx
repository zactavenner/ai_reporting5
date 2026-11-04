/**
 * "Google Sheet & Docs" drop-down on the Huddle client card.
 * Turns red whenever a required document is missing or the link is the wrong
 * kind of Google file, so gaps are obvious during the huddle.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileSpreadsheet, FileText, Loader2, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { CLIENT_DOCS, docProblems, docState, type ClientDocDef, type ClientDocKey } from '@/lib/huddle/clientDocs';

type DocValues = Partial<Record<ClientDocKey, string | null>>;

export function HuddleDocsSection({ clientId, onSheetChange }: { clientId: string; onSheetChange?: (url: string) => void }) {
  const qc = useQueryClient();
  const { data: values = {}, isLoading } = useQuery({
    queryKey: ['huddle-docs', clientId],
    queryFn: async (): Promise<DocValues> => {
      const { data } = await (supabase as any)
        .from('client_settings')
        .select('kpi_google_sheet_url, kpi_google_doc_url')
        .eq('client_id', clientId)
        .maybeSingle();
      return (data || {}) as DocValues;
    },
  });
  const problems = isLoading ? 0 : docProblems(values);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isLoading && problems > 0) setOpen(true);
  }, [isLoading, problems]);

  const save = async (key: ClientDocKey, url: string) => {
    const trimmed = url.trim();
    const { error } = await (supabase as any)
      .from('client_settings')
      .upsert({ client_id: clientId, [key]: trimmed || null }, { onConflict: 'client_id' });
    if (error) {
      toast.error('Could not save the link');
      return false;
    }
    toast.success('Link saved');
    qc.invalidateQueries({ queryKey: ['huddle-docs', clientId] });
    if (key === 'kpi_google_sheet_url') onSheetChange?.(trimmed);
    return true;
  };

  const red = problems > 0;
  return (
    <Card className={cn('p-0 overflow-hidden', red && 'border-rose-500/60 bg-rose-500/5')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          red ? 'hover:bg-rose-500/10' : 'hover:bg-muted/40',
        )}
      >
        <div className={cn('flex items-center gap-2 text-sm font-semibold', red && 'text-rose-600')}>
          <FileSpreadsheet className="h-4 w-4" />
          Google Sheet &amp; Docs
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : red ? (
            <Badge variant="outline" className="gap-1 bg-rose-500/10 text-rose-600 border-rose-500/40">
              <AlertTriangle className="h-3 w-3" /> {problems} missing
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" /> All linked
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t divide-y">
          {CLIENT_DOCS.map((d) => (
            <DocRow key={d.key} def={d} value={values[d.key] ?? ''} onSave={(url) => save(d.key, url)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function DocRow({ def, value, onSave }: { def: ClientDocDef; value: string; onSave: (url: string) => Promise<boolean> }) {
  const state = docState(def.kind, value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const draftState = docState(def.kind, draft);
  const Icon = def.kind === 'sheet' ? FileSpreadsheet : FileText;
  const bad = state !== 'linked';

  return (
    <div className={cn('px-4 py-3 space-y-2', bad && 'bg-rose-500/5')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-4 w-4 shrink-0', bad ? 'text-rose-600' : 'text-muted-foreground')} />
          <div className="min-w-0">
            <div className={cn('text-sm font-medium', bad && 'text-rose-600')}>{def.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {state === 'missing' && 'Missing — add the link'}
              {state === 'wrong_type' && `This link isn't a Google ${def.kind === 'sheet' ? 'Sheet' : 'Doc'}`}
              {state === 'linked' && def.hint}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {value && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5" asChild>
              <a href={value} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            </Button>
          )}
          <Button size="sm" variant={bad ? 'default' : 'ghost'} className="h-7 gap-1.5" onClick={() => setEditing((e) => !e)}>
            <Pencil className="h-3.5 w-3.5" /> {value ? 'Change' : 'Add link'}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={def.kind === 'sheet' ? 'https://docs.google.com/spreadsheets/d/…' : 'https://docs.google.com/document/d/…'}
              className="h-8 text-xs font-mono"
              autoFocus
            />
            <Button
              size="sm"
              className="h-8"
              disabled={saving || (draft.trim() !== '' && draftState !== 'linked')}
              onClick={async () => {
                setSaving(true);
                const ok = await onSave(draft);
                setSaving(false);
                if (ok) setEditing(false);
              }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Save
            </Button>
          </div>
          {draft.trim() && draftState !== 'linked' && (
            <div className="text-[11px] text-rose-600">Paste a Google {def.kind === 'sheet' ? 'Sheets' : 'Docs'} link.</div>
          )}
        </div>
      )}
    </div>
  );
}
