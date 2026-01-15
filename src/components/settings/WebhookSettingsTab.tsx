import { useState } from 'react';
import { Copy, Check, ExternalLink, Play, Trash2, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useWebhookLogs,
  useWebhookMappings,
  useUpdateWebhookMappings,
  useClearWebhookLogs,
  useClientWebhookSecret,
  useRegenerateWebhookSecret,
  WEBHOOK_DEFINITIONS,
  WebhookMapping,
} from '@/hooks/useWebhooks';
import { toast } from 'sonner';

interface WebhookSettingsTabProps {
  clientId: string;
}

export function WebhookSettingsTab({ clientId }: WebhookSettingsTabProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [localMappings, setLocalMappings] = useState<Record<string, WebhookMapping>>({});
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  const { data: webhookLogs = [], isLoading: logsLoading } = useWebhookLogs(clientId);
  const { data: savedMappings = {} } = useWebhookMappings(clientId);
  const { data: webhookSecret } = useClientWebhookSecret(clientId);
  const updateMappings = useUpdateWebhookMappings();
  const clearLogs = useClearWebhookLogs();
  const regenerateSecret = useRegenerateWebhookSecret();

  // Build the base webhook URL
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest/${clientId}`;

  const handleCopyUrl = (webhookId: string) => {
    const url = `${baseUrl}/${webhookId}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(webhookId);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleCopySecret = () => {
    if (webhookSecret) {
      navigator.clipboard.writeText(webhookSecret);
      setCopiedSecret(true);
      toast.success('Webhook secret copied');
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleMappingChange = (webhookId: string, fieldKey: string, value: string) => {
    setLocalMappings(prev => ({
      ...prev,
      [webhookId]: {
        ...(prev[webhookId] || savedMappings[webhookId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSaveMappings = async () => {
    const mergedMappings = { ...savedMappings, ...localMappings };
    await updateMappings.mutateAsync({ clientId, mappings: mergedMappings });
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingWebhook(webhookId);
    const def = WEBHOOK_DEFINITIONS.find(d => d.id === webhookId);
    if (!def) return;

    try {
      const response = await fetch(`${baseUrl}/${webhookId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret || '',
        },
        body: JSON.stringify(def.samplePayload),
      });

      if (response.ok) {
        toast.success(`Test webhook sent successfully!`);
      } else {
        const error = await response.json();
        toast.error(`Webhook test failed: ${error.error}`);
      }
    } catch (error) {
      toast.error(`Network error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setTestingWebhook(null);
    }
  };

  const getMappingValue = (webhookId: string, fieldKey: string): string => {
    return localMappings[webhookId]?.[fieldKey as keyof WebhookMapping] || 
           savedMappings[webhookId]?.[fieldKey as keyof WebhookMapping] || '';
  };

  return (
    <div className="space-y-6">
      {/* Webhook Secret Section */}
      <div className="border-2 border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Webhook Authentication</h4>
            <p className="text-sm text-muted-foreground">
              Include this secret in the <code className="bg-muted px-1 rounded">x-webhook-secret</code> header
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateSecret.mutate(clientId)}
            disabled={regenerateSecret.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${regenerateSecret.isPending ? 'animate-spin' : ''}`} />
            Regenerate
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={webhookSecret ? `${webhookSecret.substring(0, 8)}...${webhookSecret.substring(webhookSecret.length - 8)}` : 'Loading...'}
            readOnly
            className="font-mono text-sm"
          />
          <Button variant="outline" size="icon" onClick={handleCopySecret}>
            {copiedSecret ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Webhook Endpoints */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Webhook Endpoints</h4>
            <p className="text-sm text-muted-foreground">
              Configure these webhooks in GoHighLevel to send data automatically
            </p>
          </div>
          <Button onClick={handleSaveMappings} disabled={updateMappings.isPending}>
            {updateMappings.isPending ? 'Saving...' : 'Save Mappings'}
          </Button>
        </div>

        <div className="space-y-3">
          {WEBHOOK_DEFINITIONS.map((def) => {
            const isExpanded = expandedWebhook === def.id;
            const hasMappings = def.mappingFields.length > 0;
            const isMapped = savedMappings[def.id] && Object.keys(savedMappings[def.id]).length > 0;

            return (
              <Collapsible
                key={def.id}
                open={isExpanded}
                onOpenChange={() => setExpandedWebhook(isExpanded ? null : def.id)}
              >
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{def.label}</span>
                        {isMapped && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Mapped
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyUrl(def.id);
                        }}
                      >
                        {copiedUrl === def.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestWebhook(def.id);
                        }}
                        disabled={testingWebhook === def.id}
                      >
                        <Play className={`h-4 w-4 ${testingWebhook === def.id ? 'animate-pulse' : ''}`} />
                      </Button>
                      {hasMappings && (
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </div>
                  </div>

                  {/* URL Display */}
                  <div className="px-3 py-2 bg-background border-t border-border">
                    <code className="text-xs text-muted-foreground break-all">
                      {`${baseUrl}/${def.endpointSuffix}`}
                    </code>
                  </div>

                  {/* Mapping Fields */}
                  {hasMappings && (
                    <CollapsibleContent>
                      <div className="p-3 border-t border-border space-y-3 bg-muted/10">
                        <h5 className="text-sm font-medium">Field Mappings</h5>
                        {def.mappingFields.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs">{field.label}</Label>
                            <Input
                              value={getMappingValue(def.id, field.key)}
                              onChange={(e) => handleMappingChange(def.id, field.key, e.target.value)}
                              placeholder={field.placeholder}
                              className="font-mono text-sm"
                            />
                            {field.helperText && (
                              <p className="text-xs text-muted-foreground">{field.helperText}</p>
                            )}
                          </div>
                        ))}

                        {/* Sample Payload */}
                        <div className="mt-3">
                          <Label className="text-xs">Sample Payload</Label>
                          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                            {JSON.stringify(def.samplePayload, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </CollapsibleContent>
                  )}
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* Webhook Logs */}
      <div className="border-2 border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Recent Webhook Activity</h4>
            <p className="text-sm text-muted-foreground">Last 50 webhook calls</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearLogs.mutate(clientId)}
            disabled={clearLogs.isPending || webhookLogs.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Logs
          </Button>
        </div>

        {logsLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading logs...</div>
        ) : webhookLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No webhook activity yet</p>
            <p className="text-xs mt-1">Use the Test button above to send a sample webhook</p>
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border text-sm ${
                    log.status === 'success'
                      ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                      : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">{log.webhook_type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.processed_at).toLocaleString()}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
