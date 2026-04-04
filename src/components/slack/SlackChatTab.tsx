import { useState, useRef, useEffect } from 'react';
import { useSlackChannelMappings, useSlackActivityLog, useSyncSlackChannels } from '@/hooks/useSlackIntegration';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Send, RefreshCw, Loader2, Hash, MessageSquare, Bot, Zap, FileText, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SlackChatTabProps {
  clientId: string;
  clientName?: string;
}

export function SlackChatTab({ clientId, clientName }: SlackChatTabProps) {
  const { data: mappings = [], isLoading: mappingsLoading } = useSlackChannelMappings(clientId);
  const { data: activity = [], isLoading: activityLoading } = useSlackActivityLog(clientId);
  const syncChannels = useSyncSlackChannels();

  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ ts: string; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mappings.length > 0 && !activeChannel) {
      setActiveChannel(mappings[0].channel_id);
    }
  }, [mappings, activeChannel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity, activeChannel]);

  const channelMessages = activity.filter(
    (m: any) => m.channel_id === activeChannel
  );

  const activeMapping = mappings.find(m => m.channel_id === activeChannel);

  const handleSend = async () => {
    if (!message.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-send-message', {
        body: {
          channel: activeChannel,
          text: message.trim(),
          thread_ts: replyTo?.ts || undefined,
        },
      });
      if (error) throw error;
      setMessage('');
      setReplyTo(null);
      toast.success('Message sent to Slack');
      setTimeout(() => {
        syncChannels.mutate({ client_id: clientId, channel_id: activeChannel });
      }, 1500);
    } catch (err: any) {
      toast.error(`Failed to send: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleSync = () => {
    if (activeChannel) {
      syncChannels.mutate({ client_id: clientId, channel_id: activeChannel });
    } else {
      syncChannels.mutate({ client_id: clientId });
    }
  };

  if (mappingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="font-medium text-foreground">No Slack Channels Synced</p>
          <p className="text-sm text-muted-foreground mt-1">
            Map Slack channels to this client in Settings → Slack Integration
          </p>
        </div>
      </div>
    );
  }

  const TYPE_ICON: Record<string, typeof MessageSquare> = {
    message: MessageSquare,
    mention: Bot,
    task_action: Zap,
    file_share: FileText,
    bot_response: Bot,
  };

  return (
    <div className="flex h-[600px] border border-border rounded-lg overflow-hidden bg-card">
      {/* Channel sidebar */}
      <div className="w-56 border-r border-border flex flex-col bg-muted/20">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold">Channels</h4>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSync}
            disabled={syncChannels.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncChannels.isPending && "animate-spin")} />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {mappings.map(mapping => {
              const unread = activity.filter(
                (m: any) => m.channel_id === mapping.channel_id
              ).length;
              return (
                <button
                  key={mapping.id}
                  onClick={() => setActiveChannel(mapping.channel_id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                    activeChannel === mapping.channel_id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1">{mapping.channel_name || mapping.channel_id}</span>
                  {unread > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
                      {unread}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {activeMapping && (
          <div className="p-2 border-t border-border space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3" />
              {activeMapping.auto_create_tasks ? 'Auto-tasks ON' : 'Auto-tasks OFF'}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {activeMapping.monitor_messages ? 'Monitoring ON' : 'Monitoring OFF'}
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">
              {activeMapping?.channel_name || activeChannel || 'Select a channel'}
            </span>
            {clientName && (
              <Badge variant="outline" className="text-[10px]">{clientName}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {channelMessages.length} messages
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSync}
              disabled={syncChannels.isPending}
            >
              <RefreshCw className={cn("h-3 w-3", syncChannels.isPending && "animate-spin")} />
              Sync
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {activityLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : channelMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No messages synced yet</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={handleSync}>
                Sync Now
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {[...channelMessages].reverse().map((msg: any) => {
                const Icon = TYPE_ICON[msg.message_type] || MessageSquare;
                const isBot = msg.message_type === 'bot_response';
                const timeStr = msg.created_at
                  ? format(new Date(msg.created_at), 'MMM d, h:mm a')
                  : '';
                const aiAnalysis = msg.ai_analysis && Object.keys(msg.ai_analysis).length > 0
                  ? msg.ai_analysis
                  : null;

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'group flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50',
                      isBot && 'bg-primary/5'
                    )}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                      isBot ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {isBot ? <Bot className="h-4 w-4" /> : (msg.user_name?.[0]?.toUpperCase() || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold">{msg.user_name || 'Unknown'}</span>
                        <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                        {msg.linked_task_id && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                            task linked
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                        {msg.message_text}
                      </p>
                      {aiAnalysis && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {aiAnalysis.sentiment && (
                            <Badge variant="secondary" className="text-[9px]">
                              {aiAnalysis.sentiment}
                            </Badge>
                          )}
                          {aiAnalysis.actionable && (
                            <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-500">
                              actionable
                            </Badge>
                          )}
                          {aiAnalysis.category && (
                            <Badge variant="secondary" className="text-[9px]">
                              {aiAnalysis.category}
                            </Badge>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => setReplyTo({ ts: msg.message_ts, text: msg.message_text?.slice(0, 60) || '' })}
                        className="text-[10px] text-muted-foreground hover:text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Reply in thread
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {replyTo && (
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Replying to:</span>
            <span className="text-xs truncate flex-1">{replyTo.text}...</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setReplyTo(null)}>
              ×
            </Button>
          </div>
        )}

        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={activeChannel ? `Message #${activeMapping?.channel_name || activeChannel}` : 'Select a channel...'}
              disabled={!activeChannel || sending}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || !activeChannel || sending}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
