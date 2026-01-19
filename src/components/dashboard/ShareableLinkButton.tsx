import { useState } from 'react';
import { Link2, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ShareableLinkButtonProps {
  clientId: string;
  clientName: string;
  publicToken: string | null;
}

export function ShareableLinkButton({ clientId, clientName, publicToken }: ShareableLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState(publicToken);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const shareUrl = token 
    ? `${window.location.origin}/public/${token}`
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

      setToken(newToken);
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

      setToken(null);
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
                  Regenerate
                </Button>
                <Button
                  variant="destructive"
                  onClick={revokeToken}
                  disabled={isGenerating}
                >
                  Revoke Access
                </Button>
              </div>

              <div className="bg-muted/50 border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">🌐 Public Access:</strong> Anyone with this link can view this client's performance report without logging in. Click "Revoke Access" to disable the link immediately.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4">
                No shareable link has been created for this client yet.
              </p>
              <Button onClick={generateToken} disabled={isGenerating}>
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Generate Shareable Link
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
