import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClients } from '@/hooks/useClients';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload, Search, Image, Video, Trash2, Loader2,
  Trophy, ExternalLink, Play, Plus
} from 'lucide-react';

interface WinningAd {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  category: string | null;
  client_id: string | null;
  created_at: string;
}

export function WinningAdsGallery({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<WinningAd | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadClientId, setUploadClientId] = useState<string>('');

  const { data: winningAds = [], isLoading } = useQuery({
    queryKey: ['winning-ads'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('custom_ads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WinningAd[];
    },
  });

  const handleUpload = useCallback(async () => {
    if (uploadFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    setUploading(true);
    try {
      for (const file of uploadFiles) {
        const isVideo = file.type.startsWith('video/');
        const fileExt = file.name.split('.').pop();
        const filePath = `winning-ads/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('creatives')
          .upload(filePath, file);

        if (uploadError) {
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('creatives')
          .getPublicUrl(filePath);

        const { error: insertError } = await (supabase as any)
          .from('custom_ads')
          .insert({
            name: file.name.replace(/\.[^/.]+$/, ''),
            file_url: publicUrl,
            file_type: isVideo ? 'video' : 'image',
            category: uploadCategory || null,
            client_id: uploadClientId || null,
          });

        if (insertError) {
          toast.error(`Failed to save ${file.name}`);
        }
      }

      toast.success(`Uploaded ${uploadFiles.length} winning ad(s)`);
      queryClient.invalidateQueries({ queryKey: ['winning-ads'] });
      setUploadOpen(false);
      setUploadFiles([]);
      setUploadCategory('');
      setUploadClientId('');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [uploadFiles, uploadCategory, uploadClientId, queryClient]);

  const handleDelete = useCallback(async (ad: WinningAd) => {
    const { error } = await (supabase as any).from('custom_ads').delete().eq('id', ad.id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    toast.success('Winning ad removed');
    queryClient.invalidateQueries({ queryKey: ['winning-ads'] });
    setSelectedAd(null);
  }, [queryClient]);

  const filtered = winningAds.filter((ad) => {
    if (searchQuery && !ad.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (typeFilter !== 'all' && ad.file_type !== typeFilter) return false;
    if (clientFilter !== 'all' && ad.client_id !== clientFilter) return false;
    return true;
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Winning Ads
          </h2>
          <p className="text-muted-foreground text-sm">Upload proven winners for team inspiration</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search winning ads..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Winning Ads</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Upload Winning Ads</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Files (images or videos)</label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} />
                <Button variant="outline" className="w-full mt-1" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadFiles.length > 0 ? `${uploadFiles.length} file(s) selected` : 'Choose Files'}
                </Button>
              </div>
              <div>
                <label className="text-sm font-medium">Category (optional)</label>
                <Input placeholder="e.g. Hook, Testimonial, Product Demo" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Client (optional)</label>
                <Select value={uploadClientId} onValueChange={setUploadClientId}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0} className="w-full">
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading winning ads...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Trophy className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-lg font-medium">No winning ads yet</p>
          <p className="text-sm">Upload your best-performing ads to inspire the team</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((ad) => (
            <Card key={ad.id} className="group cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all overflow-hidden" onClick={() => setSelectedAd(ad)}>
              <div className="relative aspect-square bg-muted">
                {ad.file_type === 'video' ? (
                  <div className="w-full h-full flex items-center justify-center bg-black/80">
                    <Play className="h-10 w-10 text-white/70" />
                  </div>
                ) : (
                  <img src={ad.file_url || ''} alt={ad.name || ''} className="w-full h-full object-cover" loading="lazy" />
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {ad.file_type === 'video' ? <Video className="h-3 w-3 mr-1" /> : <Image className="h-3 w-3 mr-1" />}
                    {ad.file_type}
                  </Badge>
                </div>
                {ad.category && (
                  <Badge className="absolute bottom-2 left-2 text-xs bg-yellow-500/90 text-black">{ad.category}</Badge>
                )}
              </div>
              <CardContent className="p-2">
                <p className="text-xs font-medium truncate">{ad.name}</p>
                {ad.client_id && clientMap[ad.client_id] && (
                  <p className="text-xs text-muted-foreground truncate">{clientMap[ad.client_id]}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedAd} onOpenChange={(open) => !open && setSelectedAd(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {selectedAd?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedAd && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden bg-muted max-h-[60vh]">
                {selectedAd.file_type === 'video' ? (
                  <video src={selectedAd.file_url || ''} controls className="w-full max-h-[60vh]" />
                ) : (
                  <img src={selectedAd.file_url || ''} alt={selectedAd.name} className="w-full object-contain max-h-[60vh]" />
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{selectedAd.file_type}</Badge>
                {selectedAd.category && <Badge className="bg-yellow-500/90 text-black">{selectedAd.category}</Badge>}
                {selectedAd.client_id && clientMap[selectedAd.client_id] && (
                  <Badge variant="secondary">{clientMap[selectedAd.client_id]}</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={selectedAd.file_url || ''} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open Full Size
                  </a>
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedAd)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
