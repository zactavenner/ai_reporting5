import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, Image, Video, FileText } from 'lucide-react';
import { TaskFile } from '@/hooks/useTasks';
import { useCreateCreative, detectAspectRatio } from '@/hooks/useCreatives';
import { toast } from 'sonner';

interface SendToCreativeModalProps {
  file: TaskFile | null;
  clientId: string;
  clientName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PLATFORMS = [
  { value: 'meta', label: 'Meta (Facebook/Instagram)' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google', label: 'Google PPC' },
];

export function SendToCreativeModal({
  file,
  clientId,
  clientName,
  open,
  onOpenChange,
  onSuccess,
}: SendToCreativeModalProps) {
  const createCreative = useCreateCreative();
  
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<string>('meta');
  const [headline, setHeadline] = useState('');
  const [bodyCopy, setBodyCopy] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string | null>(null);
  
  // Detect file type
  const getFileType = (fileType: string | null): 'image' | 'video' | 'copy' => {
    if (fileType?.startsWith('image/')) return 'image';
    if (fileType?.startsWith('video/')) return 'video';
    return 'copy';
  };
  
  const detectedType = file ? getFileType(file.file_type) : 'image';
  
  // Initialize form when file changes
  useEffect(() => {
    if (file) {
      // Default title to filename without extension
      const nameWithoutExt = file.file_name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
      setHeadline('');
      setBodyCopy('');
      setAspectRatio(null);
      
      // Detect aspect ratio for media files
      if (file.file_type?.startsWith('image/') || file.file_type?.startsWith('video/')) {
        detectAspectRatioFromUrl(file.file_url, file.file_type);
      }
    }
  }, [file]);
  
  const detectAspectRatioFromUrl = async (url: string, fileType: string | null) => {
    try {
      if (fileType?.startsWith('image/')) {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const ratio = img.width / img.height;
          setAspectRatio(categorizeRatio(ratio));
        };
        img.src = url;
      } else if (fileType?.startsWith('video/')) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.onloadedmetadata = () => {
          const ratio = video.videoWidth / video.videoHeight;
          setAspectRatio(categorizeRatio(ratio));
        };
        video.src = url;
      }
    } catch (err) {
      console.error('Failed to detect aspect ratio:', err);
    }
  };
  
  const categorizeRatio = (ratio: number): string => {
    if (ratio >= 1.7) return '16:9';
    if (ratio > 1.1 && ratio < 1.7) return '4:5';
    if (ratio >= 0.9 && ratio <= 1.1) return '1:1';
    if (ratio > 0.5 && ratio < 0.9) return '4:5';
    return '9:16';
  };
  
  const handleSubmit = async () => {
    if (!file || !title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    
    try {
      await createCreative.mutateAsync({
        client_id: clientId,
        client_name: clientName,
        title: title.trim(),
        type: detectedType,
        platform,
        file_url: file.file_url,
        headline: headline.trim() || null,
        body_copy: bodyCopy.trim() || null,
        aspect_ratio: aspectRatio,
        isAgencyUpload: true, // This triggers AI spelling/grammar check
      });
      
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      // Error handled by mutation
    }
  };
  
  const getTypeIcon = () => {
    switch (detectedType) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'image': return <Image className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };
  
  if (!file) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Creative Approval</DialogTitle>
          <DialogDescription>
            Configure the creative before sending it for client approval. An AI review will automatically check for spelling and grammar issues.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="creative-title">Title</Label>
            <Input
              id="creative-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter creative title..."
            />
          </div>
          
          {/* Platform */}
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Type - Auto-detected */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {getTypeIcon()}
            <span>Type: {detectedType.charAt(0).toUpperCase() + detectedType.slice(1)} (auto-detected)</span>
            {aspectRatio && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded">{aspectRatio}</span>
            )}
          </div>
          
          {/* Optional Copy Fields */}
          <div className="space-y-2">
            <Label htmlFor="headline">Headline (optional)</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Ad headline..."
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="body-copy">Body Copy (optional)</Label>
            <Textarea
              id="body-copy"
              value={bodyCopy}
              onChange={(e) => setBodyCopy(e.target.value)}
              placeholder="Ad body copy..."
              rows={3}
            />
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createCreative.isPending}>
              {createCreative.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send for Approval
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
