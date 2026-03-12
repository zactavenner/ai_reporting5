import { useState } from 'react';
import { Creative } from '@/hooks/useCreatives';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { 
  FileText, 
  Sparkles, 
  Loader2, 
  Video,
  CheckCircle,
  AlertCircle,
  Star,
  Paintbrush,
  Copy,
  Download
} from 'lucide-react';

interface CreativeAIActionsProps {
  creative: Creative;
}

export function CreativeAIActions({ creative }: CreativeAIActionsProps) {
  const [transcribing, setTranscribing] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audit, setAudit] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // AI Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState<string | null>(null);

  // AI Variations state
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [generatingVariations, setGeneratingVariations] = useState(false);
  const [variations, setVariations] = useState<{ url: string; description: string }[]>([]);

  const handleTranscribe = async () => {
    if (!creative.file_url) {
      toast.error('No video file to transcribe');
      return;
    }

    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('creative-ai-audit', {
        body: { 
          action: 'transcribe',
          videoUrl: creative.file_url 
        }
      });

      if (error) throw error;

      if (data?.transcript) {
        setTranscript(data.transcript);
        setTranscriptOpen(true);
        toast.success('Video transcribed successfully');
      } else {
        throw new Error('No transcript returned');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error('Failed to transcribe video');
    } finally {
      setTranscribing(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke('creative-ai-audit', {
        body: { 
          action: 'audit',
          creative: {
            title: creative.title,
            type: creative.type,
            platform: creative.platform,
            headline: creative.headline,
            body_copy: creative.body_copy,
            cta_text: creative.cta_text,
            file_url: creative.file_url
          },
          transcript: transcript
        }
      });

      if (error) throw error;

      if (data?.audit) {
        setAudit(data.audit);
        setAuditOpen(true);
        toast.success('AI audit complete');
      } else {
        throw new Error('No audit returned');
      }
    } catch (error) {
      console.error('Audit error:', error);
      toast.error('Failed to run AI audit');
    } finally {
      setAuditing(false);
    }
  };

  const handleAIEdit = async () => {
    if (!editPrompt.trim()) {
      toast.error('Please describe the edits you want');
      return;
    }

    setEditing(true);
    setEditedImageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('creative-ai-audit', {
        body: { 
          action: 'ai_edit',
          creative: {
            client_id: creative.client_id,
            file_url: creative.file_url,
          },
          imageUrl: creative.file_url,
          editPrompt: editPrompt,
        }
      });

      if (error) throw error;

      if (data?.editedImageUrl) {
        setEditedImageUrl(data.editedImageUrl);
        setEditDescription(data.description || null);
        toast.success('AI edit complete!');
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        throw new Error('No edited image returned');
      }
    } catch (error) {
      console.error('AI Edit error:', error);
      toast.error('Failed to apply AI edits');
    } finally {
      setEditing(false);
    }
  };

  const handleAIVariations = async () => {
    setGeneratingVariations(true);
    setVariations([]);
    try {
      const { data, error } = await supabase.functions.invoke('creative-ai-audit', {
        body: { 
          action: 'ai_variations',
          creative: {
            client_id: creative.client_id,
            file_url: creative.file_url,
          },
          imageUrl: creative.file_url,
        }
      });

      if (error) throw error;

      if (data?.variations && data.variations.length > 0) {
        setVariations(data.variations);
        toast.success(`Generated ${data.variations.length} variation(s)`);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        throw new Error('No variations returned');
      }
    } catch (error) {
      console.error('AI Variations error:', error);
      toast.error('Failed to generate variations');
    } finally {
      setGeneratingVariations(false);
    }
  };

  // Extract score from audit text
  const extractScore = (auditText: string): number | null => {
    const match = auditText.match(/Overall Score[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  };

  const score = audit ? extractScore(audit) : null;

  const getScoreColor = (s: number) => {
    if (s >= 8) return 'text-green-500';
    if (s >= 6) return 'text-amber-500';
    return 'text-red-500';
  };

  const isImageCreative = creative.type === 'image' && creative.file_url;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {creative.type === 'video' && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTranscribe}
            disabled={transcribing}
            className="gap-2"
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {transcribing ? 'Transcribing...' : 'Transcribe Video'}
          </Button>
        )}

        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleAudit}
          disabled={auditing}
          className="gap-2"
        >
          {auditing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {auditing ? 'Analyzing...' : 'AI Audit'}
        </Button>

        {/* AI Edit - image only */}
        {isImageCreative && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setEditOpen(true)}
            className="gap-2"
          >
            <Paintbrush className="h-4 w-4" />
            AI Edit
          </Button>
        )}

        {/* AI Variations - image only */}
        {isImageCreative && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { setVariationsOpen(true); handleAIVariations(); }}
            disabled={generatingVariations}
            className="gap-2"
          >
            {generatingVariations ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {generatingVariations ? 'Generating...' : 'AI Variations'}
          </Button>
        )}

        {/* Quick indicators */}
        {transcript && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setTranscriptOpen(true)}
            className="gap-1 text-green-600"
          >
            <CheckCircle className="h-4 w-4" />
            Transcript Ready
          </Button>
        )}

        {audit && score !== null && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setAuditOpen(true)}
            className={`gap-1 ${getScoreColor(score)}`}
          >
            <Star className="h-4 w-4" />
            Score: {score}/10
          </Button>
        )}
      </div>

      {/* Transcript Modal */}
      <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Video Transcription
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-sm dark:prose-invert max-w-none pr-4">
              <ReactMarkdown>{transcript || ''}</ReactMarkdown>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Audit Modal */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Creative Audit
              {score !== null && (
                <Badge className={`ml-2 ${score >= 8 ? 'bg-green-100 text-green-800' : score >= 6 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                  Score: {score}/10
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex items-center gap-4 py-2">
            <Badge variant="outline">{creative.platform}</Badge>
            <Badge variant="secondary">{creative.type}</Badge>
            <span className="text-sm text-muted-foreground">{creative.title}</span>
          </div>
          
          <Separator />
          
          <ScrollArea className="max-h-[55vh]">
            <div className="prose prose-sm dark:prose-invert max-w-none pr-4">
              <ReactMarkdown>{audit || ''}</ReactMarkdown>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* AI Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paintbrush className="h-5 w-5 text-primary" />
              AI Edit Creative
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Image */}
            <div>
              <p className="text-sm font-medium mb-2">Original</p>
              <div className="border rounded-lg overflow-hidden bg-muted">
                <img 
                  src={creative.file_url!} 
                  alt="Original" 
                  className="w-full h-auto object-contain max-h-[400px]"
                />
              </div>
            </div>

            {/* Edited Image or Prompt */}
            <div>
              <p className="text-sm font-medium mb-2">
                {editedImageUrl ? 'Edited Result' : 'Describe your edits'}
              </p>
              {editedImageUrl ? (
                <div className="border rounded-lg overflow-hidden bg-muted">
                  <img 
                    src={editedImageUrl} 
                    alt="Edited" 
                    className="w-full h-auto object-contain max-h-[400px]"
                  />
                  {editDescription && (
                    <p className="p-2 text-xs text-muted-foreground">{editDescription}</p>
                  )}
                  <div className="p-2 flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={editedImageUrl} download target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g., Change the background to sunset colors, make the text larger, add a gold border..."
                    rows={6}
                  />
                  <div className="flex flex-wrap gap-2">
                    {['Change background color', 'Make text bolder', 'Add warm overlay', 'Increase contrast'].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setEditPrompt(prev => prev ? `${prev}, ${suggestion.toLowerCase()}` : suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {editedImageUrl && (
              <Button 
                variant="outline"
                onClick={() => { setEditedImageUrl(null); setEditPrompt(''); }}
              >
                Edit Again
              </Button>
            )}
            {!editedImageUrl && (
              <Button 
                onClick={handleAIEdit}
                disabled={editing || !editPrompt.trim()}
              >
                {editing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Edit...
                  </>
                ) : (
                  <>
                    <Paintbrush className="h-4 w-4 mr-2" />
                    Apply Edit
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Variations Modal */}
      <Dialog open={variationsOpen} onOpenChange={setVariationsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-primary" />
              AI Variations
              <Badge variant="outline" className="ml-2">3 Variations</Badge>
            </DialogTitle>
          </DialogHeader>
          
          {generatingVariations ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating 3 creative variations...</p>
              <p className="text-xs text-muted-foreground">This may take up to a minute</p>
            </div>
          ) : variations.length > 0 ? (
            <ScrollArea className="max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-4">
                {variations.map((v, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    <img 
                      src={v.url} 
                      alt={`Variation ${i + 1}`} 
                      className="w-full h-auto object-contain bg-muted"
                    />
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium">Variation {i + 1}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3">{v.description}</p>
                      <Button size="sm" variant="outline" className="w-full" asChild>
                        <a href={v.url} download target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No variations generated yet. Try again.</p>
              <Button className="mt-4" onClick={handleAIVariations}>
                <Copy className="h-4 w-4 mr-2" />
                Generate Variations
              </Button>
            </div>
          )}

          {/* Original for comparison */}
          {variations.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Original</p>
              <img 
                src={creative.file_url!} 
                alt="Original" 
                className="h-24 rounded border object-contain bg-muted"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}