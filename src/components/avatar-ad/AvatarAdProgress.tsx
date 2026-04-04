import { cn } from '@/lib/utils';
import { FileText, Wand2, User, Video, Layers, Check } from 'lucide-react';
import type { AvatarAdStep } from '@/types/avatar-ad';

const STEPS: { id: AvatarAdStep; label: string; icon: typeof FileText }[] = [
  { id: 'deal', label: 'Deal Info', icon: FileText },
  { id: 'script', label: 'Script', icon: Wand2 },
  { id: 'avatar', label: 'Avatar', icon: User },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'composite', label: 'Final', icon: Layers },
];

const ORDER: AvatarAdStep[] = ['deal', 'script', 'avatar', 'video', 'composite'];

export function AvatarAdProgress({ currentStep }: { currentStep: AvatarAdStep }) {
  const currentIdx = ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = step.id === currentStep;
        const Icon = isComplete ? Check : step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all',
                isComplete && 'bg-primary border-primary text-primary-foreground',
                isCurrent && 'border-primary bg-primary/10 text-primary',
                !isComplete && !isCurrent && 'border-muted-foreground/30 text-muted-foreground/50',
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn(
                'text-xs font-medium',
                isCurrent ? 'text-primary' : isComplete ? 'text-foreground' : 'text-muted-foreground/50',
              )}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'w-12 h-0.5 mx-1 mt-[-18px]',
                i < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
