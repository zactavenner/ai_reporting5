import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  X,
  FileText,
  Film,
} from 'lucide-react';
import { TaskFile } from '@/hooks/useTasks';

interface FilePreviewLightboxProps {
  files: TaskFile[];
  selectedIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (index: number) => void;
}

export function FilePreviewLightbox({ 
  files, 
  selectedIndex, 
  open, 
  onOpenChange,
  onNavigate,
}: FilePreviewLightboxProps) {
  const currentFile = files[selectedIndex];
  
  if (!currentFile) return null;

  const getFilePreviewType = (fileType: string | null, fileName: string): 'image' | 'video' | 'pdf' | 'document' => {
    if (fileType?.startsWith('image/')) return 'image';
    if (fileType?.startsWith('video/')) return 'video';
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'document';
  };

  const previewType = getFilePreviewType(currentFile.file_type, currentFile.file_name);

  const handleDownload = async () => {
    try {
      const response = await fetch(currentFile.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentFile.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      // Fallback to direct link
      window.open(currentFile.file_url, '_blank');
    }
  };

  const handlePrev = () => {
    if (selectedIndex > 0) {
      onNavigate(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < files.length - 1) {
      onNavigate(selectedIndex + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-background/95 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate max-w-[300px]">{currentFile.file_name}</span>
            <span className="text-sm text-muted-foreground">
              ({selectedIndex + 1} of {files.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex items-center justify-center min-h-[400px] max-h-[70vh] p-4">
          {/* Navigation arrows */}
          {files.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 z-10 bg-background/80 hover:bg-background"
                onClick={handlePrev}
                disabled={selectedIndex === 0}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 z-10 bg-background/80 hover:bg-background"
                onClick={handleNext}
                disabled={selectedIndex === files.length - 1}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Preview content */}
          <div className="flex items-center justify-center w-full h-full">
            {previewType === 'image' && (
              <img
                src={currentFile.file_url}
                alt={currentFile.file_name}
                className="max-w-full max-h-[65vh] object-contain rounded-lg"
              />
            )}
            {previewType === 'video' && (
              <video
                src={currentFile.file_url}
                controls
                className="max-w-full max-h-[65vh] rounded-lg"
              >
                Your browser does not support the video tag.
              </video>
            )}
            {previewType === 'pdf' && (
              <iframe
                src={currentFile.file_url}
                className="w-full h-[65vh] rounded-lg border"
                title={currentFile.file_name}
              />
            )}
            {previewType === 'document' && (
              <div className="flex flex-col items-center justify-center gap-4 p-8 bg-muted/50 rounded-lg">
                <FileText className="h-16 w-16 text-muted-foreground" />
                <p className="text-lg font-medium">{currentFile.file_name}</p>
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type
                </p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for file thumbnail in gallery
interface FileThumbnailProps {
  file: TaskFile;
  onClick: () => void;
}

export function FileThumbnail({ file, onClick }: FileThumbnailProps) {
  const getFilePreviewType = (fileType: string | null, fileName: string): 'image' | 'video' | 'pdf' | 'document' => {
    if (fileType?.startsWith('image/')) return 'image';
    if (fileType?.startsWith('video/')) return 'video';
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'document';
  };

  const previewType = getFilePreviewType(file.file_type, file.file_name);

  return (
    <button
      onClick={onClick}
      className="relative group w-20 h-20 rounded-lg border bg-muted/50 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all flex-shrink-0"
    >
      {previewType === 'image' && (
        <img
          src={file.file_url}
          alt={file.file_name}
          className="w-full h-full object-cover"
        />
      )}
      {previewType === 'video' && (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Film className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      {previewType === 'pdf' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted p-1">
          <FileText className="h-6 w-6 text-destructive" />
          <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center px-1">
            PDF
          </span>
        </div>
      )}
      {previewType === 'document' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted p-1">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center px-1">
            {file.file_name.split('.').pop()?.toUpperCase() || 'FILE'}
          </span>
        </div>
      )}
      {/* Hover overlay with filename */}
      <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
        <span className="text-[10px] text-center truncate">{file.file_name}</span>
      </div>
    </button>
  );
}
