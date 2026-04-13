import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uploadWithProgress, formatFileSize } from '@/lib/uploadWithProgress';
import { Upload, FileVideo, FileImage, File, Trash2, Download, Eye, X, CheckCircle } from 'lucide-react';
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

export function ClientUploadPortal({ clientId, clientName, isPublicView }: ClientUploadPortalProps) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploaderName, setUploaderName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');

  const { data: uploads = [], isLoading } = useQuery({
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

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (const file of Array.from(files)) {
      try {
        setUploadFileName(file.name);
        setUploadProgress(0);

        const ext = file.name.split('.').pop() || 'bin';
        const storagePath = `${clientId}/${Date.now()}-${file.name}`;

        const publicUrl = await uploadWithProgress(
          'client-uploads',
          storagePath,
          file,
          (percent) => setUploadProgress(percent)
        );

        await supabase.from('client_file_uploads').insert({
          client_id: clientId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type || null,
          file_size_bytes: file.size,
          storage_path: storagePath,
          uploaded_by_name: uploaderName || (isPublicView ? 'Client' : 'Agency'),
        });

        successCount++;
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['client-file-uploads', clientId] });
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
    }

    setUploading(false);
    setUploadProgress(0);
    setUploadFileName('');
  }, [clientId, uploaderName, isPublicView, queryClient]);

  const getFileIcon = (type: string | null) => {
    if (!type) return <File className="h-8 w-8 text-muted-foreground" />;
    if (type.startsWith('video/')) return <FileVideo className="h-8 w-8 text-blue-500" />;
    if (type.startsWith('image/')) return <FileImage className="h-8 w-8 text-green-500" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  };

  const canPreview = (type: string | null) => {
    if (!type) return false;
    return type.startsWith('image/') || type.startsWith('video/');
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center bg-card">
        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          Upload Files
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag & drop or click to upload creatives, videos, images — up to 10GB per file
        </p>

        {isPublicView && (
          <div className="max-w-xs mx-auto mb-4">
            <Input
              placeholder="Your name (optional)"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              className="text-center"
            />
          </div>
        )}

        <input
          type="file"
          id="file-upload-input"
          className="hidden"
          multiple
          accept="image/*,video/*,.pdf,.psd,.ai,.eps,.svg,.mov,.mp4,.avi,.wmv,.mkv,.webm"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <Button
          onClick={() => document.getElementById('file-upload-input')?.click()}
          disabled={uploading}
          size="lg"
        >
          <Upload className="h-4 w-4 mr-2" />
          Choose Files
        </Button>

        {uploading && (
          <div className="mt-4 max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate max-w-[200px]">{uploadFileName}</span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}
      </div>

      {/* File List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">
          Uploaded Files ({uploads.length})
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
                {/* Preview Thumbnail */}
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

                {/* Info */}
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

                {/* Actions */}
                <div className="flex items-center gap-1.5">
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
