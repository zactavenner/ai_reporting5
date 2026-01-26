import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  PlusCircle,
  Upload,
  ThumbsUp,
  Rocket,
  Clock,
  Image,
  Video,
  FileText,
  Filter,
  CheckSquare,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Task } from '@/hooks/useTasks';
import { Creative } from '@/hooks/useCreatives';
import { cn } from '@/lib/utils';

interface ActivityFeedProps {
  tasks: Task[];
  creatives: Creative[];
}

type ActivityType = 'task_created' | 'task_completed' | 'creative_uploaded' | 'creative_approved' | 'creative_launched' | 'meeting_synced' | 'meeting_task_created';

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  timestamp: Date;
  metadata?: {
    creativeType?: string;
    platform?: string;
    priority?: string;
  };
}

const ACTIVITY_CONFIG: Record<ActivityType, { icon: typeof CheckCircle2; label: string; color: string }> = {
  task_created: { icon: PlusCircle, label: 'Task Created', color: 'text-blue-500' },
  task_completed: { icon: CheckCircle2, label: 'Task Completed', color: 'text-green-500' },
  creative_uploaded: { icon: Upload, label: 'Creative Uploaded', color: 'text-purple-500' },
  creative_approved: { icon: ThumbsUp, label: 'Creative Approved', color: 'text-emerald-500' },
  creative_launched: { icon: Rocket, label: 'Creative Launched', color: 'text-orange-500' },
  meeting_synced: { icon: Video, label: 'Meeting Synced', color: 'text-indigo-500' },
  meeting_task_created: { icon: CheckSquare, label: 'Task from Meeting', color: 'text-cyan-500' },
};

export function ActivityFeed({ tasks, creatives }: ActivityFeedProps) {
  const [filters, setFilters] = useState<Set<ActivityType>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Build unified activity list
  const activities = useMemo(() => {
    const items: Activity[] = [];

    // Task activities
    tasks.forEach(task => {
      // Task created
      items.push({
        id: `task-created-${task.id}`,
        type: 'task_created',
        title: task.title,
        timestamp: new Date(task.created_at),
        metadata: { priority: task.priority },
      });

      // Task completed
      if (task.completed_at) {
        items.push({
          id: `task-completed-${task.id}`,
          type: 'task_completed',
          title: task.title,
          timestamp: new Date(task.completed_at),
          metadata: { priority: task.priority },
        });
      }
    });

    // Creative activities
    creatives.forEach(creative => {
      // Creative uploaded (pending status at creation)
      if (creative.status === 'pending') {
        items.push({
          id: `creative-uploaded-${creative.id}`,
          type: 'creative_uploaded',
          title: creative.title,
          timestamp: new Date(creative.created_at),
          metadata: { 
            creativeType: creative.type,
            platform: creative.platform,
          },
        });
      }

      // Creative approved
      if (creative.status === 'approved') {
        items.push({
          id: `creative-approved-${creative.id}`,
          type: 'creative_approved',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          metadata: { 
            creativeType: creative.type,
            platform: creative.platform,
          },
        });
      }

      // Creative launched
      if (creative.status === 'launched') {
        items.push({
          id: `creative-launched-${creative.id}`,
          type: 'creative_launched',
          title: creative.title,
          timestamp: new Date(creative.updated_at),
          metadata: { 
            creativeType: creative.type,
            platform: creative.platform,
          },
        });
      }
    });

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return items;
  }, [tasks, creatives]);

  // Apply filters
  const filteredActivities = useMemo(() => {
    if (filters.size === 0) return activities;
    return activities.filter(a => filters.has(a.type));
  }, [activities, filters]);

  // Limit display
  const displayedActivities = showAll ? filteredActivities : filteredActivities.slice(0, 50);

  const toggleFilter = (type: ActivityType) => {
    const newFilters = new Set(filters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setFilters(newFilters);
  };

  const getCreativeTypeIcon = (type?: string) => {
    switch (type) {
      case 'video': return Video;
      case 'image': return Image;
      case 'copy': return FileText;
      default: return Image;
    }
  };

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Clock className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No activity yet</p>
        <p className="text-xs mt-1">Tasks and creative updates will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredActivities.length} activities
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
              {filters.size > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {filters.size}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(ACTIVITY_CONFIG).map(([type, config]) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={filters.has(type as ActivityType)}
                onCheckedChange={() => toggleFilter(type as ActivityType)}
              >
                <config.icon className={cn('h-4 w-4 mr-2', config.color)} />
                {config.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Activity list */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-1 pr-4">
          {displayedActivities.map((activity) => {
            const config = ACTIVITY_CONFIG[activity.type];
            const Icon = config.icon;
            const CreativeIcon = getCreativeTypeIcon(activity.metadata?.creativeType);

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 py-3 border-b border-border last:border-0"
              >
                <div className={cn('mt-0.5 flex-shrink-0', config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {config.label}
                    </span>
                    {activity.metadata?.creativeType && (
                      <Badge variant="outline" className="text-xs h-5 gap-1">
                        <CreativeIcon className="h-3 w-3" />
                        {activity.metadata.creativeType}
                      </Badge>
                    )}
                    {activity.metadata?.platform && (
                      <Badge variant="secondary" className="text-xs h-5">
                        {activity.metadata.platform}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">
                    {activity.title}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Load more */}
      {!showAll && filteredActivities.length > 50 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Show all {filteredActivities.length} activities
          </Button>
        </div>
      )}
    </div>
  );
}
