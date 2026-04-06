import { useState, useEffect } from 'react';
import { Settings, Save, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClientSettings, useUpdateClientSettings } from '@/hooks/useClientSettings';
import { toast } from 'sonner';

interface AttributionSettingsProps {
  clientId: string;
}

interface AttributionConfig {
  campaign_naming: string;
  adset_naming: string;
  ad_naming: string;
  utm_source_field: string;
  utm_medium_field: string;
  utm_campaign_field: string;
  utm_content_field: string;
  attribution_window_days: number;
  auto_attribution_enabled: boolean;
}

const defaultConfig: AttributionConfig = {
  campaign_naming: '{client}_{offer}_{objective}',
  adset_naming: '{audience}_{placement}_{geo}',
  ad_naming: '{creative_type}_{variant}_{date}',
  utm_source_field: 'utm_source',
  utm_medium_field: 'utm_medium',
  utm_campaign_field: 'utm_campaign',
  utm_content_field: 'utm_content',
  attribution_window_days: 7,
  auto_attribution_enabled: true,
};

export function AttributionSettings({ clientId }: AttributionSettingsProps) {
  const { data: settings } = useClientSettings(clientId);
  const updateSettings = useUpdateClientSettings();
  const [config, setConfig] = useState<AttributionConfig>(defaultConfig);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const saved = settings?.webhook_mappings?.attribution;
    if (saved) {
      setConfig({ ...defaultConfig, ...saved });
    }
  }, [settings]);

  const handleSave = () => {
    const existingMappings = settings?.webhook_mappings || {};
    updateSettings.mutate(
      {
        client_id: clientId,
        webhook_mappings: {
          ...existingMappings,
          attribution: config,
        },
      },
      {
        onSuccess: () => {
          toast.success('Attribution settings saved');
          setDirty(false);
        },
      }
    );
  };

  const update = (field: keyof AttributionConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Naming Conventions
          </CardTitle>
          <CardDescription>
            Define how campaigns, ad sets, and ads should be named for proper attribution mapping.
            Use {'{placeholders}'} that match your actual naming patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Campaign Naming Pattern
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent>e.g. BlueCapital_FundRaise_Conversions</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              value={config.campaign_naming}
              onChange={(e) => update('campaign_naming', e.target.value)}
              placeholder="{client}_{offer}_{objective}"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Ad Set Naming Pattern
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent>e.g. Accredited_Feed_US</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              value={config.adset_naming}
              onChange={(e) => update('adset_naming', e.target.value)}
              placeholder="{audience}_{placement}_{geo}"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Ad Naming Pattern
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent>e.g. Video_V3_20260320</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              value={config.ad_naming}
              onChange={(e) => update('ad_naming', e.target.value)}
              placeholder="{creative_type}_{variant}_{date}"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UTM Mapping</CardTitle>
          <CardDescription>
            Map your UTM parameters to the correct lead fields for attribution tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>UTM Source Field</Label>
            <Input
              value={config.utm_source_field}
              onChange={(e) => update('utm_source_field', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>UTM Medium Field</Label>
            <Input
              value={config.utm_medium_field}
              onChange={(e) => update('utm_medium_field', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>UTM Campaign Field</Label>
            <Input
              value={config.utm_campaign_field}
              onChange={(e) => update('utm_campaign_field', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>UTM Content Field</Label>
            <Input
              value={config.utm_content_field}
              onChange={(e) => update('utm_content_field', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribution Window</CardTitle>
          <CardDescription>
            Configure the attribution lookback window and auto-attribution behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Attribution Window (days)</Label>
            <Select
              value={String(config.attribution_window_days)}
              onValueChange={(v) => update('attribution_window_days', Number(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="28">28 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Attribution</Label>
              <p className="text-xs text-muted-foreground">
                Automatically match leads to campaigns based on UTM parameters
              </p>
            </div>
            <Switch
              checked={config.auto_attribution_enabled}
              onCheckedChange={(v) => update('auto_attribution_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || updateSettings.isPending}>
          <Save className="h-4 w-4 mr-2" />
          Save Attribution Settings
        </Button>
      </div>
    </div>
  );
}