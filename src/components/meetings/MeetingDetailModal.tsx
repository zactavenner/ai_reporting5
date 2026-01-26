import { useState } from 'react';
import { format } from 'date-fns';
import { Video, Clock, Users, ExternalLink, Plus, FileText, ListTodo } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Meeting, useAssignMeetingToClient, useCreatePendingTaskFromActionItem } from '@/hooks/useMeetings';
import { Client } from '@/hooks/useClients';

interface MeetingDetailModalProps {
  meeting: Meeting | null;
  clients: Client[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeetingDetailModal({
  meeting,
  clients,
  open,
  onOpenChange,
}: MeetingDetailModalProps) {
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());
  
  const assignMutation = useAssignMeetingToClient();
  const createTaskMutation = useCreatePendingTaskFromActionItem();

  if (!meeting) return null;

  const handleAssignClient = (clientId: string) => {
    assignMutation.mutate({
      meetingId: meeting.id,
      clientId: clientId === 'unassigned' ? null : clientId,
    });
  };

  const handleAddTask = (actionItem: any, index: number) => {
    createTaskMutation.mutate({
      meetingId: meeting.id,
      clientId: meeting.client_id,
      title: actionItem.text || actionItem.content || 'Action Item',
      description: actionItem.notes || actionItem.context || '',
    });
    setAddedItems((prev) => new Set([...prev, index]));
  };

  const assignedClient = clients.find((c) => c.id === meeting.client_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {meeting.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-b pb-4">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {meeting.meeting_date
              ? format(new Date(meeting.meeting_date), 'MMM d, yyyy h:mm a')
              : 'Date unknown'}
            {meeting.duration_minutes && ` • ${meeting.duration_minutes} min`}
          </div>

          <div className="flex items-center gap-2">
            <span>Client:</span>
            <Select
              value={meeting.client_id || 'unassigned'}
              onValueChange={handleAssignClient}
            >
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="Assign client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 ml-auto">
            {meeting.meetgeek_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={meeting.meetgeek_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  MeetGeek
                </a>
              </Button>
            )}
            {meeting.recording_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={meeting.recording_url} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3 w-3 mr-1" />
                  Recording
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Participants */}
        {meeting.participants && meeting.participants.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-4 w-4 text-muted-foreground" />
            {meeting.participants.map((p: any, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">
                {p.name || p.email}
              </Badge>
            ))}
          </div>
        )}

        <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">
              <FileText className="h-4 w-4 mr-2" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="actions">
              <ListTodo className="h-4 w-4 mr-2" />
              Action Items
              {meeting.action_items?.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {meeting.action_items.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="summary" className="mt-0">
              {meeting.summary ? (
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap">{meeting.summary}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No summary available for this meeting
                </p>
              )}
            </TabsContent>

            <TabsContent value="transcript" className="mt-0">
              {meeting.transcript ? (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm font-normal bg-muted p-4 rounded-lg">
                    {meeting.transcript}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No transcript available for this meeting
                </p>
              )}
            </TabsContent>

            <TabsContent value="actions" className="mt-0">
              {meeting.action_items && meeting.action_items.length > 0 ? (
                <div className="space-y-3">
                  {meeting.action_items.map((item: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-start justify-between gap-4 p-3 border rounded-lg bg-card"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {item.text || item.content || 'Action Item'}
                        </p>
                        {(item.notes || item.context || item.assignee) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.notes || item.context}
                            {item.assignee && ` • Assigned: ${item.assignee}`}
                          </p>
                        )}
                      </div>
                      <Button
                        variant={addedItems.has(index) ? 'secondary' : 'outline'}
                        size="sm"
                        disabled={addedItems.has(index) || createTaskMutation.isPending}
                        onClick={() => handleAddTask(item, index)}
                      >
                        {addedItems.has(index) ? (
                          'Added'
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Add Task
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No action items extracted from this meeting
                </p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
