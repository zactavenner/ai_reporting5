import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle, X, Video, Edit2, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PendingMeetingTask,
  useApprovePendingTask,
  useRejectPendingTask,
  useUpdatePendingTask,
} from '@/hooks/useMeetings';
import { Client } from '@/hooks/useClients';

interface PendingTasksReviewProps {
  tasks: PendingMeetingTask[];
  clients: Client[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PendingTasksReview({
  tasks,
  clients,
  open,
  onOpenChange,
}: PendingTasksReviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    priority: string;
    client_id: string | null;
  }>({ title: '', description: '', priority: 'medium', client_id: null });

  const approveMutation = useApprovePendingTask();
  const rejectMutation = useRejectPendingTask();
  const updateMutation = useUpdatePendingTask();

  const startEdit = (task: PendingMeetingTask) => {
    setEditingId(task.id);
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      client_id: task.client_id,
    });
  };

  const saveEdit = async (taskId: string) => {
    await updateMutation.mutateAsync({
      id: taskId,
      updates: editForm,
    });
    setEditingId(null);
  };

  const handleApprove = (task: PendingMeetingTask) => {
    approveMutation.mutate({
      pendingTaskId: task.id,
      clientId: task.client_id,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      meetingId: task.meeting_id || null,
    });
  };

  const handleReject = (taskId: string) => {
    rejectMutation.mutate(taskId);
  };

  // Group tasks by meeting
  const tasksByMeeting = tasks.reduce((acc, task) => {
    const meetingId = task.meeting_id;
    if (!acc[meetingId]) {
      acc[meetingId] = {
        meeting: task.meeting,
        tasks: [],
      };
    }
    acc[meetingId].tasks.push(task);
    return acc;
  }, {} as Record<string, { meeting: any; tasks: PendingMeetingTask[] }>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Pending Tasks from Meetings
            <Badge variant="secondary">{tasks.length} pending</Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No pending tasks to review</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tasks from meetings will appear here for approval
              </p>
            </div>
          ) : (
            <div className="space-y-6 pr-4">
              {Object.entries(tasksByMeeting).map(([meetingId, { meeting, tasks: meetingTasks }]) => (
                <div key={meetingId} className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Video className="h-4 w-4" />
                    <span>From: {meeting?.title || 'Unknown Meeting'}</span>
                    {meeting?.meeting_date && (
                      <span>({format(new Date(meeting.meeting_date), 'MMM d')})</span>
                    )}
                  </div>

                  {meetingTasks.map((task) => {
                    const isEditing = editingId === task.id;
                    const client = clients.find((c) => c.id === task.client_id);

                    return (
                      <div
                        key={task.id}
                        className="border rounded-lg p-4 bg-card space-y-3"
                      >
                        {isEditing ? (
                          <>
                            <Input
                              value={editForm.title}
                              onChange={(e) =>
                                setEditForm({ ...editForm, title: e.target.value })
                              }
                              placeholder="Task title"
                            />
                            <Textarea
                              value={editForm.description}
                              onChange={(e) =>
                                setEditForm({ ...editForm, description: e.target.value })
                              }
                              placeholder="Description (optional)"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <Select
                                value={editForm.client_id || 'unassigned'}
                                onValueChange={(v) =>
                                  setEditForm({
                                    ...editForm,
                                    client_id: v === 'unassigned' ? null : v,
                                  })
                                }
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Assign client" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">No client</SelectItem>
                                  {clients.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={editForm.priority}
                                onValueChange={(v) =>
                                  setEditForm({ ...editForm, priority: v })
                                }
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => saveEdit(task.id)}
                                disabled={updateMutation.isPending}
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Save
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium">{task.title}</p>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {task.description}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => startEdit(task)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                              <Badge
                                variant={
                                  task.priority === 'high'
                                    ? 'destructive'
                                    : task.priority === 'medium'
                                    ? 'default'
                                    : 'secondary'
                                }
                              >
                                {task.priority}
                              </Badge>
                              {client ? (
                                <Badge variant="outline">{client.name}</Badge>
                              ) : (
                                <span className="text-muted-foreground">No client assigned</span>
                              )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReject(task.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(task)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
