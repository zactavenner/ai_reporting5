import { useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useParams } from 'react-router-dom';
import { 
  useCreatives, 
  useCreateCreative, 
  useUpdateCreativeStatus, 
  useAddCreativeComment,
  useDeleteCreative,
  uploadCreativeFile,
  detectAspectRatio,
  Creative,
  CreativeComment 
} from '@/hooks/useCreatives';
import { useClient } from '@/hooks/useClients';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { PlatformAdPreview } from './PlatformAdPreview';
import { CreativeHorizontalPreview } from './CreativeHorizontalPreview';
import { CreativeAIActions } from './CreativeAIActions';
import { 
  Upload, 
  Check, 
  X, 
  MessageSquare, 
  Image, 
  Video, 
  FileText,
  Trash2,
  Send,
  RefreshCw,
  Play,
  Pause,
  Eye,
  Clock,
  Sparkles,
  Link,
  SendHorizontal,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface CreativeApprovalProps {
  clientId: string;
  clientName: string;
  isPublicView?: boolean;
}

export function CreativeApproval({ clientId, clientName, isPublicView = false }: CreativeApprovalProps) {
  const { data: allCreatives = [], isLoading } = useCreatives(clientId);
  const { clientId: routeClientId } = useParams<{ clientId: string }>();
  const { data: client } = useClient(routeClientId || clientId);
  const createCreative = useCreateCreative();
  const updateStatus = useUpdateCreativeStatus();
  const addComment = useAddCreativeComment();
  const deleteCreative = useDeleteCreative();
  const { currentMember } = useTeamMember();
  
  // Check if this is an agency upload (team member logged in and not public view)
  const isAgencyUpload = !!currentMember && !isPublicView;
  
  // Public view: filter out draft creatives (not yet approved by agency)
  const creatives = isPublicView 
    ? allCreatives.filter(c => c.status !== 'draft')
    : allCreatives;
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [commentText, setCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [cardComments, setCardComments] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkPlatform, setBulkPlatform] = useState<'meta' | 'tiktok' | 'youtube' | 'google'>('meta');
  
  const [newCreative, setNewCreative] = useState({
    title: '',
    type: 'image' as 'image' | 'video' | 'copy',
    platform: 'meta' as 'meta' | 'tiktok' | 'youtube' | 'google',
    headline: '',
    body_copy: '',
    cta_text: '',
    file: null as File | null,
  });

  const statusCounts = {
    all: creatives.length,
    draft: creatives.filter(c => c.status === 'draft').length,
    pending: creatives.filter(c => c.status === 'pending').length,
    approved: creatives.filter(c => c.status === 'approved').length,
    launched: creatives.filter(c => c.status === 'launched').length,
    revisions: creatives.filter(c => c.status === 'revisions').length,
    rejected: creatives.filter(c => c.status === 'rejected').length,
  };

  const filteredCreatives = activeTab === 'all' 
    ? creatives 
    : creatives.filter(c => c.status === activeTab);

  const handleSendToClient = (creative: Creative) => {
    updateStatus.mutate({ id: creative.id, status: 'pending', clientId, creativeTitle: creative.title });
    toast.success('Creative sent to client for approval');
  };

  const handleCopyApprovalLink = () => {
    const publicToken = client?.public_token;
    if (!publicToken) {
      toast.error('No public link configured for this client. Set up a public token first.');
      return;
    }
    const url = `${window.location.origin}/public/${publicToken}/creatives`;
    navigator.clipboard.writeText(url);
    toast.success('Creative approval link copied to clipboard');
  };

  const handleLaunch = (creative: Creative) => {
    updateStatus.mutate({ id: creative.id, status: 'launched', clientId, creativeTitle: creative.title });
  };

  const handleUpload = async () => {
    if (!newCreative.title) {
      toast.error('Please enter a title');
      return;
    }

    setUploading(true);
    try {
      let fileUrl = null;
      let aspectRatio = null;
      
      if (newCreative.file && (newCreative.type === 'image' || newCreative.type === 'video')) {
        // Detect aspect ratio before upload
        aspectRatio = await detectAspectRatio(newCreative.file);
        fileUrl = await uploadCreativeFile(newCreative.file, clientId);
      }

      await createCreative.mutateAsync({
        client_id: clientId,
        client_name: clientName,
        title: newCreative.title,
        type: newCreative.type,
        platform: newCreative.platform,
        file_url: fileUrl,
        headline: newCreative.headline || null,
        body_copy: newCreative.body_copy || null,
        cta_text: newCreative.cta_text || null,
        status: isAgencyUpload ? 'draft' : 'pending',
        comments: [],
        aspect_ratio: aspectRatio,
        isAgencyUpload, // Pass the agency flag for AI spelling check
      });

      setUploadOpen(false);
      setBulkUploadOpen(false);
      setNewCreative({
        title: '',
        type: 'image',
        platform: 'meta',
        headline: '',
        body_copy: '',
        cta_text: '',
        file: null,
      });
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const file of bulkFiles) {
        try {
          const isVideo = file.type.startsWith('video/');
          
          // Detect aspect ratio before upload
          const aspectRatio = await detectAspectRatio(file);
          const fileUrl = await uploadCreativeFile(file, clientId);
          
          // Generate dynamic title from filename
          const fileName = file.name.replace(/\.[^/.]+$/, '');
          const title = fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          await createCreative.mutateAsync({
            client_id: clientId,
            client_name: clientName,
            title: title,
            type: isVideo ? 'video' : 'image',
            platform: bulkPlatform,
            file_url: fileUrl,
            headline: null,
            body_copy: null,
            cta_text: null,
            status: isAgencyUpload ? 'draft' : 'pending',
            comments: [],
            aspect_ratio: aspectRatio,
            isAgencyUpload, // Pass the agency flag for AI spelling check
          });
          successCount++;
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully uploaded ${successCount} creative${successCount !== 1 ? 's' : ''}`);
      }
      if (failCount > 0) {
        toast.error(`Failed to upload ${failCount} file${failCount !== 1 ? 's' : ''}`);
      }

      setBulkUploadOpen(false);
      setBulkFiles([]);
    } catch (error) {
      console.error('Bulk upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleStatusChange = (creative: Creative, status: 'approved' | 'revisions' | 'rejected') => {
    updateStatus.mutate({ id: creative.id, status, clientId, creativeTitle: creative.title });
  };

  const handleAddComment = (creative: Creative) => {
    if (!commentText.trim()) return;
    
    const comment: CreativeComment = {
      id: Date.now().toString(),
      author: isPublicView ? 'Client' : 'Agency',
      text: commentText,
      createdAt: new Date().toISOString(),
    };
    
    addComment.mutate({ id: creative.id, comment, clientId });
    setCommentText('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
      case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'launched': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'revisions': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'copy': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-border">
        <CardContent className="py-8">
          <CashBagLoader message="Loading creatives..." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Creative Approval
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and manage creative assets for {clientName}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Copy Approval Link - agency only */}
          {!isPublicView && (
            <Button variant="outline" size="sm" onClick={handleCopyApprovalLink}>
              <Link className="h-4 w-4 mr-2" />
              Copy Approval Link
            </Button>
          )}
          {/* Bulk Upload - available for public view too */}
          <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
            <DialogTrigger asChild>
              <Button variant={isPublicView ? 'default' : 'outline'}>
                <Upload className="h-4 w-4 mr-2" />
                {isPublicView ? 'Upload Creatives' : 'Bulk Upload'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Bulk Upload Creatives</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Platform</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(['meta', 'tiktok', 'youtube', 'google'] as const).map((platform) => (
                      <Button
                        key={platform}
                        type="button"
                        variant={bulkPlatform === platform ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setBulkPlatform(platform)}
                      >
                        {platform === 'meta' && 'Meta/IG'}
                        {platform === 'tiktok' && 'TikTok'}
                        {platform === 'youtube' && 'YouTube'}
                        {platform === 'google' && 'Google PPC'}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Select Files</label>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
                    className="mt-1 w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Select multiple images or videos. Titles will be auto-generated from filenames.
                  </p>
                </div>

                {bulkFiles.length > 0 && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">{bulkFiles.length} file(s) selected:</p>
                    <ul className="text-xs space-y-1 max-h-32 overflow-auto">
                      {bulkFiles.map((file, i) => (
                        <li key={i} className="flex items-center gap-2">
                          {file.type.startsWith('video/') ? (
                            <Video className="h-3 w-3" />
                          ) : (
                            <Image className="h-3 w-3" />
                          )}
                          {file.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button 
                  onClick={handleBulkUpload} 
                  className="w-full"
                  disabled={uploading || bulkFiles.length === 0}
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {bulkFiles.length} Creative{bulkFiles.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Single Upload - agency only */}
          {!isPublicView && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Creative
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload New Creative</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Title *</label>
                  <Input
                    value={newCreative.title}
                    onChange={(e) => setNewCreative({ ...newCreative, title: e.target.value })}
                    placeholder="Creative title"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <div className="flex gap-2 mt-1">
                    {(['image', 'video', 'copy'] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant={newCreative.type === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewCreative({ ...newCreative, type })}
                      >
                        {getTypeIcon(type)}
                        <span className="ml-1 capitalize">{type}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Platform</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(['meta', 'tiktok', 'youtube', 'google'] as const).map((platform) => (
                      <Button
                        key={platform}
                        type="button"
                        variant={newCreative.platform === platform ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewCreative({ ...newCreative, platform })}
                      >
                        {platform === 'meta' && 'Meta/IG'}
                        {platform === 'tiktok' && 'TikTok'}
                        {platform === 'youtube' && 'YouTube'}
                        {platform === 'google' && 'Google PPC'}
                      </Button>
                    ))}
                  </div>
                </div>

                {(newCreative.type === 'image' || newCreative.type === 'video') && (
                  <div>
                    <label className="text-sm font-medium">File</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={newCreative.type === 'image' ? 'image/*' : 'video/*'}
                      onChange={(e) => setNewCreative({ 
                        ...newCreative, 
                        file: e.target.files?.[0] || null 
                      })}
                      className="mt-1 w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Headline</label>
                  <Input
                    value={newCreative.headline}
                    onChange={(e) => setNewCreative({ ...newCreative, headline: e.target.value })}
                    placeholder="Ad headline"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Body Copy</label>
                  <Textarea
                    value={newCreative.body_copy}
                    onChange={(e) => setNewCreative({ ...newCreative, body_copy: e.target.value })}
                    placeholder="Ad body text"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">CTA Text</label>
                  <Input
                    value={newCreative.cta_text}
                    onChange={(e) => setNewCreative({ ...newCreative, cta_text: e.target.value })}
                    placeholder="Learn More"
                  />
                </div>

                <Button 
                  onClick={handleUpload} 
                  className="w-full"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Creative
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Status Summary Cards */}
        <div className={`grid ${isPublicView ? 'grid-cols-4' : 'grid-cols-5'} gap-3 mb-6`}>
          {!isPublicView && (
            <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-slate-600">{statusCounts.draft}</p>
              <p className="text-xs text-slate-700 dark:text-slate-400">Draft</p>
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{statusCounts.pending}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Pending</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{statusCounts.approved}</p>
            <p className="text-xs text-green-700 dark:text-green-400">Approved</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{statusCounts.revisions}</p>
            <p className="text-xs text-orange-700 dark:text-orange-400">Revisions</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{statusCounts.rejected}</p>
            <p className="text-xs text-red-700 dark:text-red-400">Rejected</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
            {!isPublicView && <TabsTrigger value="draft">Draft</TabsTrigger>}
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="launched">Launched</TabsTrigger>
            <TabsTrigger value="revisions">Revisions</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {filteredCreatives.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No creatives uploaded yet</p>
                <p className="text-sm">Upload your first creative to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredCreatives.map((creative) => (
                  <CreativeCard
                    key={creative.id}
                    creative={creative}
                    clientName={clientName}
                    clientId={clientId}
                    isPublicView={isPublicView}
                    getStatusColor={getStatusColor}
                    getTypeIcon={getTypeIcon}
                    onPreview={() => setSelectedCreative(creative)}
                    onStatusChange={handleStatusChange}
                    onLaunch={() => handleLaunch(creative)}
                    onSendToClient={() => handleSendToClient(creative)}
                    onAddComment={handleAddComment}
                    onDelete={() => deleteCreative.mutate({ id: creative.id, clientId })}
                    commentText={cardComments[creative.id] || ''}
                    onCommentTextChange={(text) => setCardComments(prev => ({ ...prev, [creative.id]: text }))}
                    addCommentMutation={addComment}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Creative Detail Modal - Full horizontal preview */}
        <Dialog open={!!selectedCreative} onOpenChange={() => setSelectedCreative(null)}>
          <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto sm:max-w-[95vw]">
            {selectedCreative && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle>{selectedCreative.title}</DialogTitle>
                    <Badge className={getStatusColor(selectedCreative.status)}>
                      {selectedCreative.status}
                    </Badge>
                  </div>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={getStatusColor(selectedCreative.status)}>
                      {selectedCreative.status}
                    </Badge>
                    <Badge variant="outline">{selectedCreative.platform}</Badge>
                    <span className="text-sm text-muted-foreground">Client: {clientName}</span>
                  </div>

                  {/* Horizontal Platform Preview - All platforms side by side */}
                  <CreativeHorizontalPreview 
                    creative={selectedCreative} 
                    clientName={clientName}
                  />

                  {/* Download + AI Tools */}
                  <div className="flex items-center gap-2 flex-wrap border-t pt-4">
                    {/* Download - available for both agency and public */}
                    {selectedCreative.file_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = selectedCreative.file_url!;
                          link.download = selectedCreative.title || 'creative';
                          link.target = '_blank';
                          link.rel = 'noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          toast.success('Download started');
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    )}
                    {/* AI Tools - agency only */}
                    {!isPublicView && (
                      <>
                        <Sparkles className="h-4 w-4 text-primary ml-2" />
                        <span className="text-sm font-medium mr-1">AI Tools:</span>
                        <CreativeAIActions creative={selectedCreative} />
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-wrap border-t pt-4">
                    {selectedCreative.status === 'draft' && !isPublicView && (
                      <Button
                        className="bg-primary hover:bg-primary/90"
                        onClick={() => {
                          handleSendToClient(selectedCreative);
                          setSelectedCreative(null);
                        }}
                      >
                        <SendHorizontal className="h-4 w-4 mr-1" />
                        Send to Client
                      </Button>
                    )}
                    {selectedCreative.status !== 'launched' && selectedCreative.status !== 'draft' && (
                      <>
                        {selectedCreative.status === 'approved' && !isPublicView && (
                          <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => {
                              handleLaunch(selectedCreative);
                              setSelectedCreative(null);
                            }}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Launch
                          </Button>
                        )}
                        <Button
                          variant="default"
                          onClick={() => handleStatusChange(selectedCreative, 'approved')}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleStatusChange(selectedCreative, 'revisions')}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Revisions
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleStatusChange(selectedCreative, 'rejected')}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {!isPublicView && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          deleteCreative.mutate({ id: selectedCreative.id, clientId });
                          setSelectedCreative(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                        Delete
                      </Button>
                    )}
                  </div>

                  {/* Comments */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comments ({selectedCreative.comments?.length || 0})
                    </h4>
                    {selectedCreative.comments && selectedCreative.comments.length > 0 ? (
                      <ScrollArea className="h-[200px] border rounded-lg p-3 mb-2">
                        <div className="space-y-2">
                          {selectedCreative.comments.map((comment) => (
                            <div 
                              key={comment.id}
                              className={`p-2 rounded-lg text-sm ${
                                comment.author === 'Client' 
                                  ? 'bg-primary/10 ml-4' 
                                  : 'bg-muted mr-4'
                              }`}
                            >
                              <div className="flex justify-between mb-0.5">
                                <span className="text-xs font-medium">{comment.author}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(comment.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p>{comment.text}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-2">No comments yet</p>
                    )}
                    
                    {/* Add comment */}
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddComment(selectedCreative);
                          }
                        }}
                      />
                      <Button 
                        size="icon"
                        onClick={() => handleAddComment(selectedCreative)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Helper to get aspect ratio CSS class for card containers
function getCardAspectClass(aspectRatio: string | null | undefined): string {
  switch (aspectRatio) {
    case '16:9': return 'aspect-video';
    case '9:16': return 'aspect-[9/16] max-h-[500px]';
    case '1:1': return 'aspect-square';
    case '4:5': return 'aspect-[4/5]';
    default: return 'aspect-[4/5]';
  }
}

// Inline video player component for card grid
function InlineVideoPlayer({ src, aspectRatio }: { src: string; aspectRatio?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setPlaying(true);
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
    }
  };

  return (
    <div className="relative w-full h-full group cursor-pointer" onClick={toggle}>
      <video 
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        loop
        playsInline
        muted
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
        <div className="bg-black/50 rounded-full p-4">
          {playing ? (
            <Pause className="h-8 w-8 text-white fill-white" />
          ) : (
            <Play className="h-8 w-8 text-white fill-white" />
          )}
        </div>
      </div>
    </div>
  );
}

// Creative card with inline actions
function CreativeCard({ 
  creative, clientName, clientId, isPublicView, getStatusColor, getTypeIcon,
  onPreview, onStatusChange, onLaunch, onSendToClient, onDelete, commentText, onCommentTextChange, addCommentMutation
}: {
  creative: Creative;
  clientName: string;
  clientId: string;
  isPublicView: boolean;
  getStatusColor: (s: string) => string;
  getTypeIcon: (t: string) => React.ReactNode;
  onPreview: () => void;
  onStatusChange: (c: Creative, s: 'approved' | 'revisions' | 'rejected') => void;
  onLaunch: () => void;
  onSendToClient: () => void;
  onAddComment: (c: Creative) => void;
  onDelete: () => void;
  commentText: string;
  onCommentTextChange: (t: string) => void;
  addCommentMutation: ReturnType<typeof useAddCreativeComment>;
}) {
  const handleCardComment = () => {
    if (!commentText.trim()) return;
    const comment: CreativeComment = {
      id: Date.now().toString(),
      author: isPublicView ? 'Client' : 'Agency',
      text: commentText,
      createdAt: new Date().toISOString(),
    };
    addCommentMutation.mutate({ id: creative.id, comment, clientId });
    onCommentTextChange('');
  };

  const commentCount = creative.comments?.length || 0;

  return (
    <Card className="border hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-0">
        {/* Media area */}
        <div className="relative">
          <Badge className={`absolute top-3 right-3 z-10 ${getStatusColor(creative.status)}`}>
            <Clock className="h-3 w-3 mr-1" />
            {creative.status.charAt(0).toUpperCase() + creative.status.slice(1)}
          </Badge>
          
          <div className={`${getCardAspectClass(creative.aspect_ratio)} bg-muted relative overflow-hidden`}>
            {creative.type === 'image' && creative.file_url ? (
              <img 
                src={creative.file_url} 
                alt={creative.title}
                className="w-full h-full object-contain cursor-pointer"
                onClick={onPreview}
              />
            ) : creative.type === 'video' && creative.file_url ? (
              <InlineVideoPlayer src={creative.file_url} aspectRatio={creative.aspect_ratio} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer" onClick={onPreview}>
                {getTypeIcon(creative.type)}
                <p className="text-sm text-muted-foreground mt-2">
                  {creative.headline || 'Ad Copy'}
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Info + title row */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-sm truncate">{creative.title}</h4>
              <p className="text-xs text-muted-foreground">{clientName}</p>
            </div>
            <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
              {creative.platform}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(creative.created_at), { addSuffix: true })}
          </p>
        </div>

        {/* Action buttons row */}
        <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
          {creative.status === 'draft' && !isPublicView && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
              onClick={onSendToClient}
            >
              <SendHorizontal className="h-3 w-3" />
              Send to Client
            </Button>
          )}
          {creative.status !== 'launched' && creative.status !== 'draft' && (
            <>
              {creative.status === 'approved' && !isPublicView && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={onLaunch}
                >
                  <Play className="h-3 w-3" />
                  Launch
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onStatusChange(creative, 'approved')}
              >
                <Check className="h-3 w-3" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onStatusChange(creative, 'revisions')}
              >
                <RefreshCw className="h-3 w-3" />
                Revisions
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onStatusChange(creative, 'rejected')}
              >
                <X className="h-3 w-3" />
                Reject
              </Button>
            </>
          )}
          {/* Download button on card */}
          {creative.file_url && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = creative.file_url!;
                link.download = creative.title || 'creative';
                link.target = '_blank';
                link.rel = 'noreferrer';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs gap-1 ml-auto"
            onClick={onPreview}
          >
            <Eye className="h-3 w-3" />
            Preview
          </Button>
          {!isPublicView && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>

        {/* Inline comment section */}
        <div className="px-4 pb-3 border-t border-border mt-1 pt-2">
          {commentCount > 0 && (
            <div className="mb-2 max-h-24 overflow-y-auto space-y-1">
              {creative.comments.slice(-2).map((comment) => (
                <div key={comment.id} className="text-xs bg-muted rounded px-2 py-1">
                  <span className="font-medium">{comment.author}:</span>{' '}
                  <span className="text-muted-foreground">{comment.text}</span>
                </div>
              ))}
              {commentCount > 2 && (
                <button 
                  className="text-xs text-primary hover:underline"
                  onClick={onPreview}
                >
                  View all {commentCount} comments
                </button>
              )}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input
              value={commentText}
              onChange={(e) => onCommentTextChange(e.target.value)}
              placeholder="Add a comment..."
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCardComment();
              }}
            />
            <Button 
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleCardComment}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
