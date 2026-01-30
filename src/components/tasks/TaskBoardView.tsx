import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutGrid, 
  List, 
  Plus,
  Clock,
  Trophy,
  PenLine,
  History,
} from 'lucide-react';
import { useAllTasks, Task } from '@/hooks/useTasks';
import { useClients, Client } from '@/hooks/useClients';
import { useTaskMetrics } from '@/hooks/useTaskMetrics';
import { KanbanBoard } from './KanbanBoard';
import { AgencyTaskSummary } from './AgencyTaskSummary';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskHistoryTab } from './TaskHistoryTab';

interface TaskBoardViewProps {
  clientId?: string;
  onClose?: () => void;
  isPublicView?: boolean;
}

export function TaskBoardView({ clientId, onClose, isPublicView = false }: TaskBoardViewProps) {
  const { data: allTasks = [] } = useAllTasks();
  const { data: clients = [] } = useClients();
  const [view, setView] = useState<'kanban' | 'summary' | 'history'>('kanban');
  const [showCreateTask, setShowCreateTask] = useState(false);

  // In public view, only show tasks for the specific client
  const tasks = clientId ? allTasks.filter(t => t.client_id === clientId) : allTasks;
  
  // In public view, only show this client in the clients list
  const filteredClients = isPublicView && clientId 
    ? clients.filter(c => c.id === clientId) 
    : clients;

  // Task metrics
  const metrics = useTaskMetrics(tasks);

  return (
    <Card className="border-2 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Project Management
            </CardTitle>
            
            {/* Task Metrics - Inline with title */}
            {!isPublicView && (
              <div className="flex items-center gap-4 text-sm">
                {metrics.avgCompletionDays !== null && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Avg: <span className="font-medium text-foreground">{metrics.avgCompletionDays}d</span></span>
                  </div>
                )}
                {metrics.topCompleter && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span>
                      <span className="font-medium text-foreground">{metrics.topCompleter.name.split(' ')[0]}</span>
                      <Badge variant="secondary" className="ml-1 text-xs">{metrics.topCompleter.count}</Badge>
                    </span>
                  </div>
                )}
                {metrics.topCreator && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <PenLine className="h-4 w-4 text-blue-500" />
                    <span>
                      <span className="font-medium text-foreground">{metrics.topCreator.name.split(' ')[0]}</span>
                      <Badge variant="outline" className="ml-1 text-xs">{metrics.topCreator.count}</Badge>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {!isPublicView && (
              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="summary" className="text-xs px-3 h-7">
                    <List className="h-3 w-3 mr-1" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="text-xs px-3 h-7">
                    <LayoutGrid className="h-3 w-3 mr-1" />
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs px-3 h-7">
                    <History className="h-3 w-3 mr-1" />
                    History
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Button size="sm" onClick={() => setShowCreateTask(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'kanban' ? (
          <KanbanBoard tasks={tasks} clients={filteredClients} clientId={clientId} isPublicView={isPublicView} />
        ) : view === 'summary' ? (
          <AgencyTaskSummary />
        ) : (
          <TaskHistoryTab tasks={tasks} clientId={clientId} />
        )}
      </CardContent>

      <CreateTaskModal
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        clients={filteredClients}
        defaultClientId={clientId}
      />
    </Card>
  );
}
