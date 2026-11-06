import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Mail, Phone, ArrowUpRight } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { buildThreads, type InboxEvent } from '@/lib/inbox';

const ICON: Record<string, any> = { sms: MessageSquare, email: Mail, call: Phone };

export function UnifiedInbox({ clientIds, clientNames, memberKey, onOpenLead }: {
  clientIds: string[]; clientNames: Record<string, string>; memberKey: string; onOpenLead: (leadId: string) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');
  const [sel, setSel] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['inbox_events', clientIds.join(',')],
    enabled: clientIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 864e5).toISOString();
      const { data, error } = await supabase.from('contact_timeline_events')
        .select('id, client_id, lead_id, event_type, event_subtype, title, body, event_at, metadata')
        .in('client_id', clientIds).in('event_type', ['sms', 'email', 'call']).not('lead_id', 'is', null)
        .gte('event_at', since).order('event_at', { ascending: false }).limit(1500);
      if (error) throw error;
      return (data ?? []) as InboxEvent[];
    },
  });
  const leadIds = useMemo(() => [...new Set(events.map((e) => e.lead_id!))], [events]);
  const { data: leads = {} } = useQuery({
    queryKey: ['inbox_leads', leadIds.join(',').length, leadIds[0]],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const out: Record<string, { name: string | null; phone: string | null }> = {};
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data } = await supabase.from('leads').select('id, name, phone').in('id', leadIds.slice(i, i + 200));
        (data ?? []).forEach((l: any) => { out[l.id] = { name: l.name, phone: l.phone }; });
      }
      return out;
    },
  });
  const { data: reads = {} } = useQuery({
    queryKey: ['inbox_reads', memberKey],
    queryFn: async () => {
      const { data } = await supabase.from('inbox_reads').select('lead_id, read_at').eq('member_key', memberKey);
      return Object.fromEntries((data ?? []).map((r) => [r.lead_id, r.read_at])) as Record<string, string>;
    },
  });

  const threads = useMemo(() => buildThreads(events, reads), [events, reads]);
  const shown = filter === 'unread' ? threads.filter((t) => t.unread) : threads;
  const unreadCount = threads.filter((t) => t.unread).length;
  const thread = threads.find((t) => t.leadId === sel) ?? null;

  const open = async (leadId: string) => {
    setSel(leadId);
    qc.setQueryData(['inbox_reads', memberKey], (p: any) => ({ ...(p || {}), [leadId]: new Date().toISOString() }));
    await supabase.from('inbox_reads').upsert({ member_key: memberKey, lead_id: leadId, read_at: new Date().toISOString() });
  };

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[380px_1fr] min-h-0">
      <aside className="border-r flex flex-col min-h-0">
        <div className="p-2 border-b flex gap-1">
          {(['unread', 'all'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'secondary' : 'ghost'} onClick={() => setFilter(f)} className="h-7 text-xs">
              {f === 'unread' ? `Unread (${unreadCount})` : `All (${threads.length})`}
            </Button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground self-center pr-1">Last 14 days</span>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading && <p className="p-6 text-sm text-muted-foreground text-center">Loading…</p>}
          {!isLoading && shown.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">{filter === 'unread' ? 'All caught up.' : 'No conversations.'}</p>}
          {shown.map((t) => {
            const Icon = ICON[t.last.event_type] || MessageSquare;
            const l = leads[t.leadId];
            return (
              <button key={t.leadId} onClick={() => open(t.leadId)}
                className={`w-full text-left px-3 py-2.5 border-b flex gap-2.5 ${sel === t.leadId ? 'bg-muted' : 'hover:bg-muted/40'}`}>
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${t.unread ? 'bg-primary' : 'bg-transparent'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm ${t.unread ? 'font-semibold' : ''}`}>{l?.name || l?.phone || 'Unknown lead'}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{formatDistanceToNowStrict(new Date(t.last.event_at))}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t.last.event_subtype === 'outbound' ? 'You: ' : ''}{t.last.body || t.last.title || t.last.event_type}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{clientNames[t.clientId] || ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="min-h-0 flex flex-col">
        {!thread ? (
          <p className="m-auto text-sm text-muted-foreground">Pick a conversation.</p>
        ) : (
          <>
            <div className="border-b px-4 py-3 flex items-center gap-2">
              <span className="font-medium">{leads[thread.leadId]?.name || 'Lead'}</span>
              <Badge variant="outline" className="text-[10px]">{clientNames[thread.clientId]}</Badge>
              <Button size="sm" variant="outline" className="ml-auto gap-1 h-8" onClick={() => onOpenLead(thread.leadId)}>
                Open lead <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {[...thread.events].reverse().map((e) => {
                const out = e.event_subtype === 'outbound';
                const Icon = ICON[e.event_type] || MessageSquare;
                return (
                  <div key={e.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <div className="flex items-center gap-1 text-[10px] opacity-70 mb-0.5"><Icon className="w-3 h-3" />{format(new Date(e.event_at), 'MMM d, h:mm a')}</div>
                      <div className="whitespace-pre-wrap">{e.body || e.title || e.event_type}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
