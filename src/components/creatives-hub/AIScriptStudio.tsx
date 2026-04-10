import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  FileText,
  Target,
  Zap,
  Copy,
  Check,
  RotateCcw,
  Loader2,
  Megaphone,
  TrendingUp,
  Heart,
  Shield,
  Clock,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  Save,
  Download,
  Eye,
  Star,
  Lightbulb,
  PenTool,
  Flame,
  Type,
  AlignLeft,
  MousePointer,
  ChevronRight,
} from 'lucide-react';
import { useClients, Client } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MARKETING_ANGLES = [
  { id: 'pain-agitate-solve', label: 'Pain-Agitate-Solve', icon: AlertTriangle, description: 'Identify pain, amplify it, present the solution', gradient: 'from-red-500/15 to-red-500/5', iconColor: 'text-red-500' },
  { id: 'social-proof', label: 'Social Proof', icon: Heart, description: 'Leverage testimonials and results to build trust', gradient: 'from-pink-500/15 to-pink-500/5', iconColor: 'text-pink-500' },
  { id: 'urgency-scarcity', label: 'Urgency & Scarcity', icon: Clock, description: 'Time-limited offers and exclusive access', gradient: 'from-amber-500/15 to-amber-500/5', iconColor: 'text-amber-500' },
  { id: 'authority', label: 'Authority & Credibility', icon: Shield, description: 'Expert positioning and institutional trust', gradient: 'from-blue-500/15 to-blue-500/5', iconColor: 'text-blue-500' },
  { id: 'roi-logic', label: 'ROI & Logic', icon: DollarSign, description: 'Numbers-driven case for the investment', gradient: 'from-green-500/15 to-green-500/5', iconColor: 'text-green-500' },
  { id: 'story-hook', label: 'Story Hook', icon: Megaphone, description: 'Personal narrative that pulls the viewer in', gradient: 'from-violet-500/15 to-violet-500/5', iconColor: 'text-violet-500' },
  { id: 'contrarian', label: 'Contrarian Take', icon: TrendingUp, description: 'Challenge conventional wisdom to stop the scroll', gradient: 'from-orange-500/15 to-orange-500/5', iconColor: 'text-orange-500' },
  { id: 'curiosity-gap', label: 'Curiosity Gap', icon: Eye, description: 'Open a knowledge gap that demands closing', gradient: 'from-cyan-500/15 to-cyan-500/5', iconColor: 'text-cyan-500' },
];

const DR_TOOLS = [
  { id: 'hook-generator', label: 'Hook Generator', description: 'Scroll-stopping hooks for ads', icon: Flame, gradient: 'from-red-500 to-orange-500' },
  { id: 'headline-writer', label: 'Headline Writer', description: 'Headlines that convert', icon: Type, gradient: 'from-blue-500 to-indigo-500' },
  { id: 'body-copy', label: 'Body Copy', description: 'Persuasive ad body text', icon: AlignLeft, gradient: 'from-emerald-500 to-green-500' },
  { id: 'cta-generator', label: 'CTA Generator', description: 'Click-driving CTAs', icon: MousePointer, gradient: 'from-violet-500 to-purple-500' },
];

const SCRIPT_TYPES = [
  { id: 'video-ad', label: 'Video Ad Script' },
  { id: 'podcast-read', label: 'Podcast Host-Read' },
  { id: 'ugc', label: 'UGC Script' },
  { id: 'vsl', label: 'VSL Script' },
  { id: 'webinar', label: 'Webinar Script' },
  { id: 'landing-page', label: 'Landing Page Copy' },
];

interface AIScriptStudioProps {
  clients: Client[];
}

export function AIScriptStudio({ clients }: AIScriptStudioProps) {
  const [activeMode, setActiveMode] = useState<'scripts' | 'dr-toolkit'>('scripts');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedAngle, setSelectedAngle] = useState('');
  const [selectedScriptType, setSelectedScriptType] = useState('video-ad');
  const [offerDescription, setOfferDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedDRTool, setSelectedDRTool] = useState('hook-generator');
  const [drInput, setDrInput] = useState('');
  const [drOutput, setDrOutput] = useState('');

  const selectedClientData = clients.find(c => c.id === selectedClient);

  const handleGenerate = async () => {
    if (!offerDescription.trim()) {
      toast.error('Please enter an offer description');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ad-script', {
        body: {
          offerDescription,
          marketingAngle: selectedAngle,
          scriptType: selectedScriptType,
          targetAudience,
          additionalContext,
          clientId: selectedClient || undefined,
          brandInfo: selectedClientData ? {
            name: selectedClientData.name,
            description: selectedClientData.description,
            offer: selectedClientData.offer_description,
          } : undefined,
        },
      });

      if (error) throw error;
      setGeneratedScript(data?.script || data?.content || 'Script generated successfully.');
      toast.success('Script generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate script');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDRGenerate = async () => {
    if (!drInput.trim()) {
      toast.error('Please enter your offer or product description');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ad-script', {
        body: {
          offerDescription: drInput,
          scriptType: selectedDRTool,
          clientId: selectedClient || undefined,
        },
      });

      if (error) throw error;
      setDrOutput(data?.script || data?.content || 'Content generated.');
      toast.success('Content generated');
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center bg-muted/50 rounded-full p-1 border border-border/50">
          <button
            onClick={() => setActiveMode('scripts')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeMode === 'scripts'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <PenTool className="h-3.5 w-3.5 inline mr-1.5" />
            Script Writer
          </button>
          <button
            onClick={() => setActiveMode('dr-toolkit')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeMode === 'dr-toolkit'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className="h-3.5 w-3.5 inline mr-1.5" />
            DR Toolkit
          </button>
        </div>
      </div>

      {activeMode === 'scripts' ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Configuration panel */}
          <div className="lg:col-span-2 space-y-5">
            {/* Client selector */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Client</label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select client (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Script Type</label>
                  <Select value={selectedScriptType} onValueChange={setSelectedScriptType}>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCRIPT_TYPES.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Offer Description</label>
                  <Textarea
                    value={offerDescription}
                    onChange={(e) => setOfferDescription(e.target.value)}
                    placeholder="Describe the offer, product, or service..."
                    className="bg-background/50 min-h-[100px] resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Target Audience</label>
                  <Input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g. Accredited investors, 35-65, interested in alternatives"
                    className="bg-background/50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Additional Context</label>
                  <Textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="Any tone, style, or brand voice notes..."
                    className="bg-background/50 min-h-[60px] resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Marketing angle selector */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block px-1">Marketing Angle</label>
              <div className="grid grid-cols-2 gap-2">
                {MARKETING_ANGLES.map((angle) => (
                  <button
                    key={angle.id}
                    onClick={() => setSelectedAngle(angle.id === selectedAngle ? '' : angle.id)}
                    className={`
                      group relative rounded-xl border p-3 text-left transition-all duration-200
                      ${selectedAngle === angle.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border/50 bg-card/50 hover:border-border hover:shadow-sm'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <angle.icon className={`h-3.5 w-3.5 ${angle.iconColor}`} />
                      <span className="text-xs font-semibold">{angle.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{angle.description}</p>
                    {selectedAngle === angle.id && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <Button
              className="w-full h-12 text-sm font-semibold rounded-xl shadow-sm"
              onClick={handleGenerate}
              disabled={isGenerating || !offerDescription.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Script...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>
          </div>

          {/* Right: Output panel */}
          <div className="lg:col-span-3">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-full">
              <CardContent className="p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Generated Script</h3>
                  </div>
                  {generatedScript && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleCopy(generatedScript)}
                      >
                        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => { setGeneratedScript(''); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 min-h-[400px]">
                  {generatedScript ? (
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-transparent p-0 m-0 border-none">
                        {generatedScript}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                      <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center mb-4">
                        <PenTool className="h-7 w-7 text-violet-500/50" />
                      </div>
                      <h3 className="font-semibold text-muted-foreground mb-1">Your script will appear here</h3>
                      <p className="text-xs text-muted-foreground/60 max-w-[280px]">
                        Fill in your offer details, select a marketing angle, and hit generate.
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* DR Toolkit mode */
        <div className="space-y-6">
          {/* Tool selector cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DR_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setSelectedDRTool(tool.id)}
                className={`
                  group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200
                  ${selectedDRTool === tool.id
                    ? 'border-primary shadow-md'
                    : 'border-border/50 bg-card/50 hover:border-border hover:shadow-sm'
                  }
                `}
              >
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center mb-3 shadow-sm`}>
                  <tool.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-sm font-semibold mb-0.5">{tool.label}</h3>
                <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                {selectedDRTool === tool.id && (
                  <div className="absolute top-3 right-3">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Input/Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Client</label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select client (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Offer / Product Description
                  </label>
                  <Textarea
                    value={drInput}
                    onChange={(e) => setDrInput(e.target.value)}
                    placeholder="Describe your offer or product for the AI to generate direct response copy..."
                    className="bg-background/50 min-h-[160px] resize-none"
                  />
                </div>

                <Button
                  className="w-full h-11 text-sm font-semibold rounded-xl"
                  onClick={handleDRGenerate}
                  disabled={isGenerating || !drInput.trim()}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Generate {DR_TOOLS.find(t => t.id === selectedDRTool)?.label}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Output</h3>
                  {drOutput && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleCopy(drOutput)}>
                      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </div>
                <ScrollArea className="min-h-[240px]">
                  {drOutput ? (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">
                      {drOutput}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
                      <Target className="h-10 w-10 text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">Generated copy will appear here</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
