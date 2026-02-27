import { useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
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
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface CreativeApprovalProps {
  clientId: string;
  clientName: string;
  isPublicView?: boolean;
}

export function CreativeApproval({ clientId, clientName, isPublicView = false }: CreativeApprovalProps) {
  const { data: creatives = [], isLoading } = useCreatives(clientId);
  const createCreative = useCreateCreative();
  const updateStatus = useUpdateCreativeStatus();
  const addComment = useAddCreativeComment();
  const deleteCreative = useDeleteCreative();
  const { currentMember } = useTeamMember();
  
  // Check if this is an agency upload (team member logged in and not public view)
  const isAgencyUpload = !!currentMember && !isPublicView;
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [commentText, setCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
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
    pending: creatives.filter(c => c.status === 'pending').length,
    approved: creatives.filter(c => c.status === 'approved').length,
    launched: creatives.filter(c => c.status === 'launched').length,
    revisions: creatives.filter(c => c.status === 'revisions').length,
    rejected: creatives.filter(c => c.status === 'rejected').length,
  };

  const filteredCreatives = activeTab === 'all' 
    ? creatives 
    : creatives.filter(c => c.status === activeTab);

  const handleLaunch = (creative: Creative) => {
    updateStatus.mutate({ id: creative.id, status: 'launched' as any, clientId, creativeTitle: creative.title });
    toast.success('Creative launched!');
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
        status: 'pending',
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
            status: 'pending',
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
        <div className="flex gap-2">
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
        <div className="grid grid-cols-4 gap-3 mb-6">
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
                  <Card 
                    key={creative.id} 
                    className="border hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <CardContent className="p-0">
                      {/* Full platform preview inline */}
                      <div className="relative">
                        {/* Status badge overlay */}
                        <Badge className={`absolute top-3 right-3 z-10 ${getStatusColor(creative.status)}`}>
                          <Clock className="h-3 w-3 mr-1" />
                          {creative.status.charAt(0).toUpperCase() + creative.status.slice(1)}
                        </Badge>
                        
                        {/* Inline media with click-to-play for video */}
                        <div className="aspect-[4/5] bg-muted relative overflow-hidden">
                          {creative.type === 'image' && creative.file_url ? (
                            <img 
                              src={creative.file_url} 
                              alt={creative.title}
                              className="w-full h-full object-contain bg-black/5"
                            />
                          ) : creative.type === 'video' && creative.file_url ? (
                            <InlineVideoPlayer src={creative.file_url} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-6 text-center">
                              {getTypeIcon(creative.type)}
                              <p className="text-sm text-muted-foreground mt-2">
                                {creative.headline || 'Ad Copy'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Info bar */}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-sm truncate">{creative.title}</h4>
                            <p className="text-xs text-muted-foreground">{clientName}</p>
                          </div>
                          <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                            {creative.platform}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(creative.created_at), { addSuffix: true })}
                          </p>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCreative(creative)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!isPublicView && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  deleteCreative.mutate({ id: creative.id, clientId });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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

                  {/* AI Tools - agency only */}
                  {!isPublicView && (
                    <div className="flex items-center gap-2 flex-wrap border-t pt-4">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium mr-2">AI Tools:</span>
                      <CreativeAIActions creative={selectedCreative} />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-wrap border-t pt-4">
                    {selectedCreative.status !== 'launched' && (
                      <>
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

// Inline video player component for card grid
function InlineVideoPlayer({ src }: { src: string }) {
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
        className="w-full h-full object-contain bg-black/5"
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
