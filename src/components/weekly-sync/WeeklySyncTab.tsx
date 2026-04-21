import { useState, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Mic, Square, Loader2, Plus, Trash2, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  useWeeklySyncs,
  useUpsertWeeklySync,
  useDeleteWeeklySync,
  WeeklySync,
} from '@/hooks/useWeeklySyncs';
import { useWeeklyRecap, buildAutoFillFromRecap } from '@/hooks/useWeeklyRecap';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { WeeklySyncSettings } from './WeeklySyncSettings';

interface Props {
  clientId: string;
  clientName: string;
}

const SECTIONS: Array<{ key: keyof WeeklySync; label: string; minutes: number; placeholder: string }> = [
  { key: 'wins', label: '1. Wins', minutes: 3, placeholder: 'One win from each side…' },
  { key: 'numbers_notes', label: '2. Numbers', minutes: 5, placeholder: 'Leads, booked calls, show rate, $ committed, vs. raise goal…' },
  { key: 'pipeline_notes', label: '3. Pipeline', minutes: 7, placeholder: "Who moved, who's stalled, who's closest to close…" },
  { key: 'working_not_working', label: '4. Working / Not Working', minutes: 5, placeholder: 'Top angle, weak angle, one test for next week…' },
  { key: 'blockers', label: '5. Client Blockers', minutes: 5, placeholder: "What's in the way? Decisions needed?" },
  { key: 'action_items', label: '6. Action Items', minutes: 5, placeholder: 'Top 3 priorities, owners, due dates…' },
];

export function WeeklySyncTab({ clientId, clientName }: Props) {
  const { data: syncs = [], isLoading } = useWeeklySyncs(clientId);
  const upsert = useUpsertWeeklySync();
  const del = useDeleteWeeklySync();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<WeeklySync> | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Roll recap window from the date of the most recent saved sync
  const lastSyncDate = syncs[0]?.sync_date ?? null;
  const { data: recap } = useWeeklyRecap(clientId, lastSyncDate);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startNew = () => {
    setActiveId(null);
    const autoFill = recap ? buildAutoFillFromRecap(recap) : { numbers_notes: '', pipeline_notes: '', working_not_working: '' };
    setDraft({
      client_id: clientId,
      sync_date: format(new Date(), 'yyyy-MM-dd'),
      attendees: '',
      wins: '',
      numbers_notes: autoFill.numbers_notes,
      pipeline_notes: autoFill.pipeline_notes,
      working_not_working: autoFill.working_not_working,
      blockers: '',
      action_items: '',
      recap_email_sent: false,
      crm_updated: false,
    });
  };

  const autoFillCurrentDraft = () => {
    if (!recap || !draft) return;
    const autoFill = buildAutoFillFromRecap(recap);
    setDraft({
      ...draft,
      numbers_notes: autoFill.numbers_notes,
      pipeline_notes: autoFill.pipeline_notes,
      working_not_working: autoFill.working_not_working,
    });
    toast.success('Agenda auto-filled from recap');
  };

  const editExisting = (s: WeeklySync) => {
    setActiveId(s.id);
    setDraft(s);
  };

  const handleSave = async () => {
    if (!draft) return;
    const result = await upsert.mutateAsync({ ...draft, client_id: clientId } as any);
    setActiveId(result.id);
    setDraft(result);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = handleStop;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const handleStop = async () => {
    setIsUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const path = `weekly-syncs/${clientId}/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage
        .from('client-uploads')
        .upload(path, blob, { contentType: 'audio/webm' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      setDraft((d) => ({
        ...(d || { client_id: clientId, sync_date: format(new Date(), 'yyyy-MM-dd') }),
        recording_url: pub.publicUrl,
        recording_storage_path: path,
      }));
      toast.success('Recording uploaded — remember to save the sync');
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const totalMinutes = useMemo(() => SECTIONS.reduce((a, s) => a + s.minutes, 0), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-xl">Weekly Client Sync — {totalMinutes} min</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Client: <span className="font-medium text-foreground">{clientName}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {!isRecording ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startRecording}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? 'Uploading…' : 'Record Call'}
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={stopRecording}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop ({fmtTime(recordingTime)})
                </Button>
              )}
              <Button size="sm" onClick={startNew}>
                <Plus className="h-4 w-4 mr-2" /> New Sync
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Schedule settings */}
      <WeeklySyncSettings clientId={clientId} />

      {/* Auto recap */}
      <WeeklyRecapCard
        clientId={clientId}
        sinceDate={lastSyncDate}
        onAutoFill={draft ? autoFillCurrentDraft : undefined}
      />

      {/* Active draft form */}
      {draft && (
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base">
                {activeId ? 'Edit Sync' : 'New Sync'}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setDraft(null); setActiveId(null); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
                  {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Sync
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={draft.sync_date || ''}
                  onChange={(e) => setDraft({ ...draft, sync_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Attendees</Label>
                <Input
                  value={draft.attendees || ''}
                  onChange={(e) => setDraft({ ...draft, attendees: e.target.value })}
                  placeholder="Names from both sides"
                />
              </div>
            </div>

            {SECTIONS.map((sec) => (
              <div key={sec.key as string}>
                <Label className="flex items-center gap-2">
                  <span>{sec.label}</span>
                  <Badge variant="secondary" className="text-[10px]">{sec.minutes} min</Badge>
                </Label>
                <Textarea
                  rows={3}
                  placeholder={sec.placeholder}
                  value={(draft[sec.key] as string) || ''}
                  onChange={(e) => setDraft({ ...draft, [sec.key]: e.target.value })}
                />
              </div>
            ))}

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">After Call</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!draft.recap_email_sent}
                    onCheckedChange={(v) => setDraft({ ...draft, recap_email_sent: !!v })}
                  />
                  Recap email sent
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!draft.crm_updated}
                    onCheckedChange={(v) => setDraft({ ...draft, crm_updated: !!v })}
                  />
                  CRM updated
                </label>
              </div>
            </div>

            {draft.recording_url && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Call Recording</p>
                <audio controls src={draft.recording_url} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> History Timeline
            <Badge variant="secondary">{syncs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : syncs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No weekly syncs recorded yet. Click <strong>New Sync</strong> to start.
            </p>
          ) : (
            <div className="space-y-2">
              {syncs.map((s) => {
                const expanded = !!expandedHistory[s.id];
                return (
                  <div key={s.id} className="border rounded-md">
                    <button
                      type="button"
                      onClick={() => setExpandedHistory({ ...expandedHistory, [s.id]: !expanded })}
                      className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div>
                          <div className="font-medium">{format(new Date(s.sync_date), 'MMM d, yyyy')}</div>
                          {s.attendees && (
                            <div className="text-xs text-muted-foreground">{s.attendees}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.recording_url && <Badge variant="outline" className="text-[10px]">🎙 Recorded</Badge>}
                        {s.recap_email_sent && <Badge variant="outline" className="text-[10px]">✉ Recap</Badge>}
                        {s.crm_updated && <Badge variant="outline" className="text-[10px]">CRM ✓</Badge>}
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t p-4 space-y-3 bg-muted/20">
                        {SECTIONS.map((sec) => {
                          const val = s[sec.key] as string | null;
                          if (!val) return null;
                          return (
                            <div key={sec.key as string}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{sec.label}</p>
                              <p className="text-sm whitespace-pre-wrap">{val}</p>
                            </div>
                          );
                        })}
                        {s.recording_url && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recording</p>
                            <audio controls src={s.recording_url} className="w-full" />
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => editExisting(s)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Delete this sync?')) {
                                del.mutate({ id: s.id, client_id: clientId });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}