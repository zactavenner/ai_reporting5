import { useState } from 'react';
import { Sparkles, Loader2, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useCreateAgent, AVAILABLE_MODELS, AVAILABLE_CONNECTORS } from '@/hooks/useAgents';
import { CronSchedulePicker } from './CronSchedulePicker';
import { ClientScopePicker } from './ClientScopePicker';
import { toast } from 'sonner';
import type { Client } from '@/hooks/useClients';

interface AIAgentGeneratorProps {
  clients: Client[];
  onCreated: () => void;
}

interface GeneratedConfig {
  name: string;
  icon: string;
  description: string;
  model: string;
  schedule_cron: string;
  connectors: string[];
  prompt_template: string;
}

export function AIAgentGenerator({ clients, onCreated }: AIAgentGeneratorProps) {
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [config, setConfig] = useState<GeneratedConfig | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const createAgent = useCreateAgent();

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-config', {
        body: { description: description.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConfig(data.config);
      toast.success('Agent config generated! Review and edit below.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate config');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreate = () => {
    if (!config) return;
    createAgent.mutate({
      name: config.name,
      icon: config.icon,
      description: config.description,
      prompt_template: config.prompt_template,
      schedule_cron: config.schedule_cron,
      model: config.model,
      connectors: config.connectors as any,
      client_id: clientId,
      enabled: false,
    } as any, {
      onSuccess: () => {
        setConfig(null);
        setDescription('');
        setClientId(null);
        onCreated();
      },
    });
  };

  const toggleConnector = (key: string) => {
    if (!config) return;
    const current = config.connectors || [];
    setConfig({
      ...config,
      connectors: current.includes(key) ? current.filter(c => c !== key) : [...current, key],
    });
  };

  if (config) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI-Generated Agent — Review & Edit
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setConfig(null); }}>
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Regenerate
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={createAgent.isPending}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Create Agent
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={config.name} onChange={e => setConfig({ ...config, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Icon</label>
              <Input value={config.icon} onChange={e => setConfig({ ...config, icon: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <Input value={config.description} onChange={e => setConfig({ ...config, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Model</label>
              <Select value={config.model} onValueChange={v => setConfig({ ...config, model: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CronSchedulePicker
              value={config.schedule_cron}
              onChange={v => setConfig({ ...config, schedule_cron: v })}
            />
          </div>
          <ClientScopePicker
            clientId={clientId}
            onChange={setClientId}
            clients={clients}
          />
          <div>
            <label className="text-xs text-muted-foreground">Connectors</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AVAILABLE_CONNECTORS.map(c => {
                const active = config.connectors.includes(c.key);
                return (
                  <Badge
                    key={c.key}
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleConnector(c.key)}
                  >
                    {c.label}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">System Prompt</label>
            <Textarea
              className="min-h-[200px] font-mono text-xs"
              value={config.prompt_template}
              onChange={e => setConfig({ ...config, prompt_template: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Describe what you want this agent to do</span>
        </div>
        <Textarea
          placeholder="e.g. I want an agent that monitors task completion rates across all clients, flags overdue tasks, and sends a daily summary to Slack with recommendations for task prioritization..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="min-h-[80px] resize-none"
        />
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!description.trim() || isGenerating}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Agent Config...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Agent with AI
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
