import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DollarSign, Target, Loader2 } from 'lucide-react';
import { useClientSettings, useUpdateClientSettings } from '@/hooks/useClientSettings';
import { toast } from 'sonner';

interface KPISettingsSectionProps {
  clientId: string;
  standalone?: boolean;
}

export function KPISettingsSection({ clientId, standalone = false }: KPISettingsSectionProps) {
  const { data: settings } = useClientSettings(clientId);
  const updateSettings = useUpdateClientSettings();
  const [saving, setSaving] = useState(false);

  const [mrr, setMrr] = useState('0');
  const [adSpendFeeThreshold, setAdSpendFeeThreshold] = useState('30000');
  const [adSpendFeePercent, setAdSpendFeePercent] = useState('10');
  const [monthlyAdSpendTarget, setMonthlyAdSpendTarget] = useState('');
  const [dailyAdSpendTarget, setDailyAdSpendTarget] = useState('');
  const [totalRaiseAmount, setTotalRaiseAmount] = useState('0');
  const [defaultLeadPipelineValue, setDefaultLeadPipelineValue] = useState('0');
  const [adSpendInputMode, setAdSpendInputMode] = useState<'monthly' | 'daily'>('monthly');

  useEffect(() => {
    if (settings) {
      setMrr(String((settings as any).mrr || 0));
      setAdSpendFeeThreshold(String((settings as any).ad_spend_fee_threshold || 30000));
      setAdSpendFeePercent(String((settings as any).ad_spend_fee_percent || 10));
      setTotalRaiseAmount(String((settings as any).total_raise_amount || 0));
      setDefaultLeadPipelineValue(String((settings as any).default_lead_pipeline_value || 0));

      if ((settings as any).daily_ad_spend_target && (settings as any).daily_ad_spend_target > 0) {
        setAdSpendInputMode('daily');
        setDailyAdSpendTarget(String((settings as any).daily_ad_spend_target));
        setMonthlyAdSpendTarget('');
      } else {
        setAdSpendInputMode('monthly');
        setMonthlyAdSpendTarget(String((settings as any).monthly_ad_spend_target || 0));
        setDailyAdSpendTarget('');
      }
    }
  }, [settings]);

  const projectedAnnual = parseFloat(mrr) * 12;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const calculatedMonthly = adSpendInputMode === 'daily' && dailyAdSpendTarget
    ? parseFloat(dailyAdSpendTarget) * daysInMonth
    : 0;
  const calculatedDaily = adSpendInputMode === 'monthly' && monthlyAdSpendTarget
    ? parseFloat(monthlyAdSpendTarget) / daysInMonth
    : 0;

  const effectiveMonthlyTarget = adSpendInputMode === 'daily'
    ? calculatedMonthly
    : parseFloat(monthlyAdSpendTarget) || 0;

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
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        client_id: clientId,
        mrr: parseFloat(mrr) || 0,
        ad_spend_fee_threshold: parseFloat(adSpendFeeThreshold) || 30000,
        ad_spend_fee_percent: parseFloat(adSpendFeePercent) || 10,
        monthly_ad_spend_target: adSpendInputMode === 'monthly' ? (parseFloat(monthlyAdSpendTarget) || 0) : 0,
        daily_ad_spend_target: adSpendInputMode === 'daily' ? (parseFloat(dailyAdSpendTarget) || null) : null,
        total_raise_amount: parseFloat(totalRaiseAmount) || 0,
        default_lead_pipeline_value: parseFloat(defaultLeadPipelineValue) || 0,
      } as any);
      toast.success('KPI settings saved');
    } catch {
      toast.error('Failed to save KPI settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
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
            <Label htmlFor="mrr-inline">Monthly MRR ($)</Label>
            <Input id="mrr-inline" type="number" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="0" />
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
            <Label htmlFor="adSpendFeeThreshold-inline">Ad Spend Fee Threshold ($)</Label>
            <Input id="adSpendFeeThreshold-inline" type="number" value={adSpendFeeThreshold} onChange={(e) => setAdSpendFeeThreshold(e.target.value)} placeholder="30000" />
            <p className="text-xs text-muted-foreground">Fee applies above this amount</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adSpendFeePercent-inline">Ad Spend Fee (%)</Label>
            <Input id="adSpendFeePercent-inline" type="number" value={adSpendFeePercent} onChange={(e) => setAdSpendFeePercent(e.target.value)} placeholder="10" />
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
          <Button type="button" variant={adSpendInputMode === 'monthly' ? 'default' : 'outline'} size="sm"
            onClick={() => { setAdSpendInputMode('monthly'); setDailyAdSpendTarget(''); }}>
            Monthly Target
          </Button>
          <Button type="button" variant={adSpendInputMode === 'daily' ? 'default' : 'outline'} size="sm"
            onClick={() => { setAdSpendInputMode('daily'); setMonthlyAdSpendTarget(''); }}>
            Daily Target
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {adSpendInputMode === 'monthly' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="monthlyTarget-inline">Monthly Ad Spend Target ($)</Label>
                <Input id="monthlyTarget-inline" type="number" value={monthlyAdSpendTarget} onChange={(e) => setMonthlyAdSpendTarget(e.target.value)} placeholder="0" />
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
                <Label htmlFor="dailyTarget-inline">Daily Ad Spend Target ($)</Label>
                <Input id="dailyTarget-inline" type="number" value={dailyAdSpendTarget} onChange={(e) => setDailyAdSpendTarget(e.target.value)} placeholder="0" />
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
          <Label htmlFor="totalRaise-inline">Total Raise Amount ($)</Label>
          <Input id="totalRaise-inline" type="number" value={totalRaiseAmount} onChange={(e) => setTotalRaiseAmount(e.target.value)} placeholder="0" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultPipelineValue-inline">Default Pipeline Value Per Lead ($)</Label>
          <Input id="defaultPipelineValue-inline" type="number" value={defaultLeadPipelineValue} onChange={(e) => setDefaultLeadPipelineValue(e.target.value)} placeholder="0" />
          <p className="text-xs text-muted-foreground">
            When set above 0, every lead will be valued at this amount for pipeline calculations (e.g. $100,000 per lead)
          </p>
        </div>
      </div>

      {standalone && (
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save KPI Settings
        </Button>
      )}
    </div>
  );
}