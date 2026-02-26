import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Deal } from '@/hooks/useDeals';
import { differenceInDays } from 'date-fns';

interface DealCardProps {
  deal: Deal;
  onClick: (deal: Deal) => void;
  clientName?: string;
}

export function DealCard({ deal, onClick, clientName }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id, data: { deal } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const daysInStage = differenceInDays(
    new Date(),
    new Date(deal.updated_at)
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="p-3 cursor-pointer hover:shadow-md transition-shadow border border-border"
        onClick={() => onClick(deal)}
      >
        <div className="space-y-2">
          <p className="font-semibold text-sm leading-tight truncate">{deal.deal_name}</p>
          {clientName && (
            <p className="text-xs text-muted-foreground truncate">{clientName}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-primary">
              ${deal.deal_value.toLocaleString()}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {deal.probability}%
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{daysInStage}d in stage</span>
            {deal.assigned_to && <span>{deal.assigned_to}</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
