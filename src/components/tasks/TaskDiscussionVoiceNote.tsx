import { useState, useRef } from 'react';
import { Mic, Square, Loader2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAddVoiceComment } from '@/hooks/useTasks';

interface TaskDiscussionVoiceNoteProps {
  taskId: string;
  authorName: string;
}

export function TaskDiscussionVoiceNote({ taskId, authorName }: TaskDiscussionVoiceNoteProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const addVoiceComment = useAddVoiceComment();

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
      
      // Transcribe using AI
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
      
      setRecordingTime(0);
    } catch (error) {
      console.error('Failed to process voice note:', error);
      toast.error('Failed to save voice note');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
          title="Record voice note"
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