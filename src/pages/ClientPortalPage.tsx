import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, LogOut, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import {
  ClientPortalComment,
  ClientPortalTask,
  useAddClientPortalComment,
  useClientPortal,
  useCreateClientPortalTask,
  useUpdateClientPortalTask,
} from '@/hooks/useClientPortal';

const stages = [
  { id: 'client_tasks', label: 'Client Tasks' },
  { id: 'todo', label: 'To-Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'stuck', label: 'Stuck' },
  { id: 'review', label: 'Review' },
  { id: 'revisions', label: 'Revisions' },
  { id: 'done', label: 'Done' },
];

const priorityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

function prettyDate(value: string | null) {
  if (!value) return 'No due date';
  try {
    return format(new Date(`${value}T00:00:00`), 'MMM d, yyyy');
  } catch {
    return value;
  }
}

export default function ClientPortalPage() {
  const portal = useClientPortal();
  const createTask = useCreateClientPortalTask();
  const updateTask = useUpdateClientPortalTask();
  const addComment = useAddClientPortalComment();
  const navigate = useNavigate();

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<ClientPortalTask | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', due_date: '' });
  const [comment, setComment] = useState('');

  const data = portal.data;
  const activeClientId = selectedClientId || data?.clients?.[0]?.id || '';
  const activeClient = data?.clients?.find((client) => client.id === activeClientId);

  const visibleTasks = useMemo(
    () => (data?.tasks || []).filter((task) => task.client_id === activeClientId),
    [data?.tasks, activeClientId],
  );
  const commentsByTask = useMemo(() => {
    const map = new Map<string, ClientPortalComment[]>();
    for (const row of data?.comments || []) {
      const list = map.get(row.task_id) || [];
      list.push(row);
      map.set(row.task_id, list);
    }
    return map;
  }, [data?.comments]);

  if (portal.error && /sign in/i.test((portal.error as Error).message)) {
    return <Navigate to="/client-login" replace />;
  }

  const submitTask = () => {
    if (!activeClientId || !newTask.title.trim()) return;
    createTask.mutate(
      { client_id: activeClientId, ...newTask },
      {
        onSuccess: () => {
          setNewTask({ title: '', description: '', priority: 'medium', due_date: '' });
          setShowNewTask(false);
        },
      },
    );
  };

  const submitComment = () => {
    if (!selectedTask || !comment.trim()) return;
    addComment.mutate(
      { task_id: selectedTask.id, content: comment },
      { onSuccess: () => setComment('') },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Client Portal</p>
            <h1 className="text-2xl font-semibold tracking-tight">Project Tasks</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => portal.refetch()} disabled={portal.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/client-login');
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {portal.isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : portal.error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-destructive" /> Access unavailable</CardTitle>
              <CardDescription>{(portal.error as Error).message}</CardDescription>
            </CardHeader>
          </Card>
        ) : !data?.clients?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No projects assigned yet</CardTitle>
              <CardDescription>This login is active, but no client projects are assigned to it.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={activeClientId} onValueChange={setSelectedClientId}>
                <TabsList className="flex flex-wrap h-auto">
                  {data.clients.map((client) => (
                    <TabsTrigger key={client.id} value={client.id}>{client.name}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button onClick={() => setShowNewTask(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Project</CardDescription>
                  <CardTitle>{activeClient?.name}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Open tasks</CardDescription>
                  <CardTitle>{visibleTasks.filter((task) => task.stage !== 'done').length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Completed</CardDescription>
                  <CardTitle>{visibleTasks.filter((task) => task.stage === 'done').length}</CardTitle>
                </CardHeader>
              </Card>
            </section>

            <div className="overflow-x-auto pb-4">
              <div className="flex min-w-max items-start gap-4">
                {stages.map((stage) => {
                  const stageTasks = visibleTasks.filter((task) => task.stage === stage.id);
                  return (
                    <Card key={stage.id} className="min-h-[220px] w-[18rem] flex-none sm:w-80">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-sm">
                        <span>{stage.label}</span>
                        <Badge variant="outline">{stageTasks.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {stageTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No tasks</p>
                      ) : stageTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <div className="space-y-2">
                            <p className="text-sm font-medium leading-tight break-words">{task.title}</p>
                            {task.description && <p className="line-clamp-2 text-xs text-muted-foreground break-words">{task.description}</p>}
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant={priorityVariant[task.priority] || 'outline'}>{task.priority}</Badge>
                              <Badge variant="outline" className="gap-1"><CalendarDays className="h-3 w-3" />{prettyDate(task.due_date)}</Badge>
                              {commentsByTask.get(task.id)?.length ? (
                                <Badge variant="outline" className="gap-1"><MessageSquare className="h-3 w-3" />{commentsByTask.get(task.id)?.length}</Badge>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>{activeClient?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={4} value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newTask.priority} onValueChange={(priority) => setNewTask({ ...newTask, priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input type="date" value={newTask.due_date} onChange={(event) => setNewTask({ ...newTask, due_date: event.target.value })} />
              </div>
            </div>
            <Button className="w-full" onClick={submitTask} disabled={createTask.isPending || !newTask.title.trim()}>
              {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 leading-snug">{selectedTask.title}</DialogTitle>
                <DialogDescription>{activeClient?.name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={priorityVariant[selectedTask.priority] || 'outline'}>{selectedTask.priority}</Badge>
                  <Badge variant="outline" className="gap-1"><Clock3 className="h-3 w-3" />{stages.find((stage) => stage.id === selectedTask.stage)?.label || selectedTask.stage}</Badge>
                  <Badge variant="outline" className="gap-1"><CalendarDays className="h-3 w-3" />{prettyDate(selectedTask.due_date)}</Badge>
                </div>
                {selectedTask.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedTask.description}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select
                      value={selectedTask.stage}
                      onValueChange={(stage) => updateTask.mutate({ task_id: selectedTask.id, stage })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={selectedTask.priority}
                      onValueChange={(priority) => updateTask.mutate({ task_id: selectedTask.id, priority })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discussion</Label>
                  <ScrollArea className="h-48 rounded-lg border border-border p-3">
                    <div className="space-y-3">
                      {(commentsByTask.get(selectedTask.id) || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No comments yet.</p>
                      ) : commentsByTask.get(selectedTask.id)?.map((row) => (
                        <div key={row.id} className="rounded-lg bg-muted/50 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{row.author_name}</span>
                            <span>{format(new Date(row.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">{row.content}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" rows={3} />
                  <Button onClick={submitComment} disabled={addComment.isPending || !comment.trim()}>
                    {addComment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Comment
                  </Button>
                </div>
                {selectedTask.stage !== 'done' && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => updateTask.mutate({ task_id: selectedTask.id, stage: 'done' })}
                    disabled={updateTask.isPending}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
