import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAddTaskComment, useAddTaskHistory, TaskFile } from './useTasks';

interface AIReviewResult {
  hasErrors: boolean;
  severity: 'none' | 'minor' | 'critical';
  errors: Array<{ text: string; issue: string; suggestion: string }>;
  summary: string;
  transcript?: string;
}

export function useTaskFileReview() {
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewingFileId, setReviewingFileId] = useState<string | null>(null);
  const addComment = useAddTaskComment();
  const addHistory = useAddTaskHistory();

  const reviewFile = async (
    file: TaskFile,
    taskId: string,
    authorName: string
  ): Promise<AIReviewResult | null> => {
    setIsReviewing(true);
    setReviewingFileId(file.id);

    try {
      const isVideo = file.file_type?.startsWith('video/');
      const isImage = file.file_type?.startsWith('image/');

      if (!isVideo && !isImage) {
        toast.error('AI Review is only available for image and video files');
        return null;
      }

      let transcript: string | undefined;

      // For videos, first transcribe
      if (isVideo) {
        toast.info('Transcribing video...');
        const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('creative-ai-audit', {
          body: { action: 'transcribe', videoUrl: file.file_url }
        });

        if (transcribeError) {
          console.error('Transcribe error:', transcribeError);
          toast.error('Failed to transcribe video');
          return null;
        }

        transcript = transcribeData?.transcript;
        if (!transcript) {
          toast.warning('No speech detected in video');
        }
      }

      // Run spelling/grammar check
      toast.info('Running AI review...');
      const { data: reviewData, error: reviewError } = await supabase.functions.invoke('creative-ai-audit', {
        body: {
          action: 'spelling_check',
          creative: {
            type: isVideo ? 'video' : 'image',
            file_url: file.file_url,
          },
          transcript,
          // For images, the edge function can do OCR
          performOCR: isImage,
        }
      });

      if (reviewError) {
        console.error('Review error:', reviewError);
        toast.error('Failed to run AI review');
        return null;
      }

      const result: AIReviewResult = {
        hasErrors: reviewData?.hasErrors ?? false,
        severity: reviewData?.severity ?? 'none',
        errors: reviewData?.errors ?? [],
        summary: reviewData?.summary ?? 'No issues found.',
        transcript,
      };

      // Post result as a comment on the task
      const commentContent = buildReviewComment(file.file_name, result);
      
      await addComment.mutateAsync({
        taskId,
        authorName: 'AI Review',
        content: commentContent,
      });

      // Add history entry
      await addHistory.mutateAsync({
        taskId,
        action: 'ai_review',
        newValue: file.file_name,
        changedBy: authorName,
      });

      if (result.hasErrors) {
        if (result.severity === 'critical') {
          toast.warning('AI found critical issues - review the comments');
        } else {
          toast.info('AI found minor issues - review the comments');
        }
      } else {
        toast.success('AI review complete - no issues found!');
      }

      return result;
    } catch (err) {
      console.error('AI review failed:', err);
      toast.error('AI review failed');
      return null;
    } finally {
      setIsReviewing(false);
      setReviewingFileId(null);
    }
  };

  return {
    reviewFile,
    isReviewing,
    reviewingFileId,
  };
}

function buildReviewComment(fileName: string, result: AIReviewResult): string {
  let comment = `📄 **AI Review: ${fileName}**\n\n`;

  if (result.transcript) {
    comment += `**Transcript:**\n> ${result.transcript.slice(0, 500)}${result.transcript.length > 500 ? '...' : ''}\n\n`;
  }

  if (result.hasErrors) {
    comment += `⚠️ **${result.severity === 'critical' ? 'Critical' : 'Minor'} Issues Found**\n\n`;
    comment += `${result.summary}\n\n`;

    if (result.errors.length > 0) {
      comment += `**Details:**\n`;
      result.errors.forEach(e => {
        comment += `• "${e.text}" - ${e.issue}\n  → Suggestion: "${e.suggestion}"\n`;
      });
    }
  } else {
    comment += `✅ **No spelling or grammar issues found.**\n\n${result.summary}`;
  }

  return comment;
}
