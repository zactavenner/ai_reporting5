import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useCreateVoiceNote } from '@/hooks/useVoiceNotes';
import { toast } from 'sonner';

interface VoiceRecordButtonProps {
  clientId: string;
  clientName?: string;
  isPublicView?: boolean;
  onNoteCreated?: (note: any) => void;
}

export function VoiceRecordButton({
  clientId,
  clientName,
  isPublicView = false,
  onNoteCreated,
}: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const createVoiceNote = useCreateVoiceNote();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      toast.info('Recording started...', { duration: 2000 });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access microphone. Please check permissions.');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const durationSeconds = recordingTime;

    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve();
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        if (audioBlob.size < 1000) {
          toast.error('Recording too short. Please try again.');
          resolve();
          return;
        }

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];

          toast.loading('Processing voice note...', { id: 'processing-voice' });

          try {
            const result = await createVoiceNote.mutateAsync({
              audioBase64: base64,
              clientId,
              clientName,
              isPublicRecording: isPublicView,
              durationSeconds,
            });

            toast.dismiss('processing-voice');
            
            const taskMsg = result.tasksCreated > 0 
              ? ` • ${result.tasksCreated} task${result.tasksCreated > 1 ? 's' : ''} pending approval`
              : '';
            
            toast.success(`Voice note saved: "${result.voiceNote.title}"${taskMsg}`, {
              duration: 5000,
            });

            onNoteCreated?.(result.voiceNote);
          } catch (error) {
            toast.dismiss('processing-voice');
            console.error('Error processing voice note:', error);
            toast.error(
              error instanceof Error
                ? error.message
                : 'Failed to process voice note'
            );
          }
          resolve();
        };

        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current.stop();
    });
  }, [clientId, clientName, isPublicView, recordingTime, createVoiceNote, onNoteCreated]);

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isProcessing = createVoiceNote.isPending;

  return (
    <Button
      variant={isRecording ? 'destructive' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={isProcessing}
      className="gap-2"
    >
      {isProcessing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Processing...</span>
        </>
      ) : isRecording ? (
        <>
          <Square className="h-4 w-4 fill-current" />
          <span>{formatTime(recordingTime)}</span>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4" />
          <span>Record</span>
        </>
      )}
    </Button>
  );
}
