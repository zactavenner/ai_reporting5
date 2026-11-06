import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Lightbulb, ScrollText, ChevronDown, ChevronRight } from 'lucide-react';
import { fillScript, matchObjection, pickScript, type SetterScript } from '@/lib/setterCoach';

/** Script + objection coach for the lead currently open in Setter. */
export function CallCoach({ clientId, clientName, firstName, agentName }: {
  clientId: string; clientName?: string | null; firstName?: string | null; agentName?: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [said, setSaid] = useState('');
  const { data: scripts = [] } = useQuery({
    queryKey: ['setter_scripts'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('setter_scripts').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as SetterScript[];
    },
  });
  const script = useMemo(() => pickScript(scripts, clientId), [scripts, clientId]);
  const vars = { first_name: firstName || 'there', client_name: clientName || '', agent_name: agentName || '' };
  const hit = script ? matchObjection(said, script.objections || []) : null;

  if (!script) return null;
  const steps = [
    { t: 'Opening', x: script.opening },
    ...script.questions.map((q, i) => ({ t: `Q${i + 1}`, x: q })),
    { t: 'Book', x: script.booking },
  ].filter((s) => s.x);

  return (
    <div className="border-b bg-muted/10">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <ScrollText className="w-3 h-3" /> Script & coach · {script.name}
      </button>
      {open && (
        <div className="px-3 pb-3 grid gap-3 md:grid-cols-2">
          <ol className="space-y-1.5 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0 pt-0.5">{s.t}</span>
                <span>{fillScript(s.x, vars)}</span>
              </li>
            ))}
          </ol>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lightbulb className="w-3.5 h-3.5" /> What did they say?</div>
            <Input value={said} onChange={(e) => setSaid(e.target.value)} placeholder="e.g. just send me info" className="h-8 text-sm" />
            {hit ? (
              <div className="rounded-md bg-primary/10 p-2.5 space-y-1">
                <Badge variant="outline">{hit.label}</Badge>
                <p className="text-sm font-medium">{fillScript(hit.reply, vars)}</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(script.objections || []).map((o) => (
                  <Badge key={o.label} variant="secondary" className="cursor-pointer" onClick={() => setSaid(o.keywords[0] || o.label)}>{o.label}</Badge>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Hotkeys: 1 Booked · 2 Qualified · 3 Callback · 4 Contacted · 5 Nurture · 6 Not interested · 7 Unqualified · H hot</p>
          </div>
        </div>
      )}
    </div>
  );
}
