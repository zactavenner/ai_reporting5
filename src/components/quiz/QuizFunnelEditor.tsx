import { useState } from 'react';
import { QuizFunnel, QuizQuestion, useUpdateQuizFunnel } from '@/hooks/useQuizFunnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface QuizFunnelEditorProps {
  funnel: QuizFunnel;
  onBack: () => void;
}

export function QuizFunnelEditor({ funnel, onBack }: QuizFunnelEditorProps) {
  const updateFunnel = useUpdateQuizFunnel();
  const [form, setForm] = useState({
    name: funnel.name,
    title: funnel.title,
    subtitle: funnel.subtitle || '',
    hero_heading: funnel.hero_heading || '',
    hero_description: funnel.hero_description || '',
    badge_text: funnel.badge_text || '',
    cta_text: funnel.cta_text || 'See If You Qualify',
    brand_name: funnel.brand_name || '',
    brand_logo_url: funnel.brand_logo_url || '',
    slug: funnel.slug || '',
    calendar_url: funnel.calendar_url || '',
    thank_you_heading: funnel.thank_you_heading || "You're All Set!",
    thank_you_message: funnel.thank_you_message || '',
    disclaimer_text: funnel.disclaimer_text || '',
    meta_pixel_id: funnel.meta_pixel_id || '',
    primary_color: funnel.primary_color || '',
    collect_contact: funnel.collect_contact,
    show_calendar: funnel.show_calendar,
    is_active: funnel.is_active,
  });

  const [questions, setQuestions] = useState<QuizQuestion[]>(
    (funnel.questions as QuizQuestion[]) || []
  );

  const [heroStats, setHeroStats] = useState<Array<{ value: string; label: string }>>(
    (funnel.hero_stats as any[]) || []
  );

  const handleSave = async () => {
    try {
      await updateFunnel.mutateAsync({
        id: funnel.id,
        ...form,
        questions: questions as any,
        hero_stats: heroStats as any,
      });
      toast.success('Quiz funnel saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { question: '', subtext: '', options: ['Option 1', 'Option 2'] }]);
  };

  const updateQuestion = (idx: number, field: keyof QuizQuestion, value: any) => {
    const updated = [...questions];
    (updated[idx] as any)[field] = value;
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const addOption = (qIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options.push(`Option ${updated[qIdx].options.length + 1}`);
    setQuestions(updated);
  };

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    const updated = [...questions];
    updated[qIdx].options[oIdx] = value;
    setQuestions(updated);
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options = updated[qIdx].options.filter((_, i) => i !== oIdx);
    setQuestions(updated);
  };

  const addHeroStat = () => {
    setHeroStats([...heroStats, { value: '', label: '' }]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold">Edit Quiz: {form.name}</h2>
            <p className="text-xs text-muted-foreground">Configure the multi-step quiz flow</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {form.slug && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/quiz/${form.slug}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </a>
            </Button>
          )}
          <Button onClick={handleSave} disabled={updateFunnel.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateFunnel.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="landing">
        <TabsList>
          <TabsTrigger value="landing">Landing Page</TabsTrigger>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="contact">Contact & Calendar</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="landing" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Landing Page Content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quiz Name (internal)</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="my-quiz" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Hero Heading</Label>
                <Input value={form.hero_heading} onChange={e => setForm({ ...form, hero_heading: e.target.value })} placeholder="Invest in..." />
              </div>
              <div className="space-y-2">
                <Label>Hero Description</Label>
                <Textarea value={form.hero_description} onChange={e => setForm({ ...form, hero_description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Badge Text</Label>
                <Input value={form.badge_text} onChange={e => setForm({ ...form, badge_text: e.target.value })} placeholder="Accredited Investors" />
              </div>
              <div className="space-y-2">
                <Label>CTA Button Text</Label>
                <Input value={form.cta_text} onChange={e => setForm({ ...form, cta_text: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Disclaimer Text</Label>
                <Textarea value={form.disclaimer_text} onChange={e => setForm({ ...form, disclaimer_text: e.target.value })} rows={2} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Hero Stats</CardTitle>
                <Button variant="outline" size="sm" onClick={addHeroStat}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Stat
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {heroStats.map((stat, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Input placeholder="Value (e.g. 22.3%)" value={stat.value}
                    onChange={e => {
                      const updated = [...heroStats];
                      updated[i].value = e.target.value;
                      setHeroStats(updated);
                    }} className="flex-1" />
                  <Input placeholder="Label (e.g. Projected IRR)" value={stat.label}
                    onChange={e => {
                      const updated = [...heroStats];
                      updated[i].label = e.target.value;
                      setHeroStats(updated);
                    }} className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={() => setHeroStats(heroStats.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              {heroStats.length === 0 && <p className="text-sm text-muted-foreground">No stats added yet</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4 mt-4">
          {questions.map((q, qIdx) => (
            <Card key={qIdx}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Question {qIdx + 1}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion(qIdx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Question</Label>
                  <Input value={q.question} onChange={e => updateQuestion(qIdx, 'question', e.target.value)} placeholder="Are you an accredited investor?" />
                </div>
                <div className="space-y-2">
                  <Label>Subtext (optional)</Label>
                  <Input value={q.subtext || ''} onChange={e => updateQuestion(qIdx, 'subtext', e.target.value)} placeholder="Additional context..." />
                </div>
                <div className="space-y-2">
                  <Label>Options</Label>
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <Input value={opt} onChange={e => updateOption(qIdx, oIdx, e.target.value)} />
                      {q.options.length > 2 && (
                        <Button variant="ghost" size="icon" onClick={() => removeOption(qIdx, oIdx)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addOption(qIdx)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button onClick={addQuestion} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add Question
          </Button>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Contact & Calendar Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Collect contact information</Label>
                <Switch checked={form.collect_contact} onCheckedChange={v => setForm({ ...form, collect_contact: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show calendar booking step</Label>
                <Switch checked={form.show_calendar} onCheckedChange={v => setForm({ ...form, show_calendar: v })} />
              </div>
              {form.show_calendar && (
                <div className="space-y-2">
                  <Label>External Calendar URL (optional)</Label>
                  <Input value={form.calendar_url} onChange={e => setForm({ ...form, calendar_url: e.target.value })} placeholder="https://calendly.com/..." />
                </div>
              )}
              <div className="space-y-2">
                <Label>Quiz Title (shown during quiz flow)</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Quiz Subtitle</Label>
                <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Thank You Heading</Label>
                <Input value={form.thank_you_heading} onChange={e => setForm({ ...form, thank_you_heading: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Thank You Message</Label>
                <Textarea value={form.thank_you_message} onChange={e => setForm({ ...form, thank_you_message: e.target.value })} rows={2} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Brand Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Brand Name</Label>
                  <Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <Input value={form.primary_color} onChange={e => setForm({ ...form, primary_color: e.target.value })} placeholder="#6366f1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input value={form.brand_logo_url} onChange={e => setForm({ ...form, brand_logo_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Meta Pixel ID</Label>
                <Input value={form.meta_pixel_id} onChange={e => setForm({ ...form, meta_pixel_id: e.target.value })} placeholder="123456789" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Quiz Active</Label>
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
