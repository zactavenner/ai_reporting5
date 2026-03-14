import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  useOutreachSettings,
  useSaveOutreachSettings,
  useTestSendBlue,
  useTestElevenLabs,
} from '@/hooks/useAIOutreach';
import {
  MessageSquare,
  Phone,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Bot,
} from 'lucide-react';

interface AIOutreachSettingsTabProps {
  clientId: string;
}

export function AIOutreachSettingsTab({ clientId }: AIOutreachSettingsTabProps) {
  const { data: settings, isLoading } = useOutreachSettings(clientId);
  const saveSettings = useSaveOutreachSettings();
  const testSendBlue = useTestSendBlue();
  const testElevenLabs = useTestElevenLabs();

  const [enabled, setEnabled] = useState(false);
  const [sendblueKey, setSendblueKey] = useState('');
  const [sendblueSecret, setSendblueSecret] = useState('');
  const [sendbluePhone, setSendbluePhone] = useState('');
  const [elevenKey, setElevenKey] = useState('');
  const [elevenAgentId, setElevenAgentId] = useState('');
  const [elevenPhone, setElevenPhone] = useState('');
  const [showSendblueKey, setShowSendblueKey] = useState(false);
  const [showSendblueSecret, setShowSendblueSecret] = useState(false);
  const [showElevenKey, setShowElevenKey] = useState(false);
  const [sendblueStatus, setSendblueStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [elevenStatus, setElevenStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.ai_outreach_enabled || false);
      setSendblueKey(settings.sendblue_api_key || '');
      setSendblueSecret(settings.sendblue_api_secret || '');
      setSendbluePhone(settings.sendblue_phone_number || '');
      setElevenKey(settings.elevenlabs_api_key || '');
      setElevenAgentId(settings.elevenlabs_agent_id || '');
      setElevenPhone(settings.elevenlabs_phone_number || '');
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings.mutate({
      clientId,
      settings: {
        ai_outreach_enabled: enabled,
        sendblue_api_key: sendblueKey || null,
        sendblue_api_secret: sendblueSecret || null,
        sendblue_phone_number: sendbluePhone || null,
        elevenlabs_api_key: elevenKey || null,
        elevenlabs_agent_id: elevenAgentId || null,
        elevenlabs_phone_number: elevenPhone || null,
      },
    });
  };

  const handleTestSendBlue = async () => {
    try {
      const result = await testSendBlue.mutateAsync(clientId);
      if (result.connected) {
        setSendblueStatus('connected');
        toast.success('SendBlue connection successful');
      } else {
        setSendblueStatus('error');
        toast.error(`SendBlue connection failed: ${result.error}`);
      }
    } catch (err) {
      setSendblueStatus('error');
      toast.error('SendBlue connection test failed');
    }
  };

  const handleTestElevenLabs = async () => {
    try {
      const result = await testElevenLabs.mutateAsync(clientId);
      if (result.connected) {
        setElevenStatus('connected');
        toast.success(`ElevenLabs connected — ${result.available_voices} voices, ${result.available_agents} agents available`);
      } else {
        setElevenStatus('error');
        toast.error(`ElevenLabs connection failed: ${result.error}`);
      }
    } catch (err) {
      setElevenStatus('error');
      toast.error('ElevenLabs connection test failed');
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading AI outreach settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Master Enable/Disable */}
      <div className="flex items-center justify-between border-2 border-border p-4">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5" />
          <div>
            <p className="font-medium">AI Outreach</p>
            <p className="text-sm text-muted-foreground">
              Enable AI-powered SMS and voice outreach for lead nurturing
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* SendBlue Configuration */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <h4 className="font-medium">SendBlue (SMS / iMessage)</h4>
          </div>
          <div className="flex items-center gap-2">
            {sendblueStatus === 'connected' && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" /> Connected
              </Badge>
            )}
            {sendblueStatus === 'error' && (
              <Badge variant="outline" className="text-red-600 border-red-600">
                <XCircle className="h-3 w-3 mr-1" /> Error
              </Badge>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          SendBlue enables SMS and iMessage outreach. Get your API credentials at{' '}
          <span className="font-mono">sendblue.co/dashboard</span>
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="sendblue-key">API Key</Label>
            <div className="relative">
              <Input
                id="sendblue-key"
                type={showSendblueKey ? 'text' : 'password'}
                value={sendblueKey}
                onChange={(e) => setSendblueKey(e.target.value)}
                placeholder="sb-api-key-..."
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowSendblueKey(!showSendblueKey)}
              >
                {showSendblueKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sendblue-secret">API Secret</Label>
            <div className="relative">
              <Input
                id="sendblue-secret"
                type={showSendblueSecret ? 'text' : 'password'}
                value={sendblueSecret}
                onChange={(e) => setSendblueSecret(e.target.value)}
                placeholder="sb-api-secret-..."
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowSendblueSecret(!showSendblueSecret)}
              >
                {showSendblueSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sendblue-phone">SendBlue Phone Number</Label>
          <Input
            id="sendblue-phone"
            value={sendbluePhone}
            onChange={(e) => setSendbluePhone(e.target.value)}
            placeholder="+1234567890"
          />
          <p className="text-xs text-muted-foreground">Your registered SendBlue phone number for outbound messages</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleTestSendBlue}
          disabled={!sendblueKey || !sendblueSecret || testSendBlue.isPending}
        >
          {testSendBlue.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Test SendBlue Connection
        </Button>
      </div>

      {/* ElevenLabs Configuration */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <h4 className="font-medium">ElevenLabs (AI Voice Calls)</h4>
          </div>
          <div className="flex items-center gap-2">
            {elevenStatus === 'connected' && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" /> Connected
              </Badge>
            )}
            {elevenStatus === 'error' && (
              <Badge variant="outline" className="text-red-600 border-red-600">
                <XCircle className="h-3 w-3 mr-1" /> Error
              </Badge>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          ElevenLabs Conversational AI enables AI-powered outbound voice calls that can book appointments.
          Set up your agent at <span className="font-mono">elevenlabs.io/app/conversational-ai</span>
        </p>

        <div className="space-y-1">
          <Label htmlFor="eleven-key">ElevenLabs API Key</Label>
          <div className="relative">
            <Input
              id="eleven-key"
              type={showElevenKey ? 'text' : 'password'}
              value={elevenKey}
              onChange={(e) => setElevenKey(e.target.value)}
              placeholder="xi-..."
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowElevenKey(!showElevenKey)}
            >
              {showElevenKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="eleven-agent">Agent ID</Label>
            <Input
              id="eleven-agent"
              value={elevenAgentId}
              onChange={(e) => setElevenAgentId(e.target.value)}
              placeholder="agent_..."
            />
            <p className="text-xs text-muted-foreground">Your ElevenLabs Conversational AI agent ID</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="eleven-phone">Outbound Phone Number</Label>
            <Input
              id="eleven-phone"
              value={elevenPhone}
              onChange={(e) => setElevenPhone(e.target.value)}
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground">Phone number ID from ElevenLabs</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleTestElevenLabs}
          disabled={!elevenKey || testElevenLabs.isPending}
        >
          {testElevenLabs.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Test ElevenLabs Connection
        </Button>
      </div>

      {/* Setup Guide */}
      <div className="border-2 border-border p-4 space-y-2 bg-muted/50">
        <h4 className="font-medium">Setup Guide</h4>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>1. SendBlue Setup:</strong> Create account at sendblue.co, get API Key + Secret from dashboard, register a phone number.</p>
          <p><strong>2. ElevenLabs Setup:</strong> Create account at elevenlabs.io, create a Conversational AI agent with your script, get API Key from profile, copy Agent ID.</p>
          <p><strong>3. Create Campaign:</strong> After configuring API keys, create outreach campaigns from the client detail page AI Outreach tab.</p>
          <p><strong>4. Lead Flow:</strong> New leads from GHL are automatically eligible for outreach. SMS warms the lead, then AI voice calls convert them to appointments.</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saveSettings.isPending}>
        {saveSettings.isPending ? 'Saving...' : 'Save AI Outreach Settings'}
      </Button>
    </div>
  );
}
