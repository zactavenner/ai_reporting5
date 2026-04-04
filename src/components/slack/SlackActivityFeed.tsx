import { useSlackActivityLog } from '@/hooks/useSlackIntegration';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Zap, Bot, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SlackActivityFeedProps {
  clientId: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof MessageSquare; label: string; color: string }> = {
  message: { icon: MessageSquare, label: 'Message', color: 'text-blue-400' },
  mention: { icon: Bot, label: 'Mention', color: 'text-purple-400' },
  task_action: { icon: Zap, label: 'Task', color: 'text-amber-400' },
  file_share: { icon: FileText, label: 'File', color: 'text-green-400' },
  bot_response: { icon: Bot, label: 'Bot', color: 'text-muted-foreground' },
};

export function SlackActivityFeed({ clientId }: SlackActivityFeedProps) {
  const { data: activity = [], isLoading } = useSlackActivityLog(clientId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading Slack activity...</p>;
  }

  if (activity.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground p-8">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No Slack activity yet.</p>
        <p className="text-xs mt-1">Messages from mapped channels will appear here.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-1 p-2">
        {activity.map((item: any) => {
          const config = TYPE_CONFIG[item.message_type] || TYPE_CONFIG.message;
          const Icon = config.icon;
          const timeAgo = item.created_at
            ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
            : '';

          return (
            <div key={item.id} className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 transition-colors">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{item.user_name || 'Unknown'}</span>
                  {item.linked_task_id && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">linked</Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {item.message_text?.slice(0, 200) || ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
