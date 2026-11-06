import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { Objection, SetterScript } from '@/lib/setterCoach';

type Draft = Omit<SetterScript, 'id'> & { id?: string };
const AGENCY = '__agency__';

const blank = (clientId: string | null): Draft => ({
  client_id: clientId, name: 'New script', opening: 'Hi {{first_name}}, this is {{agent_name}} with {{client_name}}…',
  questions: [''], booking: '', objections: [], is_default: false,
});

export function ScriptEditor({ clients }: { clients: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data: scripts = [] } = useQuery({
    queryKey: ['setter_scripts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setter_scripts').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as SetterScript[];
    },
  });
  const [scope, setScope] = useState<string>(AGENCY);
  const [selId, setSelId] = useState<string | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => scripts.filter((s) => (scope === AGENCY ? !s.client_id : s.client_id === scope)), [scripts, scope]);
  useEffect(() => {
    const s = list.find((x) => x.id === selId) ?? list[0] ?? null;
    setSelId(s?.id ?? null);
    setD(s ? { ...s, questions: [...s.questions], objections: (s.objections || []).map((o) => ({ ...o })) } : null);
  }, [scope, selId, scripts]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Draft>) => setD((p) => (p ? { ...p, ...patch } : p));
  const setObj = (i: number, patch: Partial<Objection>) =>
    set({ objections: d!.objections.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  const save = async () => {
    if (!d) return;
    if (!d.name.trim()) return toast.error('Name is required');
    setSaving(true);
    const row = {
      client_id: d.client_id, name: d.name.trim(), opening: d.opening, booking: d.booking,
      questions: d.questions.map((q) => q.trim()).filter(Boolean),
      objections: d.objections.filter((o) => o.label.trim() && o.reply.trim()) as any,
      is_default: d.is_default,
    };
    try {
      if (row.is_default) {
        let q = supabase.from('setter_scripts').update({ is_default: false });
        q = row.client_id ? q.eq('client_id', row.client_id) : q.is('client_id', null);
        if (d.id) q = q.neq('id', d.id);
        await q;
      }
      const res = d.id
        ? await supabase.from('setter_scripts').update(row).eq('id', d.id).select('id').single()
        : await supabase.from('setter_scripts').insert(row).select('id').single();
      if (res.error) throw res.error;
      setSelId(res.data.id);
      await qc.invalidateQueries({ queryKey: ['setter_scripts'] });
      toast.success('Script saved');
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || e}. Only operators can edit scripts.`);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!d?.id || !confirm(`Delete "${d.name}"?`)) return;
    const { error } = await supabase.from('setter_scripts').delete().eq('id', d.id);
    if (error) return toast.error(error.message);
    setSelId(null);
    qc.invalidateQueries({ queryKey: ['setter_scripts'] });
  };

  const clientId = scope === AGENCY ? null : scope;

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-0">
      <aside className="border-r p-3 space-y-3 overflow-auto">
        <Select value={scope} onValueChange={(v) => { setScope(v); setSelId(null); }}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={AGENCY}>Agency default (all clients)</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          {list.map((s) => (
            <button key={s.id} onClick={() => setSelId(s.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${s.id === selId ? 'bg-muted' : 'hover:bg-muted/50'}`}>
              <span className="truncate flex-1">{s.name}</span>
              {s.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
            </button>
          ))}
          {list.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              {clientId ? 'No script for this client — setters see the agency default.' : 'No agency script yet.'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setSelId(null); setD(blank(clientId)); }}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
          {clientId && (
            <Button size="sm" variant="outline" className="flex-1 gap-1" title="Start from the agency default"
              onClick={() => {
                const a = scripts.find((s) => !s.client_id && s.is_default) ?? scripts.find((s) => !s.client_id);
                if (!a) return toast.error('No agency script to copy');
                setSelId(null);
                setD({ ...a, id: undefined, client_id: clientId, name: `${a.name} (copy)`, is_default: true, questions: [...a.questions], objections: a.objections.map((o) => ({ ...o })) });
              }}>
              <Copy className="w-3.5 h-3.5" /> Copy agency
            </Button>
          )}
        </div>
      </aside>

      <section className="overflow-auto p-6">
        {!d ? (
          <p className="text-sm text-muted-foreground">Pick or create a script.</p>
        ) : (
          <div className="max-w-3xl space-y-5">
            <div className="flex items-center gap-3">
              <Input value={d.name} onChange={(e) => set({ name: e.target.value })} className="text-base font-medium" />
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={d.is_default} onCheckedChange={(v) => set({ is_default: v })} /> Default
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Placeholders: <code>{'{{first_name}}'}</code> <code>{'{{client_name}}'}</code> <code>{'{{agent_name}}'}</code>
            </p>
            <Field label="Opening"><Textarea rows={3} value={d.opening} onChange={(e) => set({ opening: e.target.value })} /></Field>
            <Field label="Discovery questions">
              <div className="space-y-2">
                {d.questions.map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-6 pt-2">Q{i + 1}</span>
                    <Input value={q} onChange={(e) => set({ questions: d.questions.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <Button size="icon" variant="ghost" onClick={() => set({ questions: d.questions.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => set({ questions: [...d.questions, ''] })}><Plus className="w-3.5 h-3.5" /> Question</Button>
              </div>
            </Field>
            <Field label="Booking close"><Textarea rows={2} value={d.booking} onChange={(e) => set({ booking: e.target.value })} /></Field>
            <Field label="Objection replies">
              <div className="space-y-3">
                {d.objections.map((o, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input placeholder="Label (e.g. Send info)" value={o.label} onChange={(e) => setObj(i, { label: e.target.value })} />
                      <Button size="icon" variant="ghost" onClick={() => set({ objections: d.objections.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <Input placeholder="Trigger words, comma separated (e.g. send info, email me)"
                      value={o.keywords.join(', ')}
                      onChange={(e) => setObj(i, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
                    <Textarea rows={2} placeholder="Suggested reply" value={o.reply} onChange={(e) => setObj(i, { reply: e.target.value })} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => set({ objections: [...d.objections, { label: '', keywords: [], reply: '' }] })}>
                  <Plus className="w-3.5 h-3.5" /> Objection
                </Button>
              </div>
            </Field>
            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={save} disabled={saving} className="gap-1"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save script'}</Button>
              {d.id && <Button variant="ghost" onClick={remove} className="gap-1 text-destructive"><Trash2 className="w-4 h-4" /> Delete</Button>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>{children}</div>;
}
