import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2,
  Send,
  Sparkles,
  Loader2,
  FileText,
  Film,
} from 'lucide-react';
import { TaskFile } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';

interface InlineFilePreviewProps {
  files: TaskFile[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onOpenLightbox: () => void;
  onSendToCreative: (file: TaskFile) => void;
  onAIReview: (file: TaskFile) => void;
  isReviewing?: boolean;
  reviewingFileId?: string | null;
}

export function InlineFilePreview({
  files,
  currentIndex,
  onNavigate,
  onOpenLightbox,
  onSendToCreative,
  onAIReview,
  isReviewing = false,
  reviewingFileId = null,
}: InlineFilePreviewProps) {
  const currentFile = files[currentIndex];
  
  if (!currentFile) return null;
  
  const getFilePreviewType = (fileType: string | null, fileName: string): 'image' | 'video' | 'pdf' | 'document' => {
    if (fileType?.startsWith('image/')) return 'image';
    if (fileType?.startsWith('video/')) return 'video';
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'document';
  };
  
  const previewType = getFilePreviewType(currentFile.file_type, currentFile.file_name);
  const canReview = previewType === 'image' || previewType === 'video';
  const isCurrentFileReviewing = reviewingFileId === currentFile.id;
  
  const handlePrev = () => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };
  
  const handleNext = () => {
    if (currentIndex < files.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };
  
  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      {/* Preview Area */}
      <div className="relative aspect-video max-h-[300px] flex items-center justify-center bg-black/5">
        {/* Navigation arrows */}
        {files.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 z-10 bg-background/80 hover:bg-background h-8 w-8"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 z-10 bg-background/80 hover:bg-background h-8 w-8"
              onClick={handleNext}
              disabled={currentIndex === files.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {/* Content */}
        <div className="w-full h-full flex items-center justify-center p-4">
          {previewType === 'image' && (
            <img
              src={currentFile.file_url}
              alt={currentFile.file_name}
              className="max-w-full max-h-full object-contain rounded"
            />
          )}
          {previewType === 'video' && (
            <video
              key={currentFile.id}
              src={currentFile.file_url}
              controls
              className="max-w-full max-h-full rounded"
            >
              Your browser does not support the video tag.
            </video>
          )}
          {previewType === 'pdf' && (
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-12 w-12" />
              <span className="text-sm">PDF Preview</span>
              <Button variant="outline" size="sm" onClick={onOpenLightbox}>
                Open PDF
              </Button>
            </div>
          )}
          {previewType === 'document' && (
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-12 w-12" />
              <span className="text-sm">{currentFile.file_name}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* File Info & Actions */}
      <div className="p-3 border-t bg-background">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {previewType === 'video' && <Film className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            <span className="text-sm font-medium truncate">{currentFile.file_name}</span>
            {files.length > 1 && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                ({currentIndex + 1} of {files.length})
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {canReview && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAIReview(currentFile)}
                disabled={isReviewing}
                className="h-8"
              >
                {isCurrentFileReviewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 hidden sm:inline">AI Review</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSendToCreative(currentFile)}
              className="h-8"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">Send to Creative</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenLightbox}
              className="h-8 w-8"
              title="View fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
