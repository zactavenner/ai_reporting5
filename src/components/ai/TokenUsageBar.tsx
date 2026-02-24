import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const MODEL_LIMITS: Record<string, number> = {
  'gemini-1.5-flash': 1_048_576,
  'gemini-1.5-pro': 1_048_576,
  'gemini-2.0-flash': 1_048_576,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'grok-beta': 131_072,
  'grok-2': 131_072,
};

export const FULL_MODEL_OPTIONS = [
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', context: '1M', badge: 'Fast' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', context: '1M', badge: 'Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', context: '1M', badge: 'New' },
  { value: 'gpt-4o', label: 'GPT-4o', context: '128K', badge: 'Best' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', context: '128K', badge: 'Mini' },
  { value: 'grok-beta', label: 'Grok Beta', context: '131K', badge: 'xAI' },
  { value: 'grok-2', label: 'Grok 2', context: '131K', badge: 'xAI' },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface TokenUsageBarProps {
  usedTokens: number;
  systemTokens: number;
  model: string;
}

export function TokenUsageBar({ usedTokens, systemTokens, model }: TokenUsageBarProps) {
  const maxTokens = MODEL_LIMITS[model] || 1_048_576;
  const percent = Math.min((usedTokens / maxTokens) * 100, 100);
  const conversationTokens = usedTokens - systemTokens;

  const barColor = percent > 80 
    ? '[&>div]:bg-destructive' 
    : percent > 50 
      ? '[&>div]:bg-yellow-500' 
      : '[&>div]:bg-green-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Tokens</span>
            <Progress 
              value={percent} 
              className={cn("h-2 flex-1", barColor)} 
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatTokens(usedTokens)} / {formatTokens(maxTokens)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>System prompt: ~{formatTokens(systemTokens)} tokens</p>
          <p>Conversation: ~{formatTokens(conversationTokens)} tokens</p>
          <p>Model limit: {formatTokens(maxTokens)} tokens</p>
          <p>Usage: {percent.toFixed(1)}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
