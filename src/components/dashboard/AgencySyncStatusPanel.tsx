import { useState } from 'react';
import { Client } from '@/hooks/useClients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Activity, Settings2, Calendar, Users, TrendingUp, Save } from 'lucide-react';
import { formatDistanceToNow, differenceInDays, parseISO, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ClientSyncInfo {
  id: string;
  name: string;
  status: string;
  metaAdAccountId: string | null;
  metaAccessToken: string | null;
  metaLastSync: string | null;
  metaSyncEnabled: boolean;
  ghlLocationId: string | null;
  ghlApiKey: string | null;
  ghlSyncStatus: string | null;
  ghlSyncError: string | null;
  lastGhlSyncAt: string | null;
  ghlLastContactsSync: string | null;
  ghlLastCallsSync: string | null;
  hubspotPortalId: string | null;
  hubspotSyncStatus: string | null;
  hubspotSyncError: string | null;
  lastHubspotSyncAt: string | null;
  hubspotLastContactsSync: string | null;
  hubspotLastDealsSync: string | null;
  fundedPipelineId: string | null;
  fundedStageIds: string[] | null;
  committedStageIds: string[] | null;
  trackedCalendarIds: string[] | null;
}

interface AgencySyncStatusPanelProps {
  clients: Client[];
  clientFullSettings: Record<string, any>;
}

type SyncStatus = 'healthy' | 'stale' | 'error' | 'not_configured';

function getSyncStatusFromDate(lastSync: string | null, hasCredentials: boolean): SyncStatus {
  if (!hasCredentials) return 'not_configured';
  if (!lastSync) return 'not_configured';
  const hours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
  if (hours <= 6) return 'healthy';
  if (hours <= 24) return 'stale';
  return 'error';
}

function StatusIcon({ status }: { status: SyncStatus }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle className="h-4 w-4 text-chart-2" />;
    case 'stale':
      return <Clock className="h-4 w-4 text-chart-4" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'not_configured':
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function TimeAgo({ date, fallback = 'Never' }: { date: string | null; fallback?: string }) {
  if (!date) return <span className="text-muted-foreground text-xs">{fallback}</span>;
  return (
    <span className="text-xs">
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  );
}

/** Calculate how many days in a range have NO sync data */
function getMissedDays(lastSync: string | null, dayLookback: number): number {
  if (!lastSync) return dayLookback;
  const lastDate = parseISO(lastSync);
  const daysSince = differenceInDays(new Date(), lastDate);
  return Math.max(0, daysSince - 1); // -1 because sync day itself counts
}

export function AgencySyncStatusPanel({ clients, clientFullSettings }: AgencySyncStatusPanelProps) {
  const [syncingMeta, setSyncingMeta] = useState<Set<string>>(new Set());
  const [syncingLeads, setSyncingLeads] = useState<Set<string>>(new Set());
  const [syncingCalendar, setSyncingCalendar] = useState<Set<string>>(new Set());
  const [syncingPipeline, setSyncingPipeline] = useState<Set<string>>(new Set());
  const [settingsClient, setSettingsClient] = useState<ClientSyncInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Settings form state
  const [editMetaAccountId, setEditMetaAccountId] = useState('');
  const [editMetaToken, setEditMetaToken] = useState('');
  const [editSyncDayLookback, setEditSyncDayLookback] = useState('365');
  const [editSyncRhythm, setEditSyncRhythm] = useState('4h');
  const [saving, setSaving] = useState(false);
  
  const queryClient = useQueryClient();

  const clientSyncData: ClientSyncInfo[] = clients
    .filter(c => c.status === 'active' || c.status === 'onboarding')
    .map(c => {
      const settings = clientFullSettings[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        metaAdAccountId: (c as any).meta_ad_account_id || null,
        metaAccessToken: (c as any).meta_access_token || null,
        metaLastSync: settings.meta_ads_last_sync || null,
        metaSyncEnabled: settings.meta_ads_sync_enabled || false,
        ghlLocationId: c.ghl_location_id,
        ghlApiKey: c.ghl_api_key,
        ghlSyncStatus: c.ghl_sync_status,
        ghlSyncError: c.ghl_sync_error,
        lastGhlSyncAt: c.last_ghl_sync_at,
        ghlLastContactsSync: settings.ghl_last_contacts_sync || null,
        ghlLastCallsSync: settings.ghl_last_calls_sync || null,
        hubspotPortalId: c.hubspot_portal_id,
        hubspotSyncStatus: c.hubspot_sync_status,
        hubspotSyncError: c.hubspot_sync_error,
        lastHubspotSyncAt: c.last_hubspot_sync_at,
        hubspotLastContactsSync: settings.hubspot_last_contacts_sync || null,
        hubspotLastDealsSync: settings.hubspot_last_deals_sync || null,
        fundedPipelineId: settings.funded_pipeline_id || null,
        fundedStageIds: settings.funded_stage_ids || null,
        committedStageIds: settings.committed_stage_ids || null,
        trackedCalendarIds: settings.tracked_calendar_ids || null,
      };
    });

  // ── Individual Sync Handlers ──

  const handleMetaSync = async (clientId: string) => {
    setSyncingMeta(prev => new Set(prev).add(clientId));
    try {
      const { error } = await supabase.functions.invoke('sync-meta-ads', {
        body: { clientId },
      });
      if (error) throw error;
      toast.success('Meta Ads sync triggered');
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    } catch (err) {
      toast.error(`Meta sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncingMeta(prev => { const n = new Set(prev); n.delete(clientId); return n; });
    }
  };

  const handleLeadsSync = async (clientId: string) => {
    setSyncingLeads(prev => new Set(prev).add(clientId));
    try {
      const client = clientSyncData.find(c => c.id === clientId);
      if (client?.hubspotPortalId) {
        await supabase.functions.invoke('sync-hubspot-contacts', { body: { clientId } });
      } else {
        await supabase.functions.invoke('sync-ghl-contacts', { body: { client_id: clientId, mode: 'contacts' } });
      }
      toast.success('Leads sync triggered');
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(`Leads sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncingLeads(prev => { const n = new Set(prev); n.delete(clientId); return n; });
    }
  };

  const handleCalendarSync = async (clientId: string) => {
    setSyncingCalendar(prev => new Set(prev).add(clientId));
    try {
      await supabase.functions.invoke('sync-calendar-appointments', { body: { clientId } });
      toast.success('Calendar sync triggered');
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    } catch (err) {
      toast.error(`Calendar sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncingCalendar(prev => { const n = new Set(prev); n.delete(clientId); return n; });
    }
  };

  const handlePipelineSync = async (clientId: string) => {
    setSyncingPipeline(prev => new Set(prev).add(clientId));
    try {
      await supabase.functions.invoke('sync-ghl-pipelines', { body: { clientId } });
      toast.success('Pipeline sync triggered');
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    } catch (err) {
      toast.error(`Pipeline sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncingPipeline(prev => { const n = new Set(prev); n.delete(clientId); return n; });
    }
  };

  // ── Settings Modal ──

  const openSettings = (c: ClientSyncInfo) => {
    setSettingsClient(c);
    setEditMetaAccountId(c.metaAdAccountId || '');
    setEditMetaToken(c.metaAccessToken ? '••••••••' : '');
    setEditSyncDayLookback('365');
    setEditSyncRhythm('4h');
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!settingsClient) return;
    setSaving(true);
    try {
      // Update Meta credentials on clients table
      const updates: Record<string, any> = {};
      if (editMetaAccountId !== (settingsClient.metaAdAccountId || '')) {
        updates.meta_ad_account_id = editMetaAccountId || null;
      }
      if (editMetaToken && editMetaToken !== '••••••••') {
        updates.meta_access_token = editMetaToken;
      }
      
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('clients').update(updates).eq('id', settingsClient.id);
        if (error) throw error;
      }

      // Update sync settings on client_settings table
      await supabase.from('client_settings').upsert({
        client_id: settingsClient.id,
        meta_ads_sync_enabled: true,
      }, { onConflict: 'client_id' });

      toast.success('Sync settings saved');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      setSettingsOpen(false);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Sync All (full master sync) ──
  const handleMasterSync = async (clientId: string) => {
    try {
      await supabase.functions.invoke('sync-ghl-contacts', { body: { client_id: clientId, mode: 'master_sync' } });
      toast.success('Master sync triggered (background)');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    } catch (err) {
      toast.error('Master sync failed');
    }
  };

  const getGhlStatus = (c: ClientSyncInfo): SyncStatus => {
    if (c.hubspotPortalId) return getSyncStatusFromDate(c.lastHubspotSyncAt, !!c.hubspotPortalId);
    if (c.ghlSyncStatus === 'error') return 'error';
    return getSyncStatusFromDate(c.lastGhlSyncAt, !!(c.ghlLocationId && c.ghlApiKey));
  };

  const getMetaStatus = (c: ClientSyncInfo): SyncStatus => {
    return getSyncStatusFromDate(c.metaLastSync, !!(c.metaAdAccountId || c.metaAccessToken));
  };

  if (clientSyncData.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">API Sync Status</CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3 w-3 text-chart-2" /> Healthy
                <Clock className="h-3 w-3 text-chart-4 ml-2" /> Stale
                <XCircle className="h-3 w-3 text-destructive ml-2" /> Error
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Client</TableHead>
                    <TableHead className="text-center">Meta Ads</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Calendar</TableHead>
                    <TableHead className="text-center">Pipeline</TableHead>
                    <TableHead className="text-center">Days Gap</TableHead>
                    <TableHead className="text-center w-[80px]">Settings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientSyncData.map((c) => {
                    const metaStatus = getMetaStatus(c);
                    const crmSource = c.hubspotPortalId ? 'hubspot' : 'ghl';
                    const crmStatus = getGhlStatus(c);
                    const contactsSync = crmSource === 'hubspot' ? c.hubspotLastContactsSync : c.ghlLastContactsSync;
                    const calendarStatus = c.trackedCalendarIds && c.trackedCalendarIds.length > 0
                      ? getSyncStatusFromDate(c.ghlLastCallsSync, true)
                      : 'not_configured' as SyncStatus;
                    const pipelineStatus = c.fundedPipelineId
                      ? getSyncStatusFromDate(c.lastGhlSyncAt || c.lastHubspotSyncAt, true)
                      : 'not_configured' as SyncStatus;

                    // Calculate "days gap" — the worst gap across all configured sources
                    const gaps: number[] = [];
                    if (metaStatus !== 'not_configured') gaps.push(getMissedDays(c.metaLastSync, 30));
                    if (crmStatus !== 'not_configured') gaps.push(getMissedDays(contactsSync, 30));
                    if (calendarStatus !== 'not_configured') gaps.push(getMissedDays(c.ghlLastCallsSync, 30));
                    if (pipelineStatus !== 'not_configured') gaps.push(getMissedDays(c.lastGhlSyncAt || c.lastHubspotSyncAt, 30));
                    const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {c.status}
                            </Badge>
                            <span className="truncate max-w-[100px]">{c.name}</span>
                          </div>
                        </TableCell>

                        {/* Meta Ads - with individual sync */}
                        <TableCell className="text-center py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <StatusIcon status={metaStatus} />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    disabled={metaStatus === 'not_configured' || syncingMeta.has(c.id)}
                                    onClick={() => handleMetaSync(c.id)}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${syncingMeta.has(c.id) ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync Meta Ads</TooltipContent>
                              </Tooltip>
                            </div>
                            <TimeAgo date={c.metaLastSync} />
                          </div>
                        </TableCell>

                        {/* Leads - with individual sync */}
                        <TableCell className="text-center py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <StatusIcon status={crmStatus} />
                              <span className="text-[10px] text-muted-foreground uppercase">{crmSource}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    disabled={crmStatus === 'not_configured' || syncingLeads.has(c.id)}
                                    onClick={() => handleLeadsSync(c.id)}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${syncingLeads.has(c.id) ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync Leads</TooltipContent>
                              </Tooltip>
                            </div>
                            <TimeAgo date={contactsSync} />
                          </div>
                        </TableCell>

                        {/* Calendar - with individual sync */}
                        <TableCell className="text-center py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <StatusIcon status={calendarStatus} />
                              {calendarStatus !== 'not_configured' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      disabled={syncingCalendar.has(c.id)}
                                      onClick={() => handleCalendarSync(c.id)}
                                    >
                                      <RefreshCw className={`h-3 w-3 ${syncingCalendar.has(c.id) ? 'animate-spin' : ''}`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Sync Calendar (Booked, Showed, No Show)</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {calendarStatus !== 'not_configured' ? (
                              <TimeAgo date={c.ghlLastCallsSync} />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No calendars</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Pipeline (Committed / Funded) - with individual sync */}
                        <TableCell className="text-center py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <StatusIcon status={pipelineStatus} />
                              {pipelineStatus !== 'not_configured' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      disabled={syncingPipeline.has(c.id)}
                                      onClick={() => handlePipelineSync(c.id)}
                                    >
                                      <RefreshCw className={`h-3 w-3 ${syncingPipeline.has(c.id) ? 'animate-spin' : ''}`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Sync Pipeline (Commitments & Funded)</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {pipelineStatus !== 'not_configured' ? (
                              <div className="flex gap-1">
                                {(c.committedStageIds?.length || 0) > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">C:{c.committedStageIds?.length}</Badge>
                                )}
                                {(c.fundedStageIds?.length || 0) > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">F:{c.fundedStageIds?.length}</Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No pipeline</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Days Gap indicator */}
                        <TableCell className="text-center py-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant={maxGap === 0 ? 'default' : maxGap <= 1 ? 'secondary' : 'destructive'}
                                className="text-xs"
                              >
                                {maxGap === 0 ? '✓' : `${maxGap}d`}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {maxGap === 0 
                                ? 'All syncs are current — no missed days' 
                                : `Largest sync gap: ${maxGap} day(s) behind. Click settings to configure sync schedule.`}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Settings */}
                        <TableCell className="text-center py-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openSettings(c)}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sync Settings & Meta Credentials</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Sync Settings — {settingsClient?.name}
            </DialogTitle>
            <DialogDescription>
              Configure API credentials, sync schedule, and day lookback for accurate data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Meta Ads Credentials */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Meta Ads Configuration
              </h4>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">Ad Account ID</Label>
                  <Input
                    placeholder="act_123456789 or 123456789"
                    value={editMetaAccountId}
                    onChange={(e) => setEditMetaAccountId(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Access Token</Label>
                  <Input
                    type="password"
                    placeholder="Enter Meta access token"
                    value={editMetaToken}
                    onChange={(e) => setEditMetaToken(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Leave as-is to keep existing token</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Sync Rhythm */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Sync Schedule
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Sync Frequency</Label>
                  <Select value={editSyncRhythm} onValueChange={setEditSyncRhythm}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Every 1 hour</SelectItem>
                      <SelectItem value="2h">Every 2 hours</SelectItem>
                      <SelectItem value="4h">Every 4 hours</SelectItem>
                      <SelectItem value="6h">Every 6 hours</SelectItem>
                      <SelectItem value="12h">Every 12 hours</SelectItem>
                      <SelectItem value="24h">Once daily</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    How often automated syncs run
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Day Lookback</Label>
                  <Select value={editSyncDayLookback} onValueChange={setEditSyncDayLookback}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">365 days (full year)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Ensures no days are missed
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Quick Sync Actions */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Quick Sync Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" size="sm" 
                  onClick={() => { handleMetaSync(settingsClient!.id); }}
                  disabled={!settingsClient?.metaAdAccountId || syncingMeta.has(settingsClient?.id || '')}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${syncingMeta.has(settingsClient?.id || '') ? 'animate-spin' : ''}`} />
                  Meta Ads
                </Button>
                <Button 
                  variant="outline" size="sm"
                  onClick={() => { handleLeadsSync(settingsClient!.id); }}
                  disabled={syncingLeads.has(settingsClient?.id || '')}
                >
                  <Users className="h-3 w-3 mr-1" />
                  Leads
                </Button>
                <Button 
                  variant="outline" size="sm"
                  onClick={() => { handleCalendarSync(settingsClient!.id); }}
                  disabled={syncingCalendar.has(settingsClient?.id || '')}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  Calendar
                </Button>
                <Button 
                  variant="outline" size="sm"
                  onClick={() => { handlePipelineSync(settingsClient!.id); }}
                  disabled={syncingPipeline.has(settingsClient?.id || '')}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Pipeline
                </Button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => { handleMasterSync(settingsClient!.id); }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Full Master Sync (All Data)
              </Button>
            </div>

            <Separator />

            {/* Sync Status Summary */}
            {settingsClient && (
              <div className="bg-muted/50 rounded-md p-3 text-xs space-y-1">
                <p><strong>Meta Last Sync:</strong> {settingsClient.metaLastSync ? format(parseISO(settingsClient.metaLastSync), 'PPpp') : 'Never'}</p>
                <p><strong>Leads Last Sync:</strong> {(settingsClient.ghlLastContactsSync || settingsClient.hubspotLastContactsSync) ? format(parseISO(settingsClient.ghlLastContactsSync || settingsClient.hubspotLastContactsSync!), 'PPpp') : 'Never'}</p>
                <p><strong>Calendar Last Sync:</strong> {settingsClient.ghlLastCallsSync ? format(parseISO(settingsClient.ghlLastCallsSync), 'PPpp') : 'Never'}</p>
                <p><strong>Pipeline Last Sync:</strong> {(settingsClient.lastGhlSyncAt || settingsClient.lastHubspotSyncAt) ? format(parseISO(settingsClient.lastGhlSyncAt || settingsClient.lastHubspotSyncAt!), 'PPpp') : 'Never'}</p>
              </div>
            )}

            <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
