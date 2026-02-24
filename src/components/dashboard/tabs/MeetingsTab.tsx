import { Button } from '@/components/ui/button';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { MeetingsTab as MeetingsTabContent } from '@/components/meetings/MeetingsTab';
import { Client } from '@/hooks/useClients';
import { Meeting } from '@/hooks/useMeetings';

interface MeetingsTabProps {
  meetings: Meeting[];
  clients: Client[];
  pendingTasks: any[];
  syncMeetings: any;
  setPendingTasksOpen: (open: boolean) => void;
}

export const MeetingsTab = ({
  meetings,
  clients,
  pendingTasks,
  syncMeetings,
  setPendingTasksOpen,
}: MeetingsTabProps) => {
  return (
    <div className="space-y-6">
      <SectionErrorBoundary sectionName="Meetings">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Meetings & Highlights</h2>
            <p className="text-sm text-muted-foreground">
              Synced from MeetGeek with action items and highlights
            </p>
          </div>
          <div className="flex gap-2">
            {pendingTasks.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPendingTasksOpen(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {pendingTasks.length} Pending Tasks
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMeetings.mutate()}
              disabled={syncMeetings.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMeetings.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>
        <MeetingsTabContent meetings={meetings} clients={clients} />
      </SectionErrorBoundary>
    </div>
  );
};
