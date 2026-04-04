import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClients } from '@/hooks/useClients';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Plus, Palette, Loader2, Trash2, Pencil, Star
} from 'lucide-react';

interface AdStyle {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  example_image_url: string | null;
  reference_images: string[];
  is_default: boolean;
  display_order: number;
  client_id: string | null;
  created_at: string;
}

export function ManageStylesTab({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<AdStyle | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>('all');

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formClientId, setFormClientId] = useState<string>('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  const { data: styles = [], isLoading } = useQuery({
    queryKey: ['ad-styles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_styles')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AdStyle[];
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormPrompt('');
    setFormClientId('');
    setFormIsDefault(false);
    setEditingStyle(null);
  };

  const openEdit = (style: AdStyle) => {
    setFormName(style.name);
    setFormDescription(style.description);
    setFormPrompt(style.prompt_template);
    setFormClientId(style.client_id || '');
    setFormIsDefault(style.is_default);
    setEditingStyle(style);
    setCreateOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      toast.error('Style name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        prompt_template: formPrompt.trim(),
        client_id: formClientId || null,
        is_default: formIsDefault,
      };

      if (editingStyle) {
        const { error } = await supabase
          .from('ad_styles')
          .update(payload)
          .eq('id', editingStyle.id);
        if (error) throw error;
        toast.success('Style updated');
      } else {
        const maxOrder = styles.reduce((max, s) => Math.max(max, s.display_order), 0);
        const { error } = await supabase
          .from('ad_styles')
          .insert({ ...payload, display_order: maxOrder + 1, reference_images: [] } as any);
        if (error) throw error;
        toast.success('Style created');
      }

      queryClient.invalidateQueries({ queryKey: ['ad-styles'] });
      setCreateOpen(false);
      resetForm();
    } catch (err) {
      toast.error('Failed to save style');
    } finally {
      setSaving(false);
    }
  }, [formName, formDescription, formPrompt, formClientId, formIsDefault, editingStyle, styles, queryClient]);

  const handleDelete = useCallback(async (style: AdStyle) => {
    const { error } = await supabase.from('ad_styles').delete().eq('id', style.id);
    if (error) {
      toast.error('Failed to delete style');
      return;
    }
    toast.success('Style deleted');
    queryClient.invalidateQueries({ queryKey: ['ad-styles'] });
  }, [queryClient]);

  const filtered = styles.filter(s => {
    if (clientFilter === 'all') return true;
    if (clientFilter === 'global') return !s.client_id;
    return s.client_id === clientFilter;
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Manage Styles
          </h2>
          <p className="text-muted-foreground text-sm">Upload proven reference assets to improve AI ad generation</p>
        </div>
      )}

      <div className="flex gap-3 items-center flex-wrap">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Styles</SelectItem>
            <SelectItem value="global">Global</SelectItem>
            {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Style</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingStyle ? 'Edit Style' : 'Create New Style'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Bold Dark" /></div>
              <div><Label>Description</Label><Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Dark bg, bright text, high contrast" /></div>
              <div><Label>Prompt Template</Label><Textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} placeholder="Generate a bold ad with dark background..." rows={3} /></div>
              <div>
                <Label>Client (optional — leave blank for global)</Label>
                <Select value={formClientId} onValueChange={setFormClientId}>
                  <SelectTrigger><SelectValue placeholder="Global (all clients)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formIsDefault} onCheckedChange={setFormIsDefault} />
                <Label>Set as default style</Label>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editingStyle ? 'Update Style' : 'Create Style'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading styles...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Palette className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-lg font-medium">No styles configured</p>
          <p className="text-sm">Create styles with reference images to guide AI generation</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((style) => (
            <Card key={style.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {style.name}
                      {style.is_default && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">{style.description}</CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(style)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(style)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1 mt-1">
                  {style.client_id && clientMap[style.client_id] ? (
                    <Badge variant="outline" className="text-xs">{clientMap[style.client_id]}</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Global</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {style.prompt_template && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2 italic">
                    "{style.prompt_template}"
                  </p>
                )}
                {style.reference_images && style.reference_images.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {style.reference_images.slice(0, 4).map((img, i) => (
                      <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover" />
                    ))}
                    {style.reference_images.length > 4 && (
                      <span className="text-xs text-muted-foreground self-center">+{style.reference_images.length - 4}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
