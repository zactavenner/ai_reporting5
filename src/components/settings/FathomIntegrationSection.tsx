import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Video, RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface FathomIntegrationSectionProps {
  clientId: string;
  settings: any;
}

export function FathomIntegrationSection({ clientId, settings }: FathomIntegrationSectionProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const s = settings as any;
      setEnabled(s.fathom_enabled || false);
      setApiKey(s.fathom_api_key || '');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('client_settings')
        .upsert({
          client_id: clientId,
          fathom_enabled: enabled,
          fathom_api_key: apiKey || null,
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
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Fathom API key"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Found in Fathom → User Settings → API Access. Leave blank to use the global key.
            </p>
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
            <Button
              variant="secondary"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
