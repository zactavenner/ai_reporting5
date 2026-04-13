import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uploadWithProgress, formatFileSize } from '@/lib/uploadWithProgress';
import { Upload, FileVideo, FileImage, File, Trash2, Download, Eye, X, Camera, ImagePlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ClientUploadPortalProps {
  clientId: string;
  clientName: string;
  isPublicView: boolean;
}

interface FileUpload {
  id: string;
  client_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  uploaded_by_name: string | null;
  notes: string | null;
  created_at: string;
}

interface UploadQueueItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function ClientUploadPortal({ clientId, clientName, isPublicView }: ClientUploadPortalProps) {
  const queryClient = useQueryClient();
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploaderName, setUploaderName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [sessionUploadIds, setSessionUploadIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isProcessing = useRef(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data: allUploads = [], isLoading } = useQuery({
    queryKey: ['client-file-uploads', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_file_uploads')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FileUpload[];
    },
  });

  // Public users only see their own session uploads; agency sees all
  const uploads = isPublicView
    ? allUploads.filter(u => sessionUploadIds.includes(u.id))
    : allUploads;

  const deleteMutation = useMutation({
    mutationFn: async (upload: FileUpload) => {
      if (upload.storage_path) {
        await supabase.storage.from('client-uploads').remove([upload.storage_path]);
      }
      const { error } = await supabase.from('client_file_uploads').delete().eq('id', upload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-file-uploads', clientId] });
      toast.success('File deleted');
    },
    onError: () => toast.error('Failed to delete file'),
  });

  // Process queue - upload files one at a time
  const processQueue = useCallback(async (queue: UploadQueueItem[]) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== 'pending') continue;

      // Mark as uploading
      setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading' as const } : q));

      try {
        const storagePath = `${clientId}/${Date.now()}-${item.file.name}`;
        const publicUrl = await uploadWithProgress(
          'client-uploads',
          storagePath,
          item.file,
          (percent) => {
            setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, progress: percent } : q));
          }
        );

        const { data: insertedRow } = await supabase.from('client_file_uploads').insert({
          client_id: clientId,
          file_name: item.file.name,
          file_url: publicUrl,
          file_type: item.file.type || null,
          file_size_bytes: item.file.size,
          storage_path: storagePath,
          uploaded_by_name: uploaderName || (isPublicView ? 'Client' : 'Agency'),
        }).select('id').single();

        if (insertedRow) {
          setSessionUploadIds(prev => [...prev, insertedRow.id]);
        }

        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'done' as const, progress: 100 } : q));
        successCount++;
      } catch (err: any) {
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error' as const, error: err.message } : q));
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['client-file-uploads', clientId] });
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`);
    }

    // Clear completed items after a delay
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(q => q.status !== 'done'));
    }, 3000);

    isProcessing.current = false;
  }, [clientId, uploaderName, isPublicView, queryClient]);

  // Auto-submit: add files and immediately start uploading
  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newItems: UploadQueueItem[] = fileArray.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setUploadQueue(prev => {
      const updated = [...prev, ...newItems];
      // Trigger processing after state update
      setTimeout(() => processQueue(updated), 50);
      return updated;
    });
  }, [processQueue]);

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  const isUploading = uploadQueue.some(q => q.status === 'uploading' || q.status === 'pending');

  const getFileIcon = (type: string | null) => {
    if (!type) return <File className="h-8 w-8 text-muted-foreground" />;
    if (type.startsWith('video/')) return <FileVideo className="h-8 w-8 text-primary" />;
    if (type.startsWith('image/')) return <FileImage className="h-8 w-8 text-primary" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  };

  const canPreview = (type: string | null) => {
    if (!type) return false;
    return type.startsWith('image/') || type.startsWith('video/');
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-8 md:p-12 text-center transition-all duration-200
          ${isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/[0.02]'
          }
        `}
      >
        <div className={`transition-transform duration-200 ${isDragging ? 'scale-110' : ''}`}>
          <Upload className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
        </div>
        <h3 className="text-xl font-semibold mb-2">
          {isDragging ? 'Drop files here!' : 'Upload Your Files'}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Drag & drop files here, or tap below to select. Photos, videos, creatives — up to 20GB per file. Full 4K+ quality preserved.
        </p>

        {isPublicView && (
          <div className="max-w-xs mx-auto mb-5">
            <Input
              placeholder="Your name (optional)"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              className="text-center"
            />
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*,.pdf,.psd,.ai,.eps,.svg,.mov,.mp4,.avi,.wmv,.mkv,.webm,.heic,.heif,.mxf,.prores,.r3d,.braw,.ari,.dpx,.exr,.tiff,.tif,.raw,.cr2,.nef,.arw"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        />
        {/* Separate camera input for mobile */}
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            size="lg"
            className="w-full sm:w-auto"
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            Choose Files
          </Button>
          {/* Camera button - primarily useful on mobile */}
          <Button
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
            size="lg"
            className="w-full sm:w-auto"
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo / Video
          </Button>
        </div>
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2 border border-border rounded-lg p-4 bg-card">
          <h4 className="text-sm font-semibold mb-2">
            Uploading {uploadQueue.filter(q => q.status === 'pending' || q.status === 'uploading').length} file(s)...
          </h4>
          {uploadQueue.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              {item.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : item.status === 'error' ? (
                <X className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <Upload className="h-4 w-4 text-muted-foreground shrink-0 animate-pulse" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{item.file.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {formatFileSize(item.file.size)}
                    {item.status === 'uploading' && ` • ${item.progress}%`}
                  </span>
                </div>
                {(item.status === 'uploading' || item.status === 'pending') && (
                  <Progress value={item.progress} className="h-1.5 mt-1" />
                )}
                {item.status === 'error' && (
                  <p className="text-xs text-destructive mt-0.5">{item.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">
          {isPublicView ? `Your Uploads (${uploads.length})` : `Uploaded Files (${uploads.length})`}
        </h3>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading files...</p>
        ) : uploads.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No files uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="border border-border rounded-lg p-4 bg-card flex flex-col gap-3">
                {upload.file_type?.startsWith('image/') ? (
                  <div
                    className="w-full h-40 rounded-md bg-muted overflow-hidden cursor-pointer"
                    onClick={() => { setPreviewUrl(upload.file_url); setPreviewType(upload.file_type || ''); }}
                  >
                    <img src={upload.file_url} alt={upload.file_name} className="w-full h-full object-cover" />
                  </div>
                ) : upload.file_type?.startsWith('video/') ? (
                  <div
                    className="w-full h-40 rounded-md bg-muted overflow-hidden cursor-pointer"
                    onClick={() => { setPreviewUrl(upload.file_url); setPreviewType(upload.file_type || ''); }}
                  >
                    <video src={upload.file_url} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-full h-40 rounded-md bg-muted flex items-center justify-center">
                    {getFileIcon(upload.file_type)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{upload.file_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {upload.file_size_bytes && <span>{formatFileSize(upload.file_size_bytes)}</span>}
                    {upload.uploaded_by_name && <span>• {upload.uploaded_by_name}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(upload.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {canPreview(upload.file_type) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPreviewUrl(upload.file_url); setPreviewType(upload.file_type || ''); }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(upload.file_url, '_blank')}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                  </Button>
                  {!isPublicView && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(upload)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80"
              onClick={() => setPreviewUrl(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            {previewType.startsWith('image/') ? (
              <img src={previewUrl!} alt="Preview" className="w-full h-auto max-h-[85vh] object-contain" />
            ) : previewType.startsWith('video/') ? (
              <video src={previewUrl!} controls autoPlay className="w-full max-h-[85vh]" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
