import { useState, useEffect } from 'react';
import { Client } from '@/hooks/useClients';
import { useClientSettings, useUpdateClientSettings, ClientSettings } from '@/hooks/useClientSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { WebhookSettingsTab } from './WebhookSettingsTab';
import { EmailParsingTab } from './EmailParsingTab';
import { PodAssignmentSection } from './PodAssignmentSection';
import { DollarSign, Target, Plug, Loader2, RefreshCw, CheckCircle, XCircle, Users, Lock, Eye, EyeOff } from 'lucide-react';

interface ClientSettingsModalProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientSettingsModal({ client, open, onOpenChange }: ClientSettingsModalProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useClientSettings(client?.id);
  const updateSettings = useUpdateClientSettings();
  
  const [saving, setSaving] = useState(false);
  
  // Alert settings
  const [cplAlert, setCplAlert] = useState(false);
  const [cplThreshold, setCplThreshold] = useState('150');
  const [costPerCallAlert, setCostPerCallAlert] = useState(false);
  const [costPerCallThreshold, setCostPerCallThreshold] = useState('400');
  const [slackWebhook, setSlackWebhook] = useState('');

  // KPI Thresholds
  const [cplYellow, setCplYellow] = useState('50');
  const [cplRed, setCplRed] = useState('100');
  const [costPerCallYellow, setCostPerCallYellow] = useState('100');
  const [costPerCallRed, setCostPerCallRed] = useState('200');
  const [costPerShowYellow, setCostPerShowYellow] = useState('150');
  const [costPerShowRed, setCostPerShowRed] = useState('300');
  const [costPerInvestorYellow, setCostPerInvestorYellow] = useState('500');
  const [costPerInvestorRed, setCostPerInvestorRed] = useState('1000');
  const [costOfCapitalYellow, setCostOfCapitalYellow] = useState('5');
  const [costOfCapitalRed, setCostOfCapitalRed] = useState('10');
  const [fundedInvestorLabel, setFundedInvestorLabel] = useState('Funded Investors');
  const [businessManagerUrl, setBusinessManagerUrl] = useState('');

  // New KPI fields
  const [mrr, setMrr] = useState('0');
  const [adSpendFeeThreshold, setAdSpendFeeThreshold] = useState('30000');
  const [adSpendFeePercent, setAdSpendFeePercent] = useState('10');
  const [monthlyAdSpendTarget, setMonthlyAdSpendTarget] = useState('');
  const [dailyAdSpendTarget, setDailyAdSpendTarget] = useState('');
  const [totalRaiseAmount, setTotalRaiseAmount] = useState('0');
  const [adSpendInputMode, setAdSpendInputMode] = useState<'monthly' | 'daily'>('monthly');

  // GHL Integration state
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [ghlApiKey, setGhlApiKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  // Public link password state
  const [publicLinkPassword, setPublicLinkPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Load settings when available
  useEffect(() => {
    if (settings) {
      setCplYellow(String(settings.cpl_threshold_yellow));
      setCplRed(String(settings.cpl_threshold_red));
      setCostPerCallYellow(String(settings.cost_per_call_threshold_yellow));
      setCostPerCallRed(String(settings.cost_per_call_threshold_red));
      setCostPerShowYellow(String(settings.cost_per_show_threshold_yellow));
      setCostPerShowRed(String(settings.cost_per_show_threshold_red));
      setCostPerInvestorYellow(String(settings.cost_per_investor_threshold_yellow));
      setCostPerInvestorRed(String(settings.cost_per_investor_threshold_red));
      setCostOfCapitalYellow(String(settings.cost_of_capital_threshold_yellow));
      setCostOfCapitalRed(String(settings.cost_of_capital_threshold_red));
      setFundedInvestorLabel(settings.funded_investor_label);
      setMrr(String(settings.mrr || 0));
      setAdSpendFeeThreshold(String(settings.ad_spend_fee_threshold || 30000));
      setAdSpendFeePercent(String(settings.ad_spend_fee_percent || 10));
      setTotalRaiseAmount(String(settings.total_raise_amount || 0));
      
      // Determine which mode was used based on which value is set
      if (settings.daily_ad_spend_target && settings.daily_ad_spend_target > 0) {
        setAdSpendInputMode('daily');
        setDailyAdSpendTarget(String(settings.daily_ad_spend_target));
        setMonthlyAdSpendTarget('');
      } else {
        setAdSpendInputMode('monthly');
        setMonthlyAdSpendTarget(String(settings.monthly_ad_spend_target || 0));
        setDailyAdSpendTarget('');
      }
    }
    if (settings?.public_link_password !== undefined) {
      setPublicLinkPassword(settings.public_link_password || '');
    }
  }, [settings]);

  // Load client business manager URL and GHL credentials
  useEffect(() => {
    if (client?.business_manager_url) {
      setBusinessManagerUrl(client.business_manager_url);
    }
    if (client?.ghl_location_id) {
      setGhlLocationId(client.ghl_location_id);
    }
    if (client?.ghl_api_key) {
      setGhlApiKey(client.ghl_api_key);
    }
    // Determine connection status based on saved credentials
    if (client?.ghl_location_id && client?.ghl_api_key) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('unknown');
    }
  }, [client]);

  // Calculate projected annual revenue
  const projectedAnnual = parseFloat(mrr) * 12;
  
  // Calculate the auto-filled value based on input mode
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const calculatedMonthly = adSpendInputMode === 'daily' && dailyAdSpendTarget 
    ? parseFloat(dailyAdSpendTarget) * daysInMonth 
    : 0;
  const calculatedDaily = adSpendInputMode === 'monthly' && monthlyAdSpendTarget 
    ? parseFloat(monthlyAdSpendTarget) / daysInMonth 
    : 0;
  
  // Get effective monthly target for revenue estimate
  const effectiveMonthlyTarget = adSpendInputMode === 'daily' 
    ? calculatedMonthly 
    : parseFloat(monthlyAdSpendTarget) || 0;
  
  // Calculate estimated revenue for the month
  const estimatedMonthlyRevenue = (() => {
    let total = parseFloat(mrr) || 0;
    const threshold = parseFloat(adSpendFeeThreshold) || 30000;
    const percent = parseFloat(adSpendFeePercent) || 10;
    if (effectiveMonthlyTarget > threshold) {
      total += (effectiveMonthlyTarget - threshold) * (percent / 100);
    }
    return total;
  })();

  const handleSave = async () => {
    if (!client) return;
    
    setSaving(true);
    try {
      // Save KPI thresholds
      await updateSettings.mutateAsync({
        client_id: client.id,
        cpl_threshold_yellow: parseFloat(cplYellow),
        cpl_threshold_red: parseFloat(cplRed),
        cost_per_call_threshold_yellow: parseFloat(costPerCallYellow),
        cost_per_call_threshold_red: parseFloat(costPerCallRed),
        cost_per_show_threshold_yellow: parseFloat(costPerShowYellow),
        cost_per_show_threshold_red: parseFloat(costPerShowRed),
        cost_per_investor_threshold_yellow: parseFloat(costPerInvestorYellow),
        cost_per_investor_threshold_red: parseFloat(costPerInvestorRed),
        cost_of_capital_threshold_yellow: parseFloat(costOfCapitalYellow),
        cost_of_capital_threshold_red: parseFloat(costOfCapitalRed),
        funded_investor_label: fundedInvestorLabel,
        mrr: parseFloat(mrr) || 0,
        ad_spend_fee_threshold: parseFloat(adSpendFeeThreshold) || 30000,
        ad_spend_fee_percent: parseFloat(adSpendFeePercent) || 10,
        // Store whichever mode the user selected
        monthly_ad_spend_target: adSpendInputMode === 'monthly' ? (parseFloat(monthlyAdSpendTarget) || 0) : 0,
        daily_ad_spend_target: adSpendInputMode === 'daily' ? (parseFloat(dailyAdSpendTarget) || null) : null,
        total_raise_amount: parseFloat(totalRaiseAmount) || 0,
        public_link_password: publicLinkPassword.trim() || null,
      });

      // Save alert configs if slack webhook provided
      if (slackWebhook) {
        if (cplAlert) {
          await supabase.from('alert_configs').upsert({
            client_id: client.id,
            metric: 'cost_per_lead',
            threshold: parseFloat(cplThreshold),
            operator: 'above',
            slack_webhook_url: slackWebhook,
            enabled: true,
          }, { onConflict: 'client_id,metric' });
        }
        if (costPerCallAlert) {
          await supabase.from('alert_configs').upsert({
            client_id: client.id,
            metric: 'cost_per_call',
            threshold: parseFloat(costPerCallThreshold),
            operator: 'above',
            slack_webhook_url: slackWebhook,
            enabled: true,
          }, { onConflict: 'client_id,metric' });
        }
      }

      // Save business manager URL and GHL credentials to client
      const clientUpdates: Record<string, string | null> = {};
      
      if (businessManagerUrl !== (client.business_manager_url || '')) {
        clientUpdates.business_manager_url = businessManagerUrl || null;
      }
      if (ghlLocationId !== (client.ghl_location_id || '')) {
        clientUpdates.ghl_location_id = ghlLocationId || null;
      }
      if (ghlApiKey !== (client.ghl_api_key || '')) {
        clientUpdates.ghl_api_key = ghlApiKey || null;
      }

      if (Object.keys(clientUpdates).length > 0) {
        await supabase
          .from('clients')
          .update(clientUpdates)
          .eq('id', client.id);
      }

      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', client.id] });
      queryClient.invalidateQueries({ queryKey: ['all-client-mrr'] });
      queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
      toast.success('Settings saved successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!ghlLocationId || !ghlApiKey) {
      toast.error('Please enter both Location ID and Private Integration Key');
      return;
    }
    setTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { 
          client_id: client?.id,
          testOnly: true,
          apiKey: ghlApiKey,
          locationId: ghlLocationId 
        }
      });
      if (error) throw error;
      setConnectionStatus('connected');
      toast.success('Connection successful! GHL credentials are valid.');
    } catch (error) {
      console.error('GHL connection test failed:', error);
      setConnectionStatus('error');
      toast.error('Connection failed - please check your credentials');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSyncContacts = async () => {
    if (!client?.ghl_location_id || !client?.ghl_api_key) {
      toast.error('Please save GHL credentials first');
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', {
        body: { client_id: client.id }
      });
      if (error) throw error;
      const created = data?.results?.[0]?.created || 0;
      const updated = data?.results?.[0]?.updated || 0;
      toast.success(`Synced ${created + updated} contacts (${created} new, ${updated} updated)`);
      queryClient.invalidateQueries({ queryKey: ['leads', client.id] });
    } catch (error) {
      console.error('GHL sync failed:', error);
      toast.error('Sync failed - please try again');
    } finally {
      setSyncing(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-2 border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Client Settings - {client.name}</DialogTitle>
          <DialogDescription>
            Configure webhooks, KPI targets, and thresholds for this client
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="kpis" className="mt-4">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="email-parsing">Email</TabsTrigger>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="space-y-4 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Assigned Pods
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Select which team pods work on this client
                </p>
              </div>
              <PodAssignmentSection clientId={client.id} />
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Public Link Password
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Protect the public shareable link with a password. Leave empty for no password protection.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="publicLinkPassword">Password</Label>
                <div className="relative">
                  <Input
                    id="publicLinkPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={publicLinkPassword}
                    onChange={(e) => setPublicLinkPassword(e.target.value)}
                    placeholder="Enter password for public link..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {publicLinkPassword ? 'Password protection is enabled' : 'No password protection - link is publicly accessible'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="kpis" className="space-y-4 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Revenue Settings
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Monthly retainer and ad spend fee configuration
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mrr">Monthly MRR ($)</Label>
                  <Input
                    id="mrr"
                    type="number"
                    value={mrr}
                    onChange={(e) => setMrr(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Projected Annual</Label>
                  <div className="h-10 flex items-center px-3 border-2 border-border bg-muted/50 text-lg font-semibold text-chart-2">
                    ${projectedAnnual.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adSpendFeeThreshold">Ad Spend Fee Threshold ($)</Label>
                  <Input
                    id="adSpendFeeThreshold"
                    type="number"
                    value={adSpendFeeThreshold}
                    onChange={(e) => setAdSpendFeeThreshold(e.target.value)}
                    placeholder="30000"
                  />
                  <p className="text-xs text-muted-foreground">Fee applies above this amount</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adSpendFeePercent">Ad Spend Fee (%)</Label>
                  <Input
                    id="adSpendFeePercent"
                    type="number"
                    value={adSpendFeePercent}
                    onChange={(e) => setAdSpendFeePercent(e.target.value)}
                    placeholder="10"
                  />
                  <p className="text-xs text-muted-foreground">Percentage charged on excess</p>
                </div>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Ad Spend Targets
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter either daily or monthly target - the other will auto-calculate
                </p>
              </div>
              
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  variant={adSpendInputMode === 'monthly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setAdSpendInputMode('monthly');
                    setDailyAdSpendTarget('');
                  }}
                >
                  Monthly Target
                </Button>
                <Button
                  type="button"
                  variant={adSpendInputMode === 'daily' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setAdSpendInputMode('daily');
                    setMonthlyAdSpendTarget('');
                  }}
                >
                  Daily Target
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {adSpendInputMode === 'monthly' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyAdSpendTarget">Monthly Ad Spend Target ($)</Label>
                      <Input
                        id="monthlyAdSpendTarget"
                        type="number"
                        value={monthlyAdSpendTarget}
                        onChange={(e) => setMonthlyAdSpendTarget(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Daily Target (auto-calculated)</Label>
                      <div className="h-10 flex items-center px-3 border-2 border-border bg-muted/50 font-mono">
                        ${calculatedDaily.toFixed(2)}/day
                      </div>
                      <p className="text-xs text-muted-foreground">{daysInMonth} days this month</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="dailyAdSpendTarget">Daily Ad Spend Target ($)</Label>
                      <Input
                        id="dailyAdSpendTarget"
                        type="number"
                        value={dailyAdSpendTarget}
                        onChange={(e) => setDailyAdSpendTarget(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly Target (auto-calculated)</Label>
                      <div className="h-10 flex items-center px-3 border-2 border-border bg-muted/50 font-mono">
                        ${calculatedMonthly.toLocaleString()}/month
                      </div>
                      <p className="text-xs text-muted-foreground">{daysInMonth} days this month</p>
                    </div>
                  </>
                )}
              </div>
              
              <div className="mt-4 p-3 border-2 border-border bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Est. Monthly Revenue</span>
                  <span className="text-lg font-bold text-chart-2">
                    ${estimatedMonthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  MRR + ad spend fee (if above ${parseFloat(adSpendFeeThreshold).toLocaleString()} threshold)
                </p>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Fundraising Goal (All-Time)
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Total capital raise target - not affected by date range
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="totalRaiseAmount">Total Raise Amount ($)</Label>
                <Input
                  id="totalRaiseAmount"
                  type="number"
                  value={totalRaiseAmount}
                  onChange={(e) => setTotalRaiseAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  GoHighLevel Integration
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect your GHL account to sync contacts and calls automatically
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ghlLocationId">Location ID</Label>
                  <Input
                    id="ghlLocationId"
                    value={ghlLocationId}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                    placeholder="ve9EPM428h8vShlRW1KT"
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in GHL → Settings → Business Profile
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ghlApiKey">Private Integration Key</Label>
                  <Input
                    id="ghlApiKey"
                    type="password"
                    value={ghlApiKey}
                    onChange={(e) => setGhlApiKey(e.target.value)}
                    placeholder="••••••••••••••••••••••••"
                  />
                  <p className="text-xs text-muted-foreground">
                    Generate from GHL → Settings → Integrations → Private Integrations
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <span className="text-sm font-medium">Status:</span>
                {connectionStatus === 'connected' && (
                  <span className="flex items-center gap-1 text-sm text-chart-2">
                    <CheckCircle className="h-4 w-4" />
                    Connected
                  </span>
                )}
                {connectionStatus === 'error' && (
                  <span className="flex items-center gap-1 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    Connection Failed
                  </span>
                )}
                {connectionStatus === 'unknown' && (
                  <span className="text-sm text-muted-foreground">Not Configured</span>
                )}
              </div>

              {/* Last Sync Status */}
              {settings?.ghl_last_contacts_sync && (
                <div className="p-3 border-2 border-border bg-muted/30 space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Last Contacts Sync:</span>
                    <span className="font-medium">
                      {new Date(settings.ghl_last_contacts_sync).toLocaleString()}
                    </span>
                  </div>
                  {settings?.ghl_last_calls_sync && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Last Calls Sync:</span>
                      <span className="font-medium">
                        {new Date(settings.ghl_last_calls_sync).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !ghlLocationId || !ghlApiKey}
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSyncContacts}
                  disabled={syncing || !client?.ghl_location_id || !client?.ghl_api_key}
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-3">
              <h4 className="font-medium">Required GHL Scopes</h4>
              <p className="text-sm text-muted-foreground">
                When creating your Private Integration, enable these permissions:
              </p>
              <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                <li>Contacts (read/write) - Required for syncing leads</li>
                <li>Calendars (read) - For appointment data</li>
                <li>Opportunities (read) - For pipeline tracking</li>
                <li>Conversations (read) - For call validation</li>
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="webhooks" className="mt-4">
            <WebhookSettingsTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="email-parsing" className="mt-4">
            <EmailParsingTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="thresholds" className="space-y-4 mt-4">
            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1">Business Manager</h4>
                <p className="text-sm text-muted-foreground mb-3">Quick access link to the client's ad account</p>
                <div className="space-y-2">
                  <Label htmlFor="businessManagerUrl">Business Manager URL</Label>
                  <Input
                    id="businessManagerUrl"
                    value={businessManagerUrl}
                    onChange={(e) => setBusinessManagerUrl(e.target.value)}
                    placeholder="https://business.facebook.com/..."
                  />
                </div>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1">Custom Terminology</h4>
                <p className="text-sm text-muted-foreground mb-3">Rename metrics to match your business terms</p>
                <div className="space-y-2">
                  <Label htmlFor="fundedLabel">Funded Investors Label</Label>
                  <Input
                    id="fundedLabel"
                    value={fundedInvestorLabel}
                    onChange={(e) => setFundedInvestorLabel(e.target.value)}
                    placeholder="Funded Investors"
                  />
                </div>
              </div>
            </div>

            <div className="border-2 border-border p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-1">Color Thresholds</h4>
                <p className="text-sm text-muted-foreground mb-3">Set yellow (warning) and red (critical) thresholds for each metric</p>
              </div>
              
              <div className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">Cost Per Lead</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Yellow $</span>
                  <Input
                    className="w-20"
                    value={cplYellow}
                    onChange={(e) => setCplYellow(e.target.value)}
                    type="number"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Red $</span>
                  <Input
                    className="w-20"
                    value={cplRed}
                    onChange={(e) => setCplRed(e.target.value)}
                    type="number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">Cost Per Call</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Yellow $</span>
                  <Input
                    className="w-20"
                    value={costPerCallYellow}
                    onChange={(e) => setCostPerCallYellow(e.target.value)}
                    type="number"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Red $</span>
                  <Input
                    className="w-20"
                    value={costPerCallRed}
                    onChange={(e) => setCostPerCallRed(e.target.value)}
                    type="number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">Cost Per Show</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Yellow $</span>
                  <Input
                    className="w-20"
                    value={costPerShowYellow}
                    onChange={(e) => setCostPerShowYellow(e.target.value)}
                    type="number"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Red $</span>
                  <Input
                    className="w-20"
                    value={costPerShowRed}
                    onChange={(e) => setCostPerShowRed(e.target.value)}
                    type="number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">Cost Per Investor</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Yellow $</span>
                  <Input
                    className="w-20"
                    value={costPerInvestorYellow}
                    onChange={(e) => setCostPerInvestorYellow(e.target.value)}
                    type="number"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Red $</span>
                  <Input
                    className="w-20"
                    value={costPerInvestorRed}
                    onChange={(e) => setCostPerInvestorRed(e.target.value)}
                    type="number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">Cost of Capital %</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Yellow %</span>
                  <Input
                    className="w-20"
                    value={costOfCapitalYellow}
                    onChange={(e) => setCostOfCapitalYellow(e.target.value)}
                    type="number"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Red %</span>
                  <Input
                    className="w-20"
                    value={costOfCapitalRed}
                    onChange={(e) => setCostOfCapitalRed(e.target.value)}
                    type="number"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="slackWebhook">Slack Webhook URL</Label>
              <Input
                id="slackWebhook"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
              <p className="text-xs text-muted-foreground">Create an incoming webhook in your Slack workspace</p>
            </div>

            <div className="space-y-3 mt-4">
              <h4 className="font-medium">Alert Rules</h4>
              
              <div className="flex items-center justify-between border-2 border-border p-3">
                <div className="flex items-center gap-4">
                  <Switch checked={cplAlert} onCheckedChange={setCplAlert} />
                  <div>
                    <p className="font-medium">Cost Per Lead Alert</p>
                    <p className="text-sm text-muted-foreground">Alert when CPL exceeds threshold</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">$</span>
                  <Input
                    className="w-20"
                    value={cplThreshold}
                    onChange={(e) => setCplThreshold(e.target.value)}
                    disabled={!cplAlert}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-2 border-border p-3">
                <div className="flex items-center gap-4">
                  <Switch checked={costPerCallAlert} onCheckedChange={setCostPerCallAlert} />
                  <div>
                    <p className="font-medium">Cost Per Call Alert</p>
                    <p className="text-sm text-muted-foreground">Alert when Cost/Call exceeds threshold</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">$</span>
                  <Input
                    className="w-20"
                    value={costPerCallThreshold}
                    onChange={(e) => setCostPerCallThreshold(e.target.value)}
                    disabled={!costPerCallAlert}
                  />
                </div>
              </div>
            </div>

            <Button variant="outline" className="mt-4">Test Slack Connection</Button>
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