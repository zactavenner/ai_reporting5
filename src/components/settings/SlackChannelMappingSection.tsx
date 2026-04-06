import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Zap, Eye, Bot, RefreshCw, Loader2, MessageSquare, RotateCcw, Search } from 'lucide-react';
import {
  useSlackChannelMappings,
  useAddSlackChannel,
  useUpdateSlackChannel,
  useRemoveSlackChannel,
  useSlackActivityLog,
  useSyncSlackChannels,
} from '@/hooks/useSlackIntegration';
import { useSlackChannels } from '@/hooks/useSlackChannels';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface SlackChannelMappingSectionProps {
  clientId: string;
}

const CHANNEL_TYPES = [
  { value: 'general', label: 'General', icon: '💬' },
  { value: 'tasks', label: 'Tasks', icon: '📋' },
  { value: 'creative', label: 'Creative', icon: '🎨' },
  { value: 'reporting', label: 'Reporting', icon: '📊' },
  { value: 'review', label: 'Review', icon: '👀' },
  { value: 'other', label: 'Other', icon: '📌' },
];

export function SlackChannelMappingSection({ clientId }: SlackChannelMappingSectionProps) {
  const { data: mappings = [], isLoading } = useSlackChannelMappings(clientId);
  const { data: activityLog = [] } = useSlackActivityLog(clientId);
  const { data: slackChannels = [], isLoading: loadingChannels, isFetching: fetchingChannels } = useSlackChannels();
  const addChannel = useAddSlackChannel();
  const updateChannel = useUpdateSlackChannel();
  const removeChannel = useRemoveSlackChannel();
  const syncChannels = useSyncSlackChannels();
  const queryClient = useQueryClient();

  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [newChannelType, setNewChannelType] = useState('general');
  const [showActivity, setShowActivity] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');

  const handleResyncChannels = async () => {
    setIsResyncing(true);
    await queryClient.invalidateQueries({ queryKey: ['slack-channels'] });
    toast.success('Channel list refreshed from Slack');
    setIsResyncing(false);
  };

  const mappedIds = new Set(mappings.map(m => m.channel_id));
  const availableChannels = slackChannels.filter(ch => !mappedIds.has(ch.id));
  const filteredChannels = availableChannels.filter((channel) => {
    const query = channelSearch.trim().toLowerCase();
    if (!query) return true;
    return channel.name.toLowerCase().includes(query) || channel.id.toLowerCase().includes(query);
  });

  const handleAdd = () => {
    if (!selectedChannelId) return;
    const channel = slackChannels.find(ch => ch.id === selectedChannelId);
    addChannel.mutate({
      client_id: clientId,
      channel_id: selectedChannelId,
      channel_name: channel ? `#${channel.name}` : null,
      channel_type: newChannelType,
      monitor_messages: true,
      auto_create_tasks: false,
    });
    setSelectedChannelId('');
    setNewChannelType('general');
    setChannelSearch('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium mb-1 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Slack Channel Integration
          </h4>
          <p className="text-sm text-muted-foreground">
            Map Slack channels to this client. AI reads all messages and auto-creates tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowActivity(!showActivity)}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            Activity ({activityLog.length})
          </Button>
          <Button
            size="sm"
            onClick={() => syncChannels.mutate({ client_id: clientId })}
            disabled={syncChannels.isPending || mappings.length === 0}
          >
            {syncChannels.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Sync All Channels
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading channels...</p>
      ) : mappings.length > 0 ? (
        <div className="space-y-3">
          {mappings.map((mapping) => {
            const typeInfo = CHANNEL_TYPES.find(t => t.value === mapping.channel_type) || CHANNEL_TYPES[5];
            return (
              <div key={mapping.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{typeInfo.icon}</span>
                    <span className="font-medium text-sm">
                      {mapping.channel_name || mapping.channel_id}
                    </span>
                    <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                    <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
                      {mapping.channel_id}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => syncChannels.mutate({ client_id: clientId, channel_id: mapping.channel_id })}
                      disabled={syncChannels.isPending}
                    >
                      {syncChannels.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeChannel.mutate({ id: mapping.id, client_id: clientId })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={mapping.monitor_messages}
                      onCheckedChange={(checked) =>
                        updateChannel.mutate({ id: mapping.id, client_id: clientId, monitor_messages: checked })
                      }
                    />
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Monitor Messages</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={mapping.auto_create_tasks}
                      onCheckedChange={(checked) =>
                        updateChannel.mutate({ id: mapping.id, client_id: clientId, auto_create_tasks: checked })
                      }
                    />
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Auto-Create Tasks</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-4 text-center text-sm text-muted-foreground">
          No Slack channels mapped yet. Add one below.
        </div>
      )}

      {showActivity && activityLog.length > 0 && (
        <div className="border border-border rounded-lg p-3 space-y-2">
          <h5 className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Recent Activity
          </h5>
          <ScrollArea className="h-48">
            <div className="space-y-2 pr-3">
              {activityLog.map((log: any) => (
                <div key={log.id} className="text-xs border-b border-border pb-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.user_name || 'Unknown'}</span>
                    <span className="text-muted-foreground">
                      {log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2">{log.message_text}</p>
                  {log.linked_task_id && (
                    <Badge variant="secondary" className="text-[10px] mt-1">Task linked</Badge>
                  )}
                  {log.ai_analysis && (log.ai_analysis as any)?.action !== 'none' && (
                    <Badge variant="default" className="text-[10px] mt-1 ml-1">
                      AI: {(log.ai_analysis as any)?.action}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
        <p className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" />
          Add Channel
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-0.5">
              <Label className="text-xs">Slack Channel</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={handleResyncChannels}
                disabled={isResyncing || fetchingChannels}
              >
                {isResyncing || fetchingChannels ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Resync
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="Search channels by name"
                className="h-8 pl-9 text-sm"
              />
            </div>

            <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={loadingChannels ? 'Loading channels...' : `Select a channel (${filteredChannels.length})`} />
              </SelectTrigger>
              <SelectContent className="max-h-[240px] overflow-y-auto">
                {filteredChannels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <span className="flex items-center gap-1.5">
                      {ch.is_private ? '🔒' : '#'} {ch.name}
                      <span className="text-muted-foreground text-[10px] ml-1">
                        ({ch.num_members} members)
                      </span>
                    </span>
                  </SelectItem>
                ))}
                {filteredChannels.length === 0 && !loadingChannels && (
                  <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                    No channels match "{channelSearch || 'your search'}"
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={newChannelType} onValueChange={setNewChannelType}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedChannelId || addChannel.isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Channel
        </Button>
      </div>
    </div>
  );
}