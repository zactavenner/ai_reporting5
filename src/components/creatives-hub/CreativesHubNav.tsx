import { Badge } from '@/components/ui/badge';
import type { HubSection } from '@/pages/CreativesHubPage';
import {
  LayoutGrid,
  PenTool,
  Film,
  Image,
  Radar,
  CheckCircle,
  BarChart3,
} from 'lucide-react';

interface CreativesHubNavProps {
  activeSection: HubSection;
  onSectionChange: (section: HubSection) => void;
  statusCounts: {
    pending: number;
  };
}

const NAV_ITEMS: { id: HubSection; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'scripts', label: 'AI Scripts', icon: PenTool },
  { id: 'video', label: 'Video Ads', icon: Film },
  { id: 'static', label: 'Static Ads', icon: Image },
  { id: 'research', label: 'Ad Research', icon: Radar },
  { id: 'review', label: 'Review', icon: CheckCircle },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
];

export function CreativesHubNav({ activeSection, onSectionChange, statusCounts }: CreativesHubNavProps) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-1 -mb-px scrollbar-none">
      {NAV_ITEMS.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`
              relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
              transition-all duration-200 whitespace-nowrap
              ${isActive
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }
            `}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
            {item.id === 'review' && statusCounts.pending > 0 && (
              <Badge
                variant={isActive ? 'outline' : 'default'}
                className={`
                  h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5
                  ${isActive ? 'border-background/30 text-background' : ''}
                `}
              >
                {statusCounts.pending}
              </Badge>
            )}
          </button>
        );
      })}
    </nav>
  );
}
