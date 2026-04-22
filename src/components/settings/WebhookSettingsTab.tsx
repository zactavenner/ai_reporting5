import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, Play, Trash2, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2, X, Radio, Plus, Minus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useWebhookLogs,
  useWebhookMappings,
  useUpdateWebhookMappings,
  useClearWebhookLogs,
  useClientWebhookSecret,
  useRegenerateWebhookSecret,
  useLiveWebhookTest,
  extractJsonPaths,
  getValueByPath,
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
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [showSecretFull, setShowSecretFull] = useState(false);

  const { data: webhookLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useWebhookLogs(clientId);
  const { data: savedMappings = {} } = useWebhookMappings(clientId);
  const { data: webhookSecret } = useClientWebhookSecret(clientId);
  const updateMappings = useUpdateWebhookMappings();
  const clearLogs = useClearWebhookLogs();
  const regenerateSecret = useRegenerateWebhookSecret();

  // Live test hook
  const liveTest = useLiveWebhookTest(clientId, testingWebhookId);

  // Fetch client slug for new-style URLs
  const { data: clientRow } = useQuery({
    queryKey: ['client-slug', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('slug, name')
        .eq('id', clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const clientSlug = clientRow?.slug || null;
  const functionsBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest`;
  // Slug-based URL: one segment, /<slug>-<event>
  const slugBaseAvailable = !!clientSlug;
  // Legacy UUID base (kept for backward compat)
  const baseUrl = `${functionsBase}/${clientId}`;
  const [showLegacyUrls, setShowLegacyUrls] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const buildSlugUrl = (suffix: string) =>
    clientSlug ? `${functionsBase}/${clientSlug}-${suffix}` : '';

  const handleCopyAll = () => {
    if (!clientSlug) return;
    const all = WEBHOOK_DEFINITIONS.reduce((acc, d) => {
      acc[d.id] = buildSlugUrl(d.endpointSuffix);
      return acc;
    }, {} as Record<string, string>);
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
    setCopiedAll(true);
    toast.success('All webhook URLs copied as JSON');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopySlugUrl = (suffix: string) => {
    const url = buildSlugUrl(suffix);
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrl(`slug-${suffix}`);
    toast.success('Webhook URL copied');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Available paths from received payload
  const availablePaths = useMemo(() => {
    if (!liveTest.receivedPayload) return [];
    return extractJsonPaths(liveTest.receivedPayload);
  }, [liveTest.receivedPayload]);

  const handleCopyUrl = (webhookId: string) => {
    const def = WEBHOOK_DEFINITIONS.find(d => d.id === webhookId);
    // Prefer slug-based URL when available
    const url = clientSlug
      ? `${functionsBase}/${clientSlug}-${def?.endpointSuffix || webhookId}`
      : `${baseUrl}/${def?.endpointSuffix || webhookId}`;
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

  const handleCustomFieldAdd = (webhookId: string) => {
    const currentMappings = localMappings[webhookId] || savedMappings[webhookId] || {};
    const customFields = currentMappings.customFields || [];
    setLocalMappings(prev => ({
      ...prev,
      [webhookId]: {
        ...currentMappings,
        customFields: [...customFields, { name: '', path: '' }],
      },
    }));
  };

  const handleCustomFieldChange = (webhookId: string, index: number, field: 'name' | 'path', value: string) => {
    const currentMappings = localMappings[webhookId] || savedMappings[webhookId] || {};
    const customFields = [...(currentMappings.customFields || [])];
    customFields[index] = { ...customFields[index], [field]: value };
    setLocalMappings(prev => ({
      ...prev,
      [webhookId]: {
        ...currentMappings,
        customFields,
      },
    }));
  };

  const handleCustomFieldRemove = (webhookId: string, index: number) => {
    const currentMappings = localMappings[webhookId] || savedMappings[webhookId] || {};
    const customFields = [...(currentMappings.customFields || [])];
    customFields.splice(index, 1);
    setLocalMappings(prev => ({
      ...prev,
      [webhookId]: {
        ...currentMappings,
        customFields,
      },
    }));
  };

  const handleSaveMappings = async () => {
    const mergedMappings = { ...savedMappings, ...localMappings };
    await updateMappings.mutateAsync({ clientId, mappings: mergedMappings });
    setLocalMappings({});
  };

  const handleStartLiveTest = (webhookId: string) => {
    setTestingWebhookId(webhookId);
    setExpandedWebhook(webhookId);
    liveTest.startListening();
  };

  const handleStopTest = () => {
    liveTest.stopListening();
    setTestingWebhookId(null);
  };

  const handleClearReceivedPayload = () => {
    liveTest.clearPayload();
  };

  const getMappingValue = (webhookId: string, fieldKey: string): string => {
    return (localMappings[webhookId]?.[fieldKey as keyof WebhookMapping] as string) || 
           (savedMappings[webhookId]?.[fieldKey as keyof WebhookMapping] as string) || '';
  };

  const getCustomFields = (webhookId: string): Array<{ name: string; path: string }> => {
    return localMappings[webhookId]?.customFields || 
           savedMappings[webhookId]?.customFields || [];
  };

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Simple Instructions */}
      <div className="border-2 border-border p-4 space-y-3 bg-muted/20">
        <h4 className="font-medium">How Webhooks Work</h4>
        <p className="text-sm text-muted-foreground">
          Copy the webhook URL for each event type and paste it into your integration (GoHighLevel, Zapier, etc.). 
          No authentication required - just send JSON data to the URL and it will automatically be parsed and stored.
        </p>
      </div>

      {/* GHL Snapshot URLs (slug-based, zero-config) */}
      {slugBaseAvailable && (
        <div className="border-2 border-primary/40 bg-primary/5 p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                GHL Snapshot URLs
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Use these clean slug-based URLs in your GHL workflow snapshot. Adding a new client = just change the slug{' '}
                <code className="px-1 py-0.5 bg-muted rounded">{clientSlug}</code> to the new client's slug.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              {copiedAll ? <Check className="h-4 w-4 mr-2 text-chart-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy All as JSON
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {WEBHOOK_DEFINITIONS.map(def => {
              const url = buildSlugUrl(def.endpointSuffix);
              const copied = copiedUrl === `slug-${def.endpointSuffix}`;
              return (
                <div
                  key={def.id}
                  className="flex items-center gap-2 p-2 bg-background rounded border border-border"
                >
                  <Badge variant="secondary" className="text-[10px] shrink-0 uppercase">
                    {def.endpointSuffix}
                  </Badge>
                  <code className="flex-1 text-xs font-mono truncate text-muted-foreground" title={url}>
                    {url}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => handleCopySlugUrl(def.endpointSuffix)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-chart-2" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setShowLegacyUrls(v => !v)}
          >
            {showLegacyUrls ? 'Hide' : 'Show'} legacy UUID URLs
          </button>
        </div>
      )}

      {/* Live Test Status Banner */}
      {liveTest.isListening && (
        <div className="bg-primary/10 border-2 border-primary p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-5 w-5 text-primary animate-pulse" />
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              </div>
              <div>
                <p className="font-medium">Listening for webhook...</p>
                <p className="text-sm text-muted-foreground">
                  Send a <strong>{WEBHOOK_DEFINITIONS.find(d => d.id === testingWebhookId)?.label}</strong> webhook from GoHighLevel
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-lg px-3 py-1">
                {formatTime(liveTest.timeRemaining)}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleStopTest}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Received Payload Display & Mapping */}
      {liveTest.receivedPayload && testingWebhookId && (
        <div className="border-2 border-green-500 bg-green-50 dark:bg-green-950/20 p-4 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h4 className="font-medium text-green-700 dark:text-green-400">Webhook Received!</h4>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearReceivedPayload}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Payload Preview */}
            <div>
              <Label className="text-sm font-medium">Received Payload</Label>
              <ScrollArea className="h-64 mt-2">
                <pre className="p-3 bg-muted rounded text-xs overflow-auto">
                  {JSON.stringify(liveTest.receivedPayload, null, 2)}
                </pre>
              </ScrollArea>
            </div>

            {/* Field Mapper */}
            <div>
              <Label className="text-sm font-medium">Map Fields (Click to select)</Label>
              <ScrollArea className="h-64 mt-2">
                <div className="space-y-2 p-2">
                  {availablePaths.map(path => {
                    const value = getValueByPath(liveTest.receivedPayload, path);
                    const valuePreview = typeof value === 'object' 
                      ? '[Object]' 
                      : String(value).substring(0, 50);
                    
                    return (
                      <div
                        key={path}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm hover:bg-muted cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(path);
                          toast.info(`Copied: ${path}`);
                        }}
                      >
                        <code className="text-xs font-mono">{path}</code>
                        <span className="text-muted-foreground text-xs truncate max-w-32">
                          {valuePreview}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Endpoints */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Webhook Endpoints</h4>
            <p className="text-sm text-muted-foreground">
              Configure these webhooks in GoHighLevel to send data automatically
            </p>
          </div>
          <Button onClick={handleSaveMappings} disabled={updateMappings.isPending || Object.keys(localMappings).length === 0}>
            {updateMappings.isPending ? 'Saving...' : 'Save Mappings'}
          </Button>
        </div>

        <div className="space-y-3">
          {WEBHOOK_DEFINITIONS.map((def) => {
            const isExpanded = expandedWebhook === def.id;
            const hasMappings = def.mappingFields.length > 0 || def.supportsCustomFields;
            const isMapped = savedMappings[def.id] && Object.keys(savedMappings[def.id]).length > 0;
            const isTestingThis = testingWebhookId === def.id && liveTest.isListening;

            return (
              <Collapsible
                key={def.id}
                open={isExpanded}
                onOpenChange={() => setExpandedWebhook(isExpanded ? null : def.id)}
              >
                <div className={`border rounded-lg overflow-hidden transition-colors ${isTestingThis ? 'border-primary' : 'border-border'}`}>
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
                        variant={isTestingThis ? 'default' : 'outline'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isTestingThis) {
                            handleStopTest();
                          } else {
                            handleStartLiveTest(def.id);
                          }
                        }}
                        disabled={liveTest.isListening && !isTestingThis}
                      >
                        {isTestingThis ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Listening
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-1" />
                            Test
                          </>
                        )}
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
                    {clientSlug && (
                      <code className="text-xs text-muted-foreground break-all block">
                        {buildSlugUrl(def.endpointSuffix)}
                      </code>
                    )}
                    {(showLegacyUrls || !clientSlug) && (
                      <code className="text-[11px] text-muted-foreground/70 break-all block mt-1">
                        <span className="opacity-60">legacy:</span> {`${baseUrl}/${def.endpointSuffix}`}
                      </code>
                    )}
                  </div>

                  {/* Mapping Fields */}
                  {hasMappings && (
                    <CollapsibleContent>
                      <div className="p-3 border-t border-border space-y-4 bg-muted/10">
                        {/* Standard Fields by Group */}
                        {def.mappingFields.length > 0 && (
                          <>
                            {/* Group: Contact */}
                            {def.mappingFields.some(f => f.group === 'contact') && (
                              <div className="space-y-2">
                                <h5 className="text-sm font-medium flex items-center gap-2">
                                  Contact Information
                                </h5>
                                <div className="grid grid-cols-3 gap-3">
                                  {def.mappingFields.filter(f => f.group === 'contact').map((field) => (
                                    <div key={field.key} className="space-y-1">
                                      <Label className="text-xs">{field.label}</Label>
                                      <Input
                                        value={getMappingValue(def.id, field.key)}
                                        onChange={(e) => handleMappingChange(def.id, field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="font-mono text-xs h-8"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Group: UTM */}
                            {def.mappingFields.some(f => f.group === 'utm') && (
                              <div className="space-y-2">
                                <h5 className="text-sm font-medium flex items-center gap-2">
                                  UTM Parameters
                                </h5>
                                <div className="grid grid-cols-5 gap-2">
                                  {def.mappingFields.filter(f => f.group === 'utm').map((field) => (
                                    <div key={field.key} className="space-y-1">
                                      <Label className="text-xs">{field.label.replace('UTM ', '')}</Label>
                                      <Input
                                        value={getMappingValue(def.id, field.key)}
                                        onChange={(e) => handleMappingChange(def.id, field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="font-mono text-xs h-8"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Group: Value */}
                            {def.mappingFields.some(f => f.group === 'value') && (
                              <div className="space-y-2">
                                <h5 className="text-sm font-medium flex items-center gap-2">
                                  Value Fields
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                  {def.mappingFields.filter(f => f.group === 'value').map((field) => (
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
                                </div>
                              </div>
                            )}

                            {/* Group: Other */}
                            {def.mappingFields.some(f => f.group === 'other' || !f.group) && (
                              <div className="grid grid-cols-2 gap-3">
                                {def.mappingFields.filter(f => f.group === 'other' || !f.group).map((field) => (
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
                              </div>
                            )}
                          </>
                        )}

                        {/* Custom Fields Section */}
                        {def.supportsCustomFields && (
                          <div className="space-y-3">
                            <Separator />
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium">Custom Question Fields</h5>
                              <Button variant="outline" size="sm" onClick={() => handleCustomFieldAdd(def.id)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add Field
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Map custom form questions or fields from your webhook payload
                            </p>
                            
                            {getCustomFields(def.id).map((cf, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Input
                                  value={cf.name}
                                  onChange={(e) => handleCustomFieldChange(def.id, idx, 'name', e.target.value)}
                                  placeholder="Field Name (e.g., 'Investment Amount')"
                                  className="flex-1 text-sm"
                                />
                                <Input
                                  value={cf.path}
                                  onChange={(e) => handleCustomFieldChange(def.id, idx, 'path', e.target.value)}
                                  placeholder="JSON Path (e.g., 'contact.custom_fields.amount')"
                                  className="flex-1 font-mono text-xs"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCustomFieldRemove(def.id, idx)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sample Payload */}
                        <div className="mt-3">
                          <Label className="text-xs">Sample Payload Structure</Label>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
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
        </div>

        {logsLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading logs...</div>
        ) : webhookLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No webhook activity yet</p>
            <p className="text-xs mt-1">Click "Test" on any webhook above to start listening</p>
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
