import { useState } from 'react';
import { Link2, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ShareableLinkButtonProps {
  clientId: string;
  clientName: string;
  publicToken: string | null;
  slug: string | null;
}

export function ShareableLinkButton({ clientId, clientName, publicToken, slug }: ShareableLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  // Use slug for friendly URLs, fall back to public_token for legacy
  const linkIdentifier = slug || publicToken;
  const shareUrl = linkIdentifier 
    ? `${window.location.origin}/public/${linkIdentifier}`
    : null;

  const generateToken = async () => {
    setIsGenerating(true);
    try {
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from('clients')
        .update({ public_token: newToken })
        .eq('id', clientId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Shareable link generated');
    } catch (err) {
      toast.error('Failed to generate link');
    } finally {
      setIsGenerating(false);
    }
  };

  const revokeToken = async () => {
    setIsGenerating(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ public_token: null })
        .eq('id', clientId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Link revoked');
    } catch (err) {
      toast.error('Failed to revoke link');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Public Report Link</DialogTitle>
          <DialogDescription>
            Create a public link for {clientName} to view their performance report.
            <strong className="block mt-1">No login required</strong> — anyone with this link can access the report.
            They will only see their own data, not the agency dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {shareUrl ? (
            <>
              <div className="space-y-2">
                <Label>Public Report Link</Label>
                <p className="text-xs text-muted-foreground">
                  Uses friendly URL: /public/{slug || 'client-name'}
                </p>
                <div className="flex gap-2">
                  <Input 
                    value={shareUrl} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(shareUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={generateToken}
                  disabled={isGenerating}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                  Regenerate Token
                </Button>
                <Button
                  variant="destructive"
                  onClick={revokeToken}
                  disabled={isGenerating}
                >
                  Revoke Access
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">
                No public link generated yet.
              </p>
              <Button onClick={generateToken} disabled={isGenerating}>
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Generate Public Link
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
