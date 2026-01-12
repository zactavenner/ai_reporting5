import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';

interface MetricsContext {
  clientName?: string;
  totalAdSpend?: number;
  leads?: number;
  calls?: number;
  showedCalls?: number;
  costPerLead?: number;
  costPerCall?: number;
  costPerShow?: number;
  fundedInvestors?: number;
  fundedDollars?: number;
  costPerInvestor?: number;
  costOfCapital?: number;
  showedPercent?: number;
}

interface AIAnalysisChatProps {
  context: MetricsContext;
}

const quickQuestions = [
  "What's driving my high CPL?",
  "How can I improve show rates?",
  "Summarize my performance",
  "What needs attention?",
];

export function AIAnalysisChat({ context }: AIAnalysisChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, isLoading, sendMessage, clearMessages } = useAIAnalysis();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput('');
    await sendMessage(message, context, messages);
  };

  const handleQuickQuestion = async (question: string) => {
    if (isLoading) return;
    await sendMessage(question, context, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50',
          'bg-primary hover:bg-primary/90',
          isOpen && 'hidden'
        )}
        size="icon"
      >
        <Sparkles className="h-6 w-6" />
      </Button>

      {/* Chat Panel */}
      <div
        className={cn(
          'fixed bottom-6 right-6 w-96 h-[500px] bg-card border-2 border-border rounded-lg shadow-xl z-50 flex flex-col',
          'transition-all duration-200 ease-in-out',
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">AI Analysis</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              className="h-8 w-8"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Ask me anything about {context.clientName || 'your'} performance metrics.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 px-3 whitespace-normal text-left"
                    onClick={() => handleQuickQuestion(q)}
                    disabled={isLoading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-8'
                      : 'bg-muted mr-8'
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="bg-muted p-3 rounded-lg mr-8">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse delay-75" />
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse delay-150" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your metrics..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
