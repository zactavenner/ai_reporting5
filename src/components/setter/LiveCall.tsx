import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, PhoneOff, Radio } from 'lucide-react';
import { toast } from 'sonner';

const LIVE = ['queued', 'ringing_setter', 'in_progress'];
const LABEL: Record<string, string> = {
  queued: 'Starting…', ringing_setter: 'Ringing your phone', in_progress: 'Live', completed: 'Ended', failed: 'Failed', no_answer: 'No answer',
};

/** Twilio bridge call with live transcript. Each final line the lead says is fed to the coach. */
export function LiveCall({ lead, setterName, setterPhone, onLeadLine }: {
  lead: { id: string; client_id: string; phone?: string | null };
  setterName?: string | null; setterPhone?: string; onLeadLine: (text: string) => void;
}) {
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(setterPhone || localStorage.getItem('setter_callback_phone') || '');
  useEffect(() => { setCallId(null); }, [lead.id]);

  const { data: call } = useQuery({
    queryKey: ['setter_call', callId],
    enabled: !!callId,
    refetchInterval: (q) => (LIVE.includes((q.state.data as any)?.status) ? 2000 : false),
    queryFn: async () => {
      const { data } = await supabase.from('setter_calls').select('id, status, error').eq('id', callId!).maybeSingle();
      return data;
    },
  });
  const live = !!call && LIVE.includes(call.status);
  const { data: lines = [] } = useQuery({
    queryKey: ['setter_call_lines', callId],
    enabled: !!callId,
    refetchInterval: live ? 2000 : false,
    queryFn: async () => {
      const { data } = await supabase.from('setter_call_lines').select('id, speaker, body, created_at').eq('call_id', callId!).order('created_at');
      return data ?? [];
    },
  });

  const lastFed = useRef<string | null>(null);
  useEffect(() => {
    const last = [...lines].reverse().find((l) => l.speaker === 'lead');
    if (last && last.id !== lastFed.current) { lastFed.current = last.id; onLeadLine(last.body); }
  }, [lines, onLeadLine]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [lines.length]);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('setter-twilio-call', { body: { password: 'HPA1234$', ...body } });
    if (data?.error) throw new Error(data.error);
    if (error) throw error;
    return data;
  };
  const start = async () => {
    if (!lead.phone) return toast.error('Lead has no phone');
    setBusy(true);
    try {
      localStorage.setItem('setter_callback_phone', phone);
      const d = await invoke({ action: 'start', client_id: lead.client_id, lead_id: lead.id, to_phone: lead.phone, setter_phone: phone, setter_name: setterName });
      setCallId(d.call_id);
      toast.success('Your phone will ring — answer to connect the lead');
    } catch (e: any) { toast.error(`Call failed: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const hangup = async () => {
    setBusy(true);
    try { await invoke({ action: 'hangup', call_id: callId }); } catch (e: any) { toast.error(e?.message || String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="border-b p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Radio className={`w-3.5 h-3.5 ${live ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Call with live transcript</span>
        {call && <Badge variant={live ? 'default' : 'outline'} className="text-[10px]">{LABEL[call.status] || call.status}</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {!live && (
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
              placeholder="Your phone" className="h-8 w-36 text-xs" title="We ring you first, then the lead" />
          )}
          {live ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={hangup} disabled={busy}><PhoneOff className="w-3.5 h-3.5" /> Hang up</Button>
          ) : (
            <Button size="sm" className="h-8 gap-1" onClick={start} disabled={busy || !phone}><PhoneCall className="w-3.5 h-3.5" /> Call</Button>
          )}
        </div>
      </div>
      {call?.error && <p className="text-xs text-destructive">{call.error}</p>}
      {lines.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-md bg-muted/30 p-2 space-y-1 text-sm">
          {lines.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span className={`text-[10px] font-mono w-10 shrink-0 pt-0.5 ${l.speaker === 'lead' ? 'text-primary' : 'text-muted-foreground'}`}>{l.speaker === 'lead' ? 'Lead' : 'You'}</span>
              <span>{l.body}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
