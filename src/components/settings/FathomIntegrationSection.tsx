import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Video, RefreshCw, Loader2, Eye, EyeOff, Plus, Trash2, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface FathomKeyEntry {
  label: string;
  api_key: string;
  webhook_secret: string;
}

interface FathomIntegrationSectionProps {
  clientId: string;
  settings: any;
}

export function FathomIntegrationSection({ clientId, settings }: FathomIntegrationSectionProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [legacyApiKey, setLegacyApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState<FathomKeyEntry[]>([]);
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/fathom-webhook`;

  useEffect(() => {
    if (settings) {
      const s = settings as any;
      setEnabled(s.fathom_enabled || false);
      setLegacyApiKey(s.fathom_api_key || '');
      const keys = s.fathom_api_keys || [];
      if (Array.isArray(keys) && keys.length > 0) {
        setApiKeys(keys);
      } else if (s.fathom_api_key) {
        // Migrate legacy single key
        setApiKeys([{ label: 'Default', api_key: s.fathom_api_key, webhook_secret: '' }]);
      }
    }
  }, [settings]);

  const handleAddKey = () => {
    setApiKeys([...apiKeys, { label: '', api_key: '', webhook_secret: '' }]);
  };

  const handleRemoveKey = (index: number) => {
    setApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleKeyChange = (index: number, field: keyof FathomKeyEntry, value: string) => {
    const updated = [...apiKeys];
    updated[index] = { ...updated[index], [field]: value };
    setApiKeys(updated);
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const primaryKey = apiKeys[0]?.api_key || legacyApiKey || null;
      const { error } = await supabase
        .from('client_settings')
        .upsert({
          client_id: clientId,
          fathom_enabled: enabled,
          fathom_api_key: primaryKey,
          fathom_api_keys: apiKeys.filter(k => k.api_key),
        } as any, { onConflict: 'client_id' });

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['client-settings', clientId] });
      toast.success('Fathom settings saved');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save Fathom settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-fathom-meetings', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      toast.success(`Synced ${data.synced} meetings, ${data.matched} contacts matched, ${data.callsUpdated} call transcripts updated`);
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    } catch (error: any) {
      console.error(error);
      toast.error(`Fathom sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border-2 border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium mb-1 flex items-center gap-2">
            <Video className="h-4 w-4" />
            Fathom.ai Integration
          </h4>
          <p className="text-sm text-muted-foreground">
            Sync meeting recordings, transcripts, summaries, and action items from Fathom
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>Webhook URL (paste in Fathom Settings)</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-xs bg-muted/50"
              />
              <Button type="button" variant="outline" size="icon" onClick={handleCopyWebhookUrl} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL in Fathom → User Settings → API Access → Manage → Add Webhook. Include summary, transcript, and action items.
            </p>
          </div>

          {/* API Keys */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>API Keys & Webhook Secrets</Label>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddKey} className="gap-1 text-xs">
                <Plus className="h-3 w-3" /> Add Key
              </Button>
            </div>

            {apiKeys.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No API keys configured. Click "Add Key" to add one.</p>
            )}

            {apiKeys.map((entry, i) => (
              <div key={i} className="border border-border rounded p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Input
                    value={entry.label}
                    onChange={(e) => handleKeyChange(i, 'label', e.target.value)}
                    placeholder="Label (e.g. team member name)"
                    className="text-sm h-8 max-w-[200px]"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveKey(i)} className="h-7 w-7 p-0 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">API Key</Label>
                  <div className="relative">
                    <Input
                      type={showKeys[i] ? 'text' : 'password'}
                      value={entry.api_key}
                      onChange={(e) => handleKeyChange(i, 'api_key', e.target.value)}
                      placeholder="Fathom API key"
                      className="pr-10 text-sm h-8"
                    />
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                      onClick={() => setShowKeys({ ...showKeys, [i]: !showKeys[i] })}
                    >
                      {showKeys[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Webhook Secret</Label>
                  <Input
                    type="password"
                    value={entry.webhook_secret}
                    onChange={(e) => handleKeyChange(i, 'webhook_secret', e.target.value)}
                    placeholder="whsec_..."
                    className="text-sm h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Found when creating webhook in Fathom. Used to verify incoming webhooks.
                  </p>
                </div>
              </div>
            ))}
          </div>

          {(settings as any)?.fathom_last_sync && (
            <div className="flex justify-between items-center text-sm p-2 border border-border bg-muted/30">
              <span className="text-muted-foreground">Last Sync:</span>
              <span className="font-medium">
                {new Date((settings as any).fathom_last_sync).toLocaleString()}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Fathom Settings
            </Button>
            <Button variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
