import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Clock, Users, Bot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ConversationsTab() {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_conversations')
        .select('*, chat_messages(id, role, created_at)')
        .order('updated_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['admin-conv-clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name');
      return data || [];
    },
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));

  const totalConversations = conversations.length;
  const totalMessages = conversations.reduce((sum, c) => sum + (c.chat_messages?.length || 0), 0);
  const avgMessages = totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold">Conversations</h2>
        <p className="text-muted-foreground text-sm">AI chat history and conversation management</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Chats</span>
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{totalConversations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Messages</span>
              <Bot className="h-4 w-4 text-chart-2" />
            </div>
            <p className="text-2xl font-bold">{totalMessages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Messages</span>
              <Users className="h-4 w-4 text-chart-4" />
            </div>
            <p className="text-2xl font-bold">{avgMessages}</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversation List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Recent Conversations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">AI chat conversations will appear here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(conv => {
                const messageCount = conv.chat_messages?.length || 0;
                const clientName = conv.client_id ? clientMap[conv.client_id] : null;

                return (
                  <div
                    key={conv.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title || 'Untitled Conversation'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {clientName && (
                          <Badge variant="secondary" className="text-[10px]">{clientName}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {messageCount} msg{messageCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
