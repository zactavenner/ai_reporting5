import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAgencySettings, useUpdateAgencySettings } from '@/hooks/useAgencySettings';
import { Brain, Settings2 } from 'lucide-react';

interface AgencySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgencySettingsModal({ open, onOpenChange }: AgencySettingsModalProps) {
  const { data: settings } = useAgencySettings();
  const updateSettings = useUpdateAgencySettings();
  
  const [saving, setSaving] = useState(false);
  const [agencyPrompt, setAgencyPrompt] = useState('');
  const [clientPrompt, setClientPrompt] = useState('');

  useEffect(() => {
    if (settings) {
      setAgencyPrompt(settings.ai_prompt_agency || '');
      setClientPrompt(settings.ai_prompt_client || '');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        ai_prompt_agency: agencyPrompt,
        ai_prompt_client: clientPrompt,
      });
      toast.success('Agency settings saved');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-2 border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Agency Settings
          </DialogTitle>
          <DialogDescription>
            Configure agency-wide settings including AI prompts
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ai-prompts" className="mt-4">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="ai-prompts" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Prompts
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="ai-prompts" className="space-y-6 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Agency-Level AI Prompt
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  This prompt is used when analyzing data at the agency dashboard level.
                  The AI will read uploaded files and use this context.
                </p>
                <Label htmlFor="agencyPrompt">System Prompt</Label>
                <Textarea
                  id="agencyPrompt"
                  value={agencyPrompt}
                  onChange={(e) => setAgencyPrompt(e.target.value)}
                  rows={6}
                  placeholder="Enter the system prompt for agency-level AI analysis..."
                  className="mt-2 font-mono text-sm"
                />
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Client-Level AI Prompt
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  This prompt is used when analyzing data for individual clients.
                  The AI will read uploaded files and use this context.
                </p>
                <Label htmlFor="clientPrompt">System Prompt</Label>
                <Textarea
                  id="clientPrompt"
                  value={clientPrompt}
                  onChange={(e) => setClientPrompt(e.target.value)}
                  rows={6}
                  placeholder="Enter the system prompt for client-level AI analysis..."
                  className="mt-2 font-mono text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tip: Include instructions about what data sources to consider, how to format responses, 
              and any specific metrics or KPIs to focus on.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
