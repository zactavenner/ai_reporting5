import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientOffers, useCreateOffer, useUpdateOffer, useDeleteOffer, uploadOfferFile, ClientOffer } from '@/hooks/useClientOffers';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Image, File, Trash2, Download, ExternalLink, Upload, Pencil, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { OfferAssetHub } from './OfferAssetHub';

interface ClientOffersSectionProps {
  clientId: string;
  clientName: string;
  isPublicView?: boolean;
  brandColors?: string[] | null;
  brandFonts?: string[] | null;
  clientDescription?: string | null;
  offerDescription?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  clientType?: string | null;
}

export function ClientOffersSection({ clientId, clientName, isPublicView = false, brandColors, brandFonts, clientDescription, offerDescription, websiteUrl, industry, clientType }: ClientOffersSectionProps) {
  const { data: offers = [], isLoading } = useClientOffers(clientId);
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();
  const { currentMember } = useTeamMember();
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [editOffer, setEditOffer] = useState<ClientOffer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [offerType, setOfferType] = useState('file');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setOfferType('file');
    setSelectedFile(null);
    setEditOffer(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openEdit = (offer: ClientOffer) => {
    setEditOffer(offer);
    setTitle(offer.title);
    setDescription(offer.description || '');
    setOfferType(offer.offer_type);
    setSelectedFile(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setUploading(true);
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileType: string | undefined;
      let fileSizeBytes: number | undefined;

      if (selectedFile) {
        const result = await uploadOfferFile(clientId, selectedFile);
        fileUrl = result.url;
        fileName = selectedFile.name;
        fileType = selectedFile.name.split('.').pop()?.toLowerCase() || 'unknown';
        fileSizeBytes = selectedFile.size;
      }

      if (editOffer) {
        const updates: any = {
          title: title.trim(),
          description: description.trim() || null,
          offer_type: offerType,
        };
        if (selectedFile && fileUrl) {
          updates.file_url = fileUrl;
          updates.file_name = fileName;
          updates.file_type = fileType;
          updates.file_size_bytes = fileSizeBytes;
        }
        await updateOffer.mutateAsync({ id: editOffer.id, clientId, updates });
      } else {
        await createOffer.mutateAsync({
          client_id: clientId,
          title: title.trim(),
          description: description.trim() || undefined,
          file_url: fileUrl,
          file_name: fileName,
          file_type: fileType,
          file_size_bytes: fileSizeBytes,
          offer_type: offerType,
          uploaded_by: currentMember?.name || 'Unknown',
        });
      }

      resetForm();
      setAddOpen(false);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-5 w-5" />;
    if (['pdf'].includes(fileType)) return <FileText className="h-5 w-5 text-destructive" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fileType)) return <Image className="h-5 w-5 text-primary" />;
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'offer': return <Badge variant="default">Offer</Badge>;
      case 'document': return <Badge variant="secondary">Document</Badge>;
      default: return <Badge variant="outline">File</Badge>;
    }
  };

  const isImage = (fileType: string | null) => {
    return fileType && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fileType);
  };

  const isDialogOpen = addOpen || !!editOffer;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Offers & Files</h2>
          <p className="text-sm text-muted-foreground">
            Upload PDFs, images, and offer documents for {clientName}
          </p>
        </div>
        {!isPublicView && (
          <Button size="sm" onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Offer / File
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : offers.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No offers or files uploaded yet</p>
          {!isPublicView && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetForm(); setAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Upload First File
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((offer) => (
            <Card key={offer.id} className="p-4 space-y-3">
              {isImage(offer.file_type) && offer.file_url && (
                <div className="rounded-md overflow-hidden border border-border bg-muted/30">
                  <img src={offer.file_url} alt={offer.title} className="w-full h-40 object-cover" />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {getFileIcon(offer.file_type)}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{offer.title}</p>
                    {offer.file_name && (
                      <p className="text-xs text-muted-foreground truncate">{offer.file_name}</p>
                    )}
                  </div>
                </div>
                {getTypeBadge(offer.offer_type)}
              </div>

              {offer.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{offer.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{format(new Date(offer.created_at), 'MMM d, yyyy')}</span>
                <div className="flex items-center gap-1">
                  {offer.file_size_bytes && <span>{formatFileSize(offer.file_size_bytes)}</span>}
                  {offer.uploaded_by && <span>• {offer.uploaded_by}</span>}
                </div>
              </div>

              {/* Generate All Assets button */}
              {!isPublicView && (
                <OfferAssetHub
                  offer={offer}
                  clientId={clientId}
                  clientName={clientName}
                  brandColors={brandColors}
                  brandFonts={brandFonts}
                  clientDescription={clientDescription}
                  offerDescription={offerDescription}
                  websiteUrl={websiteUrl}
                  industry={industry}
                  clientType={clientType}
                />
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => navigate(`/client/${clientId}/offer/${offer.id}`)}
                >
                  View All Assets <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {offer.file_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(offer.file_url!, '_blank')}
                  >
                    {offer.file_type === 'pdf' ? (
                      <><ExternalLink className="h-3 w-3 mr-1" /> View</>
                    ) : (
                      <><Download className="h-3 w-3 mr-1" /> Download</>
                    )}
                  </Button>
                )}
                {!isPublicView && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openEdit(offer)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{offer.title}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove this file. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteOffer.mutate({ id: offer.id, clientId })}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Offer Modal */}
      <Dialog open={isDialogOpen} onOpenChange={(o) => { if (!o) { resetForm(); setAddOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editOffer ? 'Edit Offer / File' : 'Add Offer / File'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-semibold">Type</label>
              <Select value={offerType} onValueChange={setOfferType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold">Title *</label>
              <Input
                placeholder="e.g. Investment Deck Q1 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Description</label>
              <Textarea
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                {editOffer ? 'Replace File (optional)' : 'File'}
              </label>
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {selectedFile ? (
                  <p className="text-sm font-medium">{selectedFile.name} ({formatFileSize(selectedFile.size)})</p>
                ) : editOffer?.file_name ? (
                  <p className="text-sm text-muted-foreground">Current: {editOffer.file_name} — click to replace</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select PDF, PNG, JPG, etc.</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.pptx,.csv,.txt"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setAddOpen(false); }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={uploading || !title.trim()}>
                {uploading ? 'Saving...' : editOffer ? 'Save Changes' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
