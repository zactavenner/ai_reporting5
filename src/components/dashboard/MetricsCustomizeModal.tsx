import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Trash2, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { useDashboardPreferences, useUpdateDashboardPreferences, CustomMetric } from '@/hooks/useDashboardPreferences';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MetricsCustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  isPublicView?: boolean;
}

const DEFAULT_METRICS = [
  { key: 'totalAdSpend', label: 'Total Ad Spend' },
  { key: 'ctr', label: 'CTR' },
  { key: 'leads', label: 'Leads' },
  { key: 'spamBadLeads', label: 'Spam/Bad Leads' },
  { key: 'costPerLead', label: 'Cost Per Lead' },
  { key: 'pipelineValue', label: 'Pipeline Value' },
  { key: 'leadToBookedPercent', label: 'Lead to Booked %' },
  { key: 'calls', label: 'Booked Calls' },
  { key: 'costPerCall', label: 'Cost Per Call' },
  { key: 'showedCalls', label: 'Showed Calls' },
  { key: 'showedPercent', label: 'Show Rate' },
  { key: 'costPerShow', label: 'Cost Per Show' },
  { key: 'reconnectCalls', label: 'Reconnect Calls' },
  { key: 'reconnectShowed', label: 'Reconnect Showed' },
  { key: 'closeRate', label: 'Close Rate' },
  { key: 'commitments', label: 'Commitments' },
  { key: 'commitmentDollars', label: 'Commitment $' },
  { key: 'fundedInvestors', label: 'Funded Investors' },
  { key: 'fundedDollars', label: 'Funded $' },
  { key: 'costPerInvestor', label: 'Cost / Investor' },
  { key: 'costOfCapital', label: 'Cost of Capital' },
  { key: 'avgTimeToFund', label: 'Avg Time to Fund' },
  { key: 'avgCallsToFund', label: 'Avg Calls to Fund' },
];

export function MetricsCustomizeModal({ open, onOpenChange, clientId, isPublicView = false }: MetricsCustomizeModalProps) {
  const type = isPublicView ? 'public' : 'agency';
  const { data: preferences } = useDashboardPreferences(clientId, type);
  const updatePreferences = useUpdateDashboardPreferences();
  
  const [hiddenMetrics, setHiddenMetrics] = useState<string[]>([]);
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([]);
  const [newMetric, setNewMetric] = useState<Partial<CustomMetric>>({
    label: '',
    formula: '',
    format: 'number',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  
  useEffect(() => {
    if (preferences) {
      setHiddenMetrics(preferences.hidden_metrics || []);
      setCustomMetrics(preferences.custom_metrics || []);
    }
  }, [preferences]);
  
  const toggleMetric = (key: string) => {
    setHiddenMetrics(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key) 
        : [...prev, key]
    );
  };
  
  const addCustomMetric = () => {
    if (!newMetric.label) return;
    
    const metric: CustomMetric = {
      id: `custom-${Date.now()}`,
      key: `custom_${newMetric.label.toLowerCase().replace(/\s+/g, '_')}`,
      label: newMetric.label,
      formula: newMetric.formula || '',
      format: newMetric.format || 'number',
    };
    
    setCustomMetrics(prev => [...prev, metric]);
    setNewMetric({ label: '', formula: '', format: 'number' });
  };
  
  const removeCustomMetric = (id: string) => {
    setCustomMetrics(prev => prev.filter(m => m.id !== id));
  };
  
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      // Call AI to generate metric formula
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `Create a custom KPI metric based on this description: "${aiPrompt}". 
                
Available data fields: adSpend, leads, spamLeads, calls, showedCalls, commitments, commitmentDollars, fundedInvestors, fundedDollars, impressions, clicks, ctr.

Respond with ONLY a JSON object (no markdown, no code blocks) in this exact format:
{
  "label": "Human readable metric name",
  "formula": "Mathematical formula using the available fields (e.g., 'fundedDollars / adSpend * 100')",
  "format": "currency OR percent OR number"
}`,
              },
            ],
            context: {},
            model: 'gemini',
          }),
        }
      );
      
      if (!response.ok) throw new Error('AI request failed');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');
      
      let fullResponse = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                fullResponse += data.choices[0].delta.content;
              }
            } catch {}
          }
        }
      }
      
      // Parse the JSON response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setNewMetric({
          label: parsed.label,
          formula: parsed.formula,
          format: parsed.format || 'number',
        });
      }
    } catch (error) {
      console.error('AI generation failed:', error);
    } finally {
      setIsGenerating(false);
      setAiPrompt('');
    }
  };
  
  const handleSave = () => {
    updatePreferences.mutate({
      clientId,
      type,
      hiddenMetrics,
      customMetrics,
    });
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Customize Dashboard Metrics
            {isPublicView && <Badge variant="secondary">Public View</Badge>}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="visibility" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visibility">
              <Eye className="h-4 w-4 mr-2" />
              Visibility
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Plus className="h-4 w-4 mr-2" />
              Custom Metrics
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="visibility" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Toggle which metrics are visible on the {isPublicView ? 'public' : 'agency'} dashboard.
                </p>
                
                {DEFAULT_METRICS.map(metric => (
                  <div 
                    key={metric.key}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="font-medium">{metric.label}</span>
                    <div className="flex items-center gap-2">
                      {hiddenMetrics.includes(metric.key) ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-primary" />
                      )}
                      <Switch
                        checked={!hiddenMetrics.includes(metric.key)}
                        onCheckedChange={() => toggleMetric(metric.key)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="custom" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {/* AI Generator */}
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <Label className="font-semibold">AI Metric Generator</Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Describe the metric you want (e.g., 'ROI as funded dollars divided by ad spend')"
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleAIGenerate}
                      disabled={isGenerating || !aiPrompt.trim()}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Manual Entry */}
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="font-semibold">Add Custom Metric</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Label</Label>
                      <Input
                        value={newMetric.label || ''}
                        onChange={(e) => setNewMetric(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="e.g., ROI"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Format</Label>
                      <Select 
                        value={newMetric.format}
                        onValueChange={(v) => setNewMetric(prev => ({ ...prev, format: v as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="currency">Currency ($)</SelectItem>
                          <SelectItem value="percent">Percent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Formula</Label>
                    <Textarea
                      value={newMetric.formula || ''}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, formula: e.target.value }))}
                      placeholder="e.g., fundedDollars / adSpend * 100"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Available: adSpend, leads, spamLeads, calls, showedCalls, commitments, 
                      commitmentDollars, fundedInvestors, fundedDollars, impressions, clicks, ctr
                    </p>
                  </div>
                  <Button onClick={addCustomMetric} disabled={!newMetric.label} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Metric
                  </Button>
                </div>
                
                {/* Custom Metrics List */}
                {customMetrics.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold">Custom Metrics</Label>
                    {customMetrics.map(metric => (
                      <div 
                        key={metric.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <span className="font-medium">{metric.label}</span>
                          <p className="text-xs text-muted-foreground font-mono">
                            {metric.formula}
                          </p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeCustomMetric(metric.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updatePreferences.isPending}>
            {updatePreferences.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
