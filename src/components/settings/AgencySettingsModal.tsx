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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAgencySettings, useUpdateAgencySettings } from '@/hooks/useAgencySettings';
import { useSyncMeetings } from '@/hooks/useMeetings';
import { TeamManagementTab } from './TeamManagementTab';
import { SyncQueueStatus } from './SyncQueueStatus';
import { Brain, Settings2, Key, DollarSign, Eye, EyeOff, Video, Copy, RefreshCw, Users, Database } from 'lucide-react';

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
  
  // API Keys
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [apiUsageLimit, setApiUsageLimit] = useState('100');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  
  // MeetGeek Integration
  const [meetgeekApiKey, setMeetgeekApiKey] = useState('');
  const [showMeetgeekKey, setShowMeetgeekKey] = useState(false);
  const syncMeetings = useSyncMeetings();
  
  const webhookUrl = `https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/meetgeek-webhook`;

  useEffect(() => {
    if (settings) {
      setAgencyPrompt(settings.ai_prompt_agency || '');
      setClientPrompt(settings.ai_prompt_client || '');
      setOpenaiKey(settings.openai_api_key || '');
      setGeminiKey(settings.gemini_api_key || '');
      setApiUsageLimit(String(settings.api_usage_limit || 100));
      setMeetgeekApiKey((settings as any).meetgeek_api_key || '');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        ai_prompt_agency: agencyPrompt,
        ai_prompt_client: clientPrompt,
        openai_api_key: openaiKey || null,
        gemini_api_key: geminiKey || null,
        api_usage_limit: parseFloat(apiUsageLimit) || 100,
        meetgeek_api_key: meetgeekApiKey || null,
      } as any);
      toast.success('Agency settings saved');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Estimate monthly usage based on typical API costs
  const estimateMonthlyUsage = () => {
    const limit = parseFloat(apiUsageLimit) || 100;
    // Rough estimates: GPT-4 ~$0.03/1k tokens, Gemini Pro ~$0.00025/1k tokens
    // Assuming avg 2000 tokens per request
    const estimatedRequests = Math.floor(limit / 0.06); // ~$0.06 per request avg
    return estimatedRequests;
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
            Configure agency-wide settings including AI prompts and API keys
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="team" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
            <TabsTrigger value="sync-queue" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Sync Queue
            </TabsTrigger>
            <TabsTrigger value="ai-prompts" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Prompts
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="team" className="mt-4">
            <TeamManagementTab />
          </TabsContent>

          <TabsContent value="sync-queue" className="mt-4">
            <SyncQueueStatus />
          </TabsContent>
          
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

          <TabsContent value="api-keys" className="space-y-6 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  OpenAI API Key
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Your OpenAI API key for GPT-4 and other models. Get one at{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">
                    platform.openai.com
                  </a>
                </p>
                <div className="relative">
                  <Input
                    id="openaiKey"
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  >
                    {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Google Gemini API Key
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Your Google Gemini API key for Gemini Pro models. Get one at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary underline">
                    aistudio.google.com
                  </a>
                </p>
                <div className="relative">
                  <Input
                    id="geminiKey"
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Monthly Usage Limit
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Set a monthly spending limit for API usage (in USD)
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">$</span>
                    <Input
                      id="usageLimit"
                      type="number"
                      value={apiUsageLimit}
                      onChange={(e) => setApiUsageLimit(e.target.value)}
                      className="w-24"
                      min="0"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ≈ {estimateMonthlyUsage().toLocaleString()} requests/month
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 border border-border p-3 text-sm">
              <p className="font-medium mb-1">Usage Estimate</p>
              <p className="text-muted-foreground">
                Based on ${apiUsageLimit}/month limit and average token usage:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
                <li>OpenAI GPT-4: ~${(parseFloat(apiUsageLimit) * 0.7).toFixed(0)} allocated</li>
                <li>Gemini Pro: ~${(parseFloat(apiUsageLimit) * 0.3).toFixed(0)} allocated</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  MeetGeek.ai Integration
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Sync meeting recordings, transcripts, and action items automatically.
                  Get your API key from{' '}
                  <a 
                    href="https://meetgeek.ai/settings/integrations" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-primary underline"
                  >
                    MeetGeek Settings → Integrations → Public API
                  </a>
                </p>
                
                <Label htmlFor="meetgeekKey">API Key</Label>
                <div className="relative mt-1">
                  <Input
                    id="meetgeekKey"
                    type={showMeetgeekKey ? 'text' : 'password'}
                    value={meetgeekApiKey}
                    onChange={(e) => setMeetgeekApiKey(e.target.value)}
                    placeholder="Your MeetGeek API key..."
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowMeetgeekKey(!showMeetgeekKey)}
                  >
                    {showMeetgeekKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="pt-2">
                <Label>Webhook URL</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Copy this URL to MeetGeek under Settings → Integrations → Webhooks
                </p>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success('Webhook URL copied');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => syncMeetings.mutate()}
                  disabled={syncMeetings.isPending || !meetgeekApiKey}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncMeetings.isPending ? 'animate-spin' : ''}`} />
                  {syncMeetings.isPending ? 'Syncing...' : 'Sync Recent Meetings'}
                </Button>
                {!meetgeekApiKey && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Enter your API key and save settings first
                  </p>
                )}
              </div>
            </div>
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