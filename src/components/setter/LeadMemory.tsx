import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Brain, Bot, User, X } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';

type Kind = 'fact' | 'objection';
type Row = { id: string; kind: string; body: string; source: string; author: string | null; created_at: string };

/** Shared facts + past objections for one lead — read by setters and the AI caller. */
export function LeadMemory({ leadId, clientId, author }: { leadId: string; clientId: string; author?: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('fact');
  const key = ['lead_memory', leadId];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_memory').select('id, kind, body, source, author, created_at')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const add = async () => {
    const body = text.trim();
    if (!body) return;
    const { error } = await supabase.from('lead_memory').insert({ lead_id: leadId, client_id: clientId, kind, body, source: 'setter', author: author || null });
    if (error) return toast.error(error.message);
    setText('');
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('lead_memory').delete().eq('id', id);
    if (error) return toast.error('Only operators can remove memory');
    qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="border-b p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Brain className="w-3 h-3" /> Lead memory · {rows.length ? `${rows.length} saved` : "don't ask twice"}
      </div>
      <div className="flex gap-1.5">
        <div className="flex rounded-md border overflow-hidden text-xs shrink-0">
          {(['fact', 'objection'] as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`px-2 ${kind === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>
              {k === 'fact' ? 'Fact' : 'Objection'}
            </button>
          ))}
        </div>
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); e.stopPropagation(); }}
          placeholder={kind === 'fact' ? 'e.g. Has invested in real estate before' : 'e.g. Wants to talk to spouse first'} className="h-8 text-sm" />
        <Button size="sm" className="h-8" onClick={add} disabled={!text.trim()}>Save</Button>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="group flex items-start gap-2 text-sm">
              <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${r.kind === 'objection' ? 'bg-destructive' : 'bg-primary'}`} />
              <span className="flex-1">{r.body}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                {r.source === 'ai_caller' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                {r.author || (r.source === 'ai_caller' ? 'AI caller' : 'Setter')} · {formatDistanceToNowStrict(new Date(r.created_at))}
              </span>
              <button onClick={() => remove(r.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground"><X className="w-3 h-3" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
