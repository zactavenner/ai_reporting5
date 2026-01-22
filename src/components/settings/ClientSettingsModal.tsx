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
import { DollarSign, Target } from 'lucide-react';

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
  }, [settings]);

  // Load client business manager URL
  useEffect(() => {
    if (client?.business_manager_url) {
      setBusinessManagerUrl(client.business_manager_url);
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

      // Save business manager URL to client
      if (businessManagerUrl !== (client.business_manager_url || '')) {
        await supabase
          .from('clients')
          .update({ business_manager_url: businessManagerUrl })
          .eq('id', client.id);
      }

      queryClient.invalidateQueries({ queryKey: ['clients'] });
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

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
          
          <TabsContent value="webhooks" className="mt-4">
            <WebhookSettingsTab clientId={client.id} />
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