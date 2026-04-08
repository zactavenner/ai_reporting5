import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssetInlineChatProps {
  assetId: string;
  assetType: string;
  onContentUpdated?: (newContent: any) => void;
}

export function AssetInlineChat({ assetId, assetType, onContentUpdated }: AssetInlineChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('refine-asset', {
        body: {
          asset_id: assetId,
          message: userMsg,
          conversation_history: newMessages.slice(0, -1).map(m => ({
            role: m.role, content: m.content,
          })),
        },
      });

      if (error) throw error;

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

      if (data.updated_content && onContentUpdated) {
        onContentUpdated(data.updated_content);
        toast.success('Asset updated');
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg = err?.message || 'Failed to get response';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errorMsg}` }]);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">AI Refiner — {assetType}</span>
      </div>

      <ScrollArea className="h-48" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Ask AI to refine this asset — e.g. "Make the email subject lines more urgent" or "Add more statistics to the research"
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && <Bot className="h-4 w-4 text-primary mt-1 shrink-0" />}
              <div className={cn(
                'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
              {msg.role === 'user' && <User className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2">
              <Bot className="h-4 w-4 text-primary mt-1 shrink-0" />
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Refine this asset..."
          className="text-sm h-8"
          disabled={isLoading}
        />
        <Button size="sm" className="h-8 px-2" onClick={sendMessage} disabled={isLoading || !input.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
