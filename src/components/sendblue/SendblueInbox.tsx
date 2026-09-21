import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageSquarePlus, Send, ShieldOff } from 'lucide-react';
import {
  SendblueLine,
  useSendSendblueMessage,
  useSendblueConversations,
  useSendblueThread,
  useSetSendblueOptout,
} from '@/hooks/useSendblue';

interface Props {
  lines: SendblueLine[];
  clientId?: string;
  clients?: { id: string; name: string }[];
}

const matchLabel: Record<string, string> = {
  matched: 'Linked in CRM',
  unmatched: 'No CRM match',
  ambiguous: 'More than one CRM match',
  no_crm: 'No CRM connected',
};

export function SendblueInbox({ lines, clientId, clients }: Props) {
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [selected, setSelected] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [startingNew, setStartingNew] = useState(false);

  const conversations = useSendblueConversations(clientId, lineFilter === 'all' ? undefined : lineFilter);
  const thread = useSendblueThread(selected);
  const send = useSendSendblueMessage();
  const optout = useSetSendblueOptout();

  const activeConversation = useMemo(
    () => (conversations.data || []).find((c) => c.id === selected),
    [conversations.data, selected],
  );
  const activeLine = lines.find((l) => l.id === (activeConversation?.line_id || lineFilter));
  const outboundLines = lines.filter((l) => l.plan_type === 'outbound' && l.active && l.status === 'connected');
  const clientName = (id: string | null) => (id ? clients?.find((c) => c.id === id)?.name || 'Client' : 'Agency');

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a texting number first — then conversations show up here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Number</Label>
          <Select value={lineFilter} onValueChange={(v) => { setLineFilter(v); setSelected(undefined); }}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All numbers</SelectItem>
              {lines.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.label} · {l.phone_e164}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setStartingNew((v) => !v)} disabled={outboundLines.length === 0}>
          <MessageSquarePlus className="mr-2 h-4 w-4" /> New conversation
        </Button>
        {outboundLines.length === 0 && (
          <span className="text-sm text-muted-foreground">
            Your numbers can only reply to people who text first.
          </span>
        )}
      </div>

      {startingNew && outboundLines.length > 0 && (
        <Card>
          <CardContent className="grid gap-3 pt-6 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Send from</Label>
              <Select value={lineFilter === 'all' ? outboundLines[0].id : lineFilter} onValueChange={setLineFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {outboundLines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+1 555 123 4567" />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                disabled={!newPhone || !draft || send.isPending}
                onClick={() =>
                  send.mutate(
                    {
                      line_id: lineFilter === 'all' ? outboundLines[0].id : lineFilter,
                      phone: newPhone,
                      message: draft,
                      kind: 'new_conversation',
                    },
                    {
                      onSuccess: () => {
                        setDraft('');
                        setNewPhone('');
                        setStartingNew(false);
                        conversations.refetch();
                      },
                    },
                  )
                }
              >
                {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
            <Textarea
              className="md:col-span-3"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="First message…"
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <ScrollArea className="h-[560px]">
            {conversations.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading conversations…</div>
            ) : conversations.error ? (
              <div className="p-6 text-sm text-destructive">{(conversations.error as Error).message}</div>
            ) : (conversations.data || []).length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
            ) : (
              (conversations.data || []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelected(c.id); setStartingNew(false); setDraft(''); }}
                  className={`w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selected === c.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.contact_name || c.contact_phone}</span>
                    {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{c.last_message_preview || '—'}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!clientId && <Badge variant="outline" className="text-[10px]">{clientName(c.client_id)}</Badge>}
                    <Badge variant={c.match_state === 'matched' ? 'secondary' : 'outline'} className="text-[10px]">
                      {matchLabel[c.match_state]}
                    </Badge>
                    {c.opted_out && <Badge variant="destructive" className="text-[10px]">Opted out</Badge>}
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </Card>

        <Card className="flex h-[560px] flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Pick a conversation to read it.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{activeConversation?.contact_name || activeConversation?.contact_phone}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeLine?.label} · {activeLine?.phone_e164} · {matchLabel[activeConversation?.match_state || 'unmatched']}
                  </p>
                </div>
                {activeConversation && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      optout.mutate({
                        line_id: activeConversation.line_id,
                        phone_e164: activeConversation.contact_phone,
                        opted_out: !activeConversation.opted_out,
                      })
                    }
                  >
                    <ShieldOff className="mr-2 h-4 w-4" />
                    {activeConversation.opted_out ? 'Allow messages' : 'Mark opted out'}
                  </Button>
                )}
              </div>

              <ScrollArea className="flex-1 px-4 py-3">
                {thread.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading messages…</p>
                ) : thread.error ? (
                  <p className="text-sm text-destructive">{(thread.error as Error).message}</p>
                ) : (
                  <div className="space-y-3">
                    {(thread.data?.messages || []).map((m) => {
                      const mirror = (thread.data?.mirrors || []).find((x) => x.message_id === m.id);
                      const mine = m.direction === 'outbound';
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            <p className="whitespace-pre-wrap text-sm">{m.body || '(attachment)'}</p>
                            <p className={`mt-1 text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {new Date(m.created_at).toLocaleString()} · {m.channel === 'imessage' ? 'iMessage' : m.channel.toUpperCase()} · {m.status}
                              {mirror ? ` · CRM: ${mirror.status === 'mirrored' ? 'noted' : mirror.skipped_reason || mirror.status}` : ''}
                            </p>
                            {m.error_message && <p className="mt-1 text-[10px] text-destructive">{m.error_message}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t border-border p-3">
                {activeConversation?.opted_out ? (
                  <p className="text-sm text-muted-foreground">This contact asked to stop receiving messages.</p>
                ) : (
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="Write a reply…"
                    />
                    <Button
                      size="sm"
                      disabled={!draft.trim() || send.isPending || !activeConversation}
                      onClick={() =>
                        send.mutate(
                          {
                            line_id: activeConversation!.line_id,
                            phone: activeConversation!.contact_phone,
                            message: draft,
                            kind: 'reply',
                          },
                          { onSuccess: () => { setDraft(''); thread.refetch(); } },
                        )
                      }
                    >
                      {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
