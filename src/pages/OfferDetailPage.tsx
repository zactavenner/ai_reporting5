import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Sparkles, Trash2, Video, Image, FileText,
  Mail, MessageSquare, Megaphone, Target, BarChart3, Globe, Loader2,
  ExternalLink, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

const ASSET_TYPE_CONFIG = [
  { key: 'research', label: 'Research', icon: BarChart3 },
  { key: 'angles', label: 'Marketing Angles', icon: Target },
  { key: 'adcopy', label: 'Ad Copy', icon: Megaphone },
  { key: 'emails', label: 'Email Sequences', icon: Mail },
  { key: 'sms', label: 'SMS Sequences', icon: MessageSquare },
  { key: 'scripts', label: 'Video Scripts', icon: Video },
  { key: 'creatives', label: 'Creative Concepts', icon: Image },
  { key: 'report', label: 'Special Report', icon: FileText },
  { key: 'funnel', label: 'Funnel Copy', icon: Globe },
] as const;

function useOfferDetail(offerId: string | undefined) {
  return useQuery({
    queryKey: ['offer-detail', offerId],
    queryFn: async () => {
      if (!offerId) return null;
      const { data, error } = await (supabase.from('client_offers') as any)
        .select('*')
        .eq('id', offerId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!offerId,
  });
}

function useOfferCreatives(offerId: string | undefined) {
  return useQuery({
    queryKey: ['offer-creatives', offerId],
    queryFn: async () => {
      if (!offerId) return [];
      const { data, error } = await (supabase.from('creatives') as any)
        .select('*')
        .eq('trigger_campaign_id', offerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!offerId,
  });
}

function useClientInfo(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-info', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export default function OfferDetailPage() {
  const { clientId, offerId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: offer, isLoading: offerLoading } = useOfferDetail(offerId);
  const { data: creatives = [] } = useOfferCreatives(offerId);
  const { data: client } = useClientInfo(clientId);
  const [activeTab, setActiveTab] = useState('overview');
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editingCreativeUrl, setEditingCreativeUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const deleteCreative = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('creatives') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer-creatives', offerId] });
      toast.success('Creative deleted');
    },
    onError: () => toast.error('Failed to delete creative'),
  });

  const handleAiEdit = async () => {
    if (!editingCreativeUrl || !editPrompt.trim()) return;
    setIsEditing(true);
    try {
      const { data, error } = await supabase.functions.invoke('edit-static-ad', {
        body: { image_url: editingCreativeUrl, prompt: editPrompt.trim(), client_id: clientId, offer_id: offerId },
      });
      if (error) throw error;
      toast.success('AI edit complete — new version saved');
      queryClient.invalidateQueries({ queryKey: ['offer-creatives', offerId] });
      setEditPromptOpen(false);
      setEditPrompt('');
    } catch (err: any) {
      toast.error(`AI edit failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsEditing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (offerLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Offer not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/client/${clientId}`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="h-5 w-px bg-border" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">{offer.title}</h1>
                <Badge variant="default" className="text-xs">
                  {offer.offer_type === 'offer' ? 'Offer' : offer.offer_type === 'document' ? 'Document' : 'File'}
                </Badge>
              </div>
              {client && <p className="text-xs text-muted-foreground">{client.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/static-ads?clientId=${clientId}&offerId=${offerId}`)}>
              <Image className="h-3.5 w-3.5 mr-1.5" /> Generate Static Ads
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/batch-video?clientId=${clientId}&offerId=${offerId}`)}>
              <Video className="h-3.5 w-3.5 mr-1.5" /> Generate Video
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="creatives">
              Creatives {creatives.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{creatives.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="p-5 lg:col-span-2 space-y-4">
                <h2 className="font-semibold">Offer Details</h2>
                {offer.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{offer.description}</p>}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">{format(new Date(offer.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded By</span>
                    <p className="font-medium">{offer.uploaded_by || 'Unknown'}</p>
                  </div>
                </div>
                {offer.file_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(offer.file_url!, '_blank')}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View File
                  </Button>
                )}
              </Card>
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Asset Summary</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Creatives</span>
                  <span className="font-medium">{creatives.length}</span>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="creatives">
            {creatives.length === 0 ? (
              <Card className="p-12 text-center">
                <Image className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-3">No creatives generated yet</p>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" onClick={() => navigate(`/static-ads?clientId=${clientId}&offerId=${offerId}`)}>
                    <Image className="h-3.5 w-3.5 mr-1.5" /> Generate Static Ads
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/batch-video?clientId=${clientId}&offerId=${offerId}`)}>
                    <Video className="h-3.5 w-3.5 mr-1.5" /> Generate Video
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {creatives.map((creative: any) => (
                  <Card key={creative.id} className="overflow-hidden group">
                    {creative.file_url && (
                      <div className="aspect-square bg-muted relative">
                        {creative.type === 'video' ? (
                          <video src={creative.file_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={creative.file_url} alt={creative.title} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => { setEditingCreativeUrl(creative.file_url); setEditPromptOpen(true); }}>
                            <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this creative?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteCreative.mutate(creative.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-xs font-medium truncate">{creative.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[10px]">{creative.type}</Badge>
                        {creative.platform && <Badge variant="secondary" className="text-[10px]">{creative.platform}</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(creative.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={editPromptOpen} onOpenChange={setEditPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Edit Creative
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {editingCreativeUrl && (
              <div className="rounded-lg overflow-hidden border border-border">
                <img src={editingCreativeUrl} alt="Current" className="w-full h-48 object-contain bg-muted" />
              </div>
            )}
            <Textarea
              placeholder="Describe the changes you want..."
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditPromptOpen(false)}>Cancel</Button>
              <Button onClick={handleAiEdit} disabled={isEditing || !editPrompt.trim()}>
                {isEditing ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Editing…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Apply Edit</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
