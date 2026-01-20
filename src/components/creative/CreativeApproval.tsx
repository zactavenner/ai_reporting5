import { useState, useRef } from 'react';
import { 
  useCreatives, 
  useCreateCreative, 
  useUpdateCreativeStatus, 
  useAddCreativeComment,
  useDeleteCreative,
  uploadCreativeFile,
  Creative,
  CreativeComment 
} from '@/hooks/useCreatives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
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
  RefreshCw
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
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [commentText, setCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    revisions: creatives.filter(c => c.status === 'revisions').length,
    rejected: creatives.filter(c => c.status === 'rejected').length,
  };

  const filteredCreatives = activeTab === 'all' 
    ? creatives 
    : creatives.filter(c => c.status === activeTab);

  const handleUpload = async () => {
    if (!newCreative.title) {
      toast.error('Please enter a title');
      return;
    }

    setUploading(true);
    try {
      let fileUrl = null;
      if (newCreative.file && (newCreative.type === 'image' || newCreative.type === 'video')) {
        fileUrl = await uploadCreativeFile(newCreative.file, clientId);
      }

      await createCreative.mutateAsync({
        client_id: clientId,
        title: newCreative.title,
        type: newCreative.type,
        platform: newCreative.platform,
        file_url: fileUrl,
        headline: newCreative.headline || null,
        body_copy: newCreative.body_copy || null,
        cta_text: newCreative.cta_text || null,
        status: 'pending',
        comments: [],
      });

      setUploadOpen(false);
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

  const handleStatusChange = (creative: Creative, status: 'approved' | 'revisions' | 'rejected') => {
    updateStatus.mutate({ id: creative.id, status, clientId });
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCreatives.map((creative) => (
                  <Card 
                    key={creative.id} 
                    className="border hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedCreative(creative)}
                  >
                    <CardContent className="p-4">
                      {/* Preview */}
                      <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden flex items-center justify-center">
                        {creative.type === 'image' && creative.file_url ? (
                          <img 
                            src={creative.file_url} 
                            alt={creative.title}
                            className="w-full h-full object-cover"
                          />
                        ) : creative.type === 'video' && creative.file_url ? (
                          <video 
                            src={creative.file_url}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-4">
                            {getTypeIcon(creative.type)}
                            <p className="text-sm text-muted-foreground mt-2">
                              {creative.headline || 'Ad Copy'}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-sm">{creative.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(creative.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className={getStatusColor(creative.status)}>
                          {creative.status}
                        </Badge>
                      </div>

                      {/* Comments indicator */}
                      {creative.comments && creative.comments.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {creative.comments.length} comment{creative.comments.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Creative Detail Modal */}
        <Dialog open={!!selectedCreative} onOpenChange={() => setSelectedCreative(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
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
                
                <div className="flex-1 overflow-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Preview */}
                    <div>
                      <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-4">
                        {selectedCreative.type === 'image' && selectedCreative.file_url ? (
                          <img 
                            src={selectedCreative.file_url} 
                            alt={selectedCreative.title}
                            className="w-full h-full object-contain"
                          />
                        ) : selectedCreative.type === 'video' && selectedCreative.file_url ? (
                          <video 
                            src={selectedCreative.file_url}
                            controls
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <FileText className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Copy details */}
                      {selectedCreative.headline && (
                        <div className="mb-3">
                          <label className="text-xs font-medium text-muted-foreground">Headline</label>
                          <p className="font-medium">{selectedCreative.headline}</p>
                        </div>
                      )}
                      {selectedCreative.body_copy && (
                        <div className="mb-3">
                          <label className="text-xs font-medium text-muted-foreground">Body Copy</label>
                          <p className="text-sm">{selectedCreative.body_copy}</p>
                        </div>
                      )}
                      {selectedCreative.cta_text && (
                        <div className="mb-3">
                          <label className="text-xs font-medium text-muted-foreground">CTA</label>
                          <p className="text-sm">{selectedCreative.cta_text}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                          onClick={() => handleStatusChange(selectedCreative, 'approved')}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-orange-500 text-orange-600 hover:bg-orange-50"
                          onClick={() => handleStatusChange(selectedCreative, 'revisions')}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Revisions
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-red-500 text-red-600 hover:bg-red-50"
                          onClick={() => handleStatusChange(selectedCreative, 'rejected')}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>

                      {!isPublicView && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-destructive"
                          onClick={() => {
                            deleteCreative.mutate({ id: selectedCreative.id, clientId });
                            setSelectedCreative(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Creative
                        </Button>
                      )}
                    </div>

                    {/* Comments */}
                    <div className="flex flex-col h-full">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Comments
                      </h4>
                      <ScrollArea className="flex-1 h-[300px] border rounded-lg p-3">
                        {selectedCreative.comments && selectedCreative.comments.length > 0 ? (
                          <div className="space-y-3">
                            {selectedCreative.comments.map((comment) => (
                              <div 
                                key={comment.id}
                                className={`p-3 rounded-lg ${
                                  comment.author === 'Client' 
                                    ? 'bg-blue-50 dark:bg-blue-900/20 ml-4' 
                                    : 'bg-muted mr-4'
                                }`}
                              >
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs font-medium">{comment.author}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm">{comment.text}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No comments yet
                          </p>
                        )}
                      </ScrollArea>
                      
                      {/* Add comment */}
                      <div className="flex gap-2 mt-3">
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
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
