import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  LayoutGrid, 
  List, 
  Plus,
  ChevronRight,
} from 'lucide-react';
import { useAllTasks, Task } from '@/hooks/useTasks';
import { useClients, Client } from '@/hooks/useClients';
import { KanbanBoard } from './KanbanBoard';
import { AgencyTaskSummary } from './AgencyTaskSummary';
import { CreateTaskModal } from './CreateTaskModal';

interface TaskBoardViewProps {
  clientId?: string;
  onClose?: () => void;
  isPublicView?: boolean;
}

export function TaskBoardView({ clientId, onClose, isPublicView = false }: TaskBoardViewProps) {
  const { data: allTasks = [] } = useAllTasks();
  const { data: clients = [] } = useClients();
  const [view, setView] = useState<'kanban' | 'summary'>('kanban');
  const [showCreateTask, setShowCreateTask] = useState(false);

  // In public view, only show tasks for the specific client
  const tasks = clientId ? allTasks.filter(t => t.client_id === clientId) : allTasks;
  
  // In public view, only show this client in the clients list
  const filteredClients = isPublicView && clientId 
    ? clients.filter(c => c.id === clientId) 
    : clients;

  return (
    <Card className="border-2 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Project Management
          </CardTitle>
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
        {view === 'kanban' || isPublicView ? (
          <KanbanBoard tasks={tasks} clients={filteredClients} clientId={clientId} isPublicView={isPublicView} />
        ) : (
          <AgencyTaskSummary />
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
