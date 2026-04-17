import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { uploadWithProgress, formatFileSize } from '@/lib/uploadWithProgress';
import { UploadCloud, Trash2, Download, Play, FileText, Loader2, Video, Image as ImageIcon, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Upload {
  id: string;
  name: string;
  file_url: string;
  storage_path: string | null;
  file_type: string;
  mime_type: string | null;
  size_bytes: number | null;
  transcript: string | null;
  transcription_status: string | null;
  notes: string | null;
  created_at: string;
}

export function TopPerformerUploadsSection() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [viewing, setViewing] = useState<Upload | null>(null);

  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ['top-performer-uploads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('top_performer_uploads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Upload[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (item: Upload) => {
      if (item.storage_path) {
        await supabase.storage.from('creatives').remove([item.storage_path]);
      }
      const { error } = await supabase.from('top_performer_uploads').delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['top-performer-uploads'] });
      toast.success('Removed');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const transcribe = async (id: string, fileUrl: string, mimeType: string | null) => {
    toast.info('Transcribing… this may take a moment');
    await supabase.from('top_performer_uploads')
      .update({ transcription_status: 'processing' }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['top-performer-uploads'] });
    const { error } = await supabase.functions.invoke('transcribe-top-performer', {
      body: { uploadId: id, fileUrl, mimeType },
    });
    if (error) toast.error('Transcription failed');
    else toast.success('Transcript ready');
    qc.invalidateQueries({ queryKey: ['top-performer-uploads'] });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setUploading(arr.map(f => ({ name: f.name, progress: 0 })));

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        const ext = file.name.split('.').pop() || 'bin';
        const path = `top-performers/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const url = await uploadWithProgress('creatives', path, file, (p) => {
          setUploading(prev => prev.map((u, idx) => idx === i ? { ...u, progress: p } : u));
        });
        const fileType = file.type.startsWith('video') ? 'video' : 'image';
        const { data: inserted, error } = await supabase
          .from('top_performer_uploads')
          .insert({
            name: file.name,
            file_url: url,
            storage_path: path,
            file_type: fileType,
            mime_type: file.type,
            size_bytes: file.size,
            transcription_status: fileType === 'video' ? 'pending' : 'not_applicable',
          })
          .select().single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['top-performer-uploads'] });

        // Auto-transcribe videos
        if (fileType === 'video' && inserted) {
          supabase.functions.invoke('transcribe-top-performer', {
            body: { uploadId: inserted.id, fileUrl: url, mimeType: file.type },
          }).then(() => qc.invalidateQueries({ queryKey: ['top-performer-uploads'] }));
        }
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message}`);
      }
    }
    setUploading([]);
    toast.success(`Uploaded ${arr.length} file${arr.length > 1 ? 's' : ''}`);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-primary" />
            Top Performer Library
          </h3>
          <p className="text-sm text-muted-foreground">
            Upload winning ads (image or video). Videos are auto-transcribed for script analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{uploads.length} ads</Badge>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <UploadCloud className="h-4 w-4 mr-2" />Bulk upload
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm font-medium">Drop ads here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Images and videos · bulk supported</p>
      </div>

      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="flex-1 truncate">{u.name}</span>
              <span className="text-muted-foreground">{u.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : uploads.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No uploads yet. Drop your top performing ads above to start building the library.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {uploads.map((u) => (
            <div key={u.id} className="group rounded-lg border border-border/50 bg-card overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all">
              <div
                className="relative aspect-[4/5] bg-muted/30 cursor-pointer"
                onClick={() => setViewing(u)}
              >
                {u.file_type === 'video' ? (
                  <>
                    <video src={u.file_url} className="w-full h-full object-cover" preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center bg-background/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-primary text-primary-foreground rounded-full p-3">
                        <Play className="h-5 w-5 fill-current" />
                      </div>
                    </div>
                  </>
                ) : (
                  <img src={u.file_url} alt={u.name} className="w-full h-full object-cover" loading="lazy" />
                )}
                <Badge variant="secondary" className="absolute top-2 left-2 text-[9px] gap-1">
                  {u.file_type === 'video' ? <Video className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                  {u.file_type}
                </Badge>
                {u.transcription_status === 'processing' && (
                  <Badge className="absolute top-2 right-2 text-[9px] gap-1 bg-primary/90 text-primary-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />transcribing
                  </Badge>
                )}
                {u.transcription_status === 'completed' && (
                  <Badge className="absolute top-2 right-2 text-[9px] gap-1 bg-chart-2/90 text-primary-foreground">
                    <FileText className="h-2.5 w-2.5" />script
                  </Badge>
                )}
              </div>
              <div className="p-2 space-y-1">
                <p className="text-xs font-medium truncate">{u.name}</p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{u.size_bytes ? formatFileSize(u.size_bytes) : ''}</span>
                  <div className="flex items-center gap-1">
                    <a href={u.file_url} download={u.name} onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Download className="h-3 w-3" />
                      </Button>
                    </a>
                    {u.file_type === 'video' && u.transcription_status !== 'processing' && (
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); transcribe(u.id, u.file_url, u.mime_type); }}
                        title="Re-transcribe"
                      >
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                      onClick={(e) => { e.stopPropagation(); if (confirm('Delete this upload?')) deleteMut.mutate(u); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="truncate pr-8">{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid md:grid-cols-2 gap-0 max-h-[80vh]">
              <div className="bg-black flex items-center justify-center p-2">
                {viewing.file_type === 'video' ? (
                  <video src={viewing.file_url} controls autoPlay className="max-h-[75vh] max-w-full" />
                ) : (
                  <img src={viewing.file_url} alt={viewing.name} className="max-h-[75vh] max-w-full object-contain" />
                )}
              </div>
              <ScrollArea className="max-h-[80vh] px-6 pb-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <a href={viewing.file_url} download={viewing.name}>
                      <Button size="sm" variant="outline">
                        <Download className="h-3 w-3 mr-2" />Download
                      </Button>
                    </a>
                    {viewing.file_type === 'video' && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => transcribe(viewing.id, viewing.file_url, viewing.mime_type)}
                        disabled={viewing.transcription_status === 'processing'}
                      >
                        <Sparkles className="h-3 w-3 mr-2" />
                        {viewing.transcript ? 'Re-transcribe' : 'Transcribe'}
                      </Button>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-3 w-3" />Script / Transcript
                    </h4>
                    {viewing.transcription_status === 'processing' ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating transcript…
                      </div>
                    ) : viewing.transcript ? (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                        {viewing.transcript}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {viewing.file_type === 'video'
                          ? 'No transcript yet. Click Transcribe.'
                          : 'Transcripts only available for video uploads.'}
                      </p>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
