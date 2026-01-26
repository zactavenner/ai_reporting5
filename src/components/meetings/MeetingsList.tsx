import { useState } from 'react';
import { format } from 'date-fns';
import { Video, Clock, Users, ExternalLink, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Meeting, useAssignMeetingToClient } from '@/hooks/useMeetings';
import { Client } from '@/hooks/useClients';
import { MeetingDetailModal } from './MeetingDetailModal';

interface MeetingsListProps {
  meetings: Meeting[];
  clients: Client[];
}

export function MeetingsList({ meetings, clients }: MeetingsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const assignMutation = useAssignMeetingToClient();

  const filteredMeetings = meetings.filter((meeting) =>
    meeting.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAssignClient = (meetingId: string, clientId: string) => {
    assignMutation.mutate({
      meetingId,
      clientId: clientId === 'unassigned' ? null : clientId,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (meetings.length === 0) {
    return (
      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
        <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground mb-2">No meetings synced yet</p>
        <p className="text-sm text-muted-foreground">
          Configure MeetGeek in Agency Settings to start syncing meetings
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-[180px]">Client</TableHead>
                <TableHead className="w-[100px]">Duration</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMeetings.map((meeting) => {
                const isExpanded = expandedId === meeting.id;
                const assignedClient = clients.find((c) => c.id === meeting.client_id);

                return (
                  <>
                    <TableRow
                      key={meeting.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(meeting.id)}
                    >
                      <TableCell className="font-medium">
                        {meeting.meeting_date
                          ? format(new Date(meeting.meeting_date), 'MMM d, yyyy')
                          : 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate max-w-[300px]">{meeting.title}</span>
                          {meeting.action_items && meeting.action_items.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {meeting.action_items.length} actions
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={meeting.client_id || 'unassigned'}
                          onValueChange={(value) => handleAssignClient(meeting.id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="text-sm">
                            {meeting.duration_minutes ? `${meeting.duration_minutes} min` : '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMeeting(meeting);
                            }}
                          >
                            View
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow key={`${meeting.id}-expanded`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-4">
                            {/* Participants */}
                            {meeting.participants && meeting.participants.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                                  <Users className="h-4 w-4" />
                                  Participants
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {meeting.participants.map((p: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {p.name || p.email}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Summary */}
                            {meeting.summary && (
                              <div>
                                <p className="text-sm font-medium mb-1">Summary</p>
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                  {meeting.summary}
                                </p>
                              </div>
                            )}

                            {/* Links */}
                            <div className="flex gap-2">
                              {meeting.meetgeek_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={meeting.meetgeek_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View in MeetGeek
                                  </a>
                                </Button>
                              )}
                              {meeting.recording_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={meeting.recording_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Video className="h-3 w-3 mr-1" />
                                    Watch Recording
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMeeting(meeting);
                                }}
                              >
                                Full Details
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <MeetingDetailModal
        meeting={selectedMeeting}
        clients={clients}
        open={!!selectedMeeting}
        onOpenChange={(open) => !open && setSelectedMeeting(null)}
      />
    </>
  );
}
