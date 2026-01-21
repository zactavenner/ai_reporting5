import { useState } from 'react';
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
import { useCreateCustomTab } from '@/hooks/useCustomTabs';
import { Plus } from 'lucide-react';

interface AddCustomTabModalProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCustomTabModal({ clientId, open, onOpenChange }: AddCustomTabModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const createTab = useCreateCustomTab();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !url.trim()) return;
    
    // Validate URL
    let validUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      validUrl = 'https://' + url;
    }
    
    await createTab.mutateAsync({
      client_id: clientId,
      name: name.trim(),
      url: validUrl,
    });
    
    setName('');
    setUrl('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Tab</DialogTitle>
          <DialogDescription>
            Create a new tab that will embed an external URL in the client dashboard and public report.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="tab-name">Tab Name</Label>
            <Input
              id="tab-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Analytics, Reports, CRM"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tab-url">URL to Embed</Label>
            <Input
              id="tab-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/embed"
            />
            <p className="text-xs text-muted-foreground">
              The URL will be displayed in an iframe. Make sure the site allows embedding.
            </p>
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !url.trim() || createTab.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tab
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
