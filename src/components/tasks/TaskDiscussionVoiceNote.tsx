import { useState, useRef } from 'react';
import { Mic, Square, Loader2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
 import { useAddVoiceComment, useCreateTask, useAgencyMembers } from '@/hooks/useTasks';
 import { useAgencyPods } from '@/hooks/useAgencyPods';
 import { useSetTaskAssignees } from '@/hooks/useTaskAssignees';
 import { VoiceNoteTaskReview } from './VoiceNoteTaskReview';
 import { format } from 'date-fns';

interface TaskDiscussionVoiceNoteProps {
  taskId: string;
  authorName: string;
   clientId?: string;
   clientName?: string;
   mode?: 'comment' | 'create_task';
   onTaskCreated?: () => void;
}

export function TaskDiscussionVoiceNote({ 
  taskId, 
  authorName, 
  clientId,
  clientName,
  mode = 'comment',
  onTaskCreated,
}: TaskDiscussionVoiceNoteProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
   const [showReview, setShowReview] = useState(false);
   const [extractedData, setExtractedData] = useState<{
     transcript: string;
     extracted: any;
     audioUrl: string;
     duration: number;
   } | null>(null);
   const [isCreatingTask, setIsCreatingTask] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const addVoiceComment = useAddVoiceComment();
   const createTask = useCreateTask();
   const setTaskAssignees = useSetTaskAssignees();
   const { data: agencyMembers = [] } = useAgencyMembers();
   const { data: pods = [] } = useAgencyPods();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;
    
    return new Promise<Blob>((resolve) => {
      mediaRecorderRef.current!.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob);
      };
      
      mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setIsRecording(false);
    });
  };

  const handleStopAndProcess = async () => {
    setIsProcessing(true);
    
    try {
      const audioBlob = await stopRecording();
      const duration = recordingTime;
      
      // Upload to storage
      const fileName = `task-${taskId}/${Date.now()}-voice.webm`;
      const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(fileName, audioBlob);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('task-files')
        .getPublicUrl(fileName);
      
       if (mode === 'create_task') {
         // Use enhanced extraction for task creation
         toast.info('Analyzing voice note...');
         
         const { data: extractData, error: extractError } = await supabase.functions.invoke('process-voice-note', {
           body: { 
             action: 'extract_task_details',
             audioUrl: publicUrl,
             existingTaskContext: { clientId, clientName },
             agencyMembers: agencyMembers.map(m => ({ id: m.id, name: m.name, pod_id: m.pod_id })),
             agencyPods: pods.map(p => ({ id: p.id, name: p.name })),
           },
        });
         
         if (extractError) {
           console.error('Extraction error:', extractError);
           toast.error('Failed to analyze voice note');
           setIsProcessing(false);
           return;
         }
         
         if (!extractData?.transcript) {
           toast.error('No speech detected in recording');
           setIsProcessing(false);
           return;
         }
         
         // Show review dialog with extracted data
         setExtractedData({
           transcript: extractData.transcript,
           extracted: extractData.extracted,
           audioUrl: publicUrl,
           duration,
         });
         setShowReview(true);
       } else {
         // Original comment-only flow
         let transcript = '';
         try {
           const { data: transcriptData } = await supabase.functions.invoke('process-voice-note', {
             body: { audioUrl: publicUrl, action: 'transcribe_only' },
           });
           transcript = transcriptData?.transcript || '';
         } catch (e) {
           console.log('Transcription not available:', e);
         }
         
         // Add voice comment
         await addVoiceComment.mutateAsync({
           taskId,
           authorName,
           audioUrl: publicUrl,
           durationSeconds: duration,
           transcript,
         });
         
         toast.success('Voice note added');
      }
      
      setRecordingTime(0);
    } catch (error) {
      console.error('Failed to process voice note:', error);
      toast.error('Failed to save voice note');
    } finally {
      setIsProcessing(false);
    }
  };

   const handleConfirmTask = async (taskData: {
     title: string;
     description: string;
     priority: string;
     dueDate: Date | null;
     assignedTo: string;
     assignedPodId: string;
   }) => {
     if (!extractedData) return;
     
     setIsCreatingTask(true);
     
     try {
       // Determine display name for assigned_to
       let displayAssignedTo = taskData.assignedTo || null;
       if (taskData.assignedPodId) {
         const pod = pods.find(p => p.id === taskData.assignedPodId);
         displayAssignedTo = pod ? `${pod.name} Team` : null;
       }
       
       // Create the task
       const newTask = await createTask.mutateAsync({
         title: taskData.title,
         description: taskData.description || null,
         client_id: clientId || null,
         priority: taskData.priority,
         due_date: taskData.dueDate ? format(taskData.dueDate, 'yyyy-MM-dd') : null,
         status: 'todo',
         stage: 'todo',
         assigned_to: displayAssignedTo,
         created_by: authorName,
       });
       
       // Assign pod members if a pod was selected
       if (taskData.assignedPodId && newTask?.id) {
         const podMembers = agencyMembers.filter(m => m.pod_id === taskData.assignedPodId);
         const memberIds = podMembers.map(m => m.id);
         
         if (memberIds.length > 0) {
           await setTaskAssignees.mutateAsync({
             taskId: newTask.id,
             memberIds,
             podIds: [taskData.assignedPodId],
           });
         }
       }
       
       // Add the voice note as the first comment on the task
       if (newTask?.id) {
         await addVoiceComment.mutateAsync({
           taskId: newTask.id,
           authorName,
           audioUrl: extractedData.audioUrl,
           durationSeconds: extractedData.duration,
           transcript: extractedData.transcript,
         });
       }
       
       toast.success('Task created from voice note!');
       setShowReview(false);
       setExtractedData(null);
       onTaskCreated?.();
     } catch (error) {
       console.error('Failed to create task:', error);
       toast.error('Failed to create task');
     } finally {
       setIsCreatingTask(false);
     }
   };

   const handleCancelReview = () => {
     setShowReview(false);
     setExtractedData(null);
   };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

   // Show review dialog when we have extracted data
   if (showReview && extractedData) {
     return (
       <VoiceNoteTaskReview
         transcript={extractedData.transcript}
         extracted={extractedData.extracted}
         audioUrl={extractedData.audioUrl}
         duration={extractedData.duration}
         onConfirm={handleConfirmTask}
         onCancel={handleCancelReview}
         isSubmitting={isCreatingTask}
       />
     );
   }

  return (
    <div className="flex items-center gap-2">
      {isRecording ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 rounded-full">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive">{formatTime(recordingTime)}</span>
          </div>
          <Button 
            size="sm" 
            variant="destructive"
            onClick={handleStopAndProcess}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : (
        <Button 
          size="sm" 
          variant="outline"
          onClick={startRecording}
          disabled={isProcessing}
           title={mode === 'create_task' ? 'Record voice to create task' : 'Record voice note'}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

// Component to play back voice notes with inline transcript
export function VoiceNotePlayer({ audioUrl, duration, transcript }: { audioUrl: string; duration?: number; transcript?: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
        <Button size="sm" variant="ghost" onClick={togglePlay} className="h-8 w-8 p-0">
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-primary/60 rounded-full" 
                style={{ height: `${Math.random() * 12 + 4}px` }}
              />
            ))}
          </div>
        </div>
        {duration && (
          <span className="text-xs text-muted-foreground">{formatTime(duration)}</span>
        )}
      </div>
      
      {/* Inline transcript */}
      {transcript && (
        <div className="px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
          <p className="text-xs text-muted-foreground mb-1 font-medium">Transcript:</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </div>
  );
}