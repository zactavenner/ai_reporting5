import { useState, useMemo } from 'react';
import { Plus, Trash2, Building2, Pencil, ExternalLink, Globe, Settings, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreativesSection } from '@/components/creative/CreativesSection';

interface Property {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  daily_budget: number;
  status: string;
  promo_url: string | null;
  campaign_name: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  website_url: string | null;
  elise_connected: boolean;
  units_count: number | null;
}

interface PropertyManagerTabProps {
  clientId: string;
  clientName: string;
}

const emptyForm = {
  name: '',
  address: '',
  meta_ad_account_id: '',
  meta_access_token: '',
  daily_budget: '',
  status: 'active',
  promo_url: '',
  campaign_name: '',
  notes: '',
  website_url: '',
  elise_connected: false,
  units_count: '',
};

export function PropertyManagerTab({ clientId, clientName }: PropertyManagerTabProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsProperty, setSettingsProperty] = useState<Property | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['client-properties', clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_properties')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Property[];
    },
  });

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId]
  );

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        client_id: clientId,
        name: values.name,
        address: values.address || null,
        meta_ad_account_id: values.meta_ad_account_id || null,
        meta_access_token: values.meta_access_token || null,
        daily_budget: Number(values.daily_budget) || 0,
        status: values.status,
        promo_url: values.promo_url || null,
        campaign_name: values.campaign_name || null,
        notes: values.notes || null,
        website_url: values.website_url || null,
        elise_connected: values.elise_connected,
        units_count: values.units_count ? Number(values.units_count) : null,
      };
      if (values.id) {
        const { error } = await (supabase as any).from('client_properties').update(payload).eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('client_properties').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      toast.success(editingId ? 'Property updated' : 'Property added');
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSettings = useMutation({
    mutationFn: async ({ id, meta_ad_account_id, meta_access_token }: { id: string; meta_ad_account_id: string; meta_access_token: string }) => {
      const { error } = await (supabase as any).from('client_properties').update({ meta_ad_account_id: meta_ad_account_id || null, meta_access_token: meta_access_token || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      toast.success('Meta settings updated');
      setSettingsDialogOpen(false);
      setSettingsProperty(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('client_properties').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      toast.success('Property removed');
      if (selectedPropertyId) {
        setSelectedPropertyId(null);
        setView('list');
      }
    },
  });

  const openEdit = (prop: Property) => {
    setEditingId(prop.id);
    setForm({
      name: prop.name,
      address: prop.address || '',
      meta_ad_account_id: prop.meta_ad_account_id || '',
      meta_access_token: prop.meta_access_token || '',
      daily_budget: String(prop.daily_budget || ''),
      status: prop.status || 'active',
      promo_url: prop.promo_url || '',
      campaign_name: prop.campaign_name || '',
      notes: prop.notes || '',
      website_url: prop.website_url || '',
      elise_connected: prop.elise_connected || false,
      units_count: prop.units_count ? String(prop.units_count) : '',
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openDetail = (prop: Property) => {
    setSelectedPropertyId(prop.id);
    setView('detail');
  };

  const openSettings = (prop: Property, e: React.MouseEvent) => {
    e.stopPropagation();
    setSettingsProperty(prop);
    setSettingsDialogOpen(true);
  };

  if (view === 'detail' && selectedProperty) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}>
              ← All Properties
            </Button>
            <div>
              <h2 className="text-lg font-bold">{selectedProperty.name}</h2>
              {selectedProperty.address && (
                <p className="text-sm text-muted-foreground">{selectedProperty.address}</p>
              )}
            </div>
            <Badge variant={selectedProperty.status === 'active' ? 'default' : 'secondary'}>
              {selectedProperty.status}
            </Badge>
            {selectedProperty.elise_connected && (
              <Badge variant="outline" className="text-green-600 border-green-300">Elise AI</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedProperty.website_url && (
              <Button variant="outline" size="sm" onClick={() => window.open(selectedProperty.website_url!, '_blank')}>
                <Globe className="h-3.5 w-3.5 mr-1" /> Website
              </Button>
            )}
            {selectedProperty.promo_url && (
              <Button variant="outline" size="sm" onClick={() => window.open(selectedProperty.promo_url!, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Promo
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openEdit(selectedProperty)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">${Number(selectedProperty.daily_budget || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Daily Budget</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{selectedProperty.units_count || '—'}</p>
            <p className="text-xs text-muted-foreground">Units</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{selectedProperty.meta_ad_account_id ? '✓' : '—'}</p>
            <p className="text-xs text-muted-foreground">Ad Account</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{selectedProperty.elise_connected ? '✓' : '✗'}</p>
            <p className="text-xs text-muted-foreground">Elise AI</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{selectedProperty.promo_url ? '✓' : '—'}</p>
            <p className="text-xs text-muted-foreground">Promo</p>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selectedProperty.meta_ad_account_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meta Ad Account</span>
                <span className="font-mono text-xs">{selectedProperty.meta_ad_account_id}</span>
              </div>
            )}
            {selectedProperty.campaign_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign</span>
                <span>{selectedProperty.campaign_name}</span>
              </div>
            )}
            {selectedProperty.website_url && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Website</span>
                <a href={selectedProperty.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">{selectedProperty.website_url}</a>
              </div>
            )}
            {selectedProperty.notes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground mb-1">Notes</p>
                <p>{selectedProperty.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="text-base font-bold mb-3">Creatives for {selectedProperty.name}</h3>
          <CreativesSection
            clientId={clientId}
            clientName={`${clientName} - ${selectedProperty.name}`}
            isPublicView={false}
          />
        </div>

        <PropertyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setForm={setForm}
          onSubmit={() => upsert.mutate({ ...form, id: editingId || undefined })}
          isEditing={!!editingId}
          isPending={upsert.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Properties
          </h2>
          <p className="text-sm text-muted-foreground">
            {properties.length} properties • Click to view details & creatives
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Property
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading properties...</div>
      ) : properties.length === 0 ? (
        <Card className="border-2 border-dashed p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No properties yet</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add First Property
          </Button>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Daily Spend</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-center">Elise AI</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Promo / Special</TableHead>
                <TableHead className="text-center">Meta</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((prop) => (
                <TableRow key={prop.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(prop)}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{prop.name}</p>
                      <Badge variant={prop.status === 'active' ? 'default' : 'secondary'} className="text-[10px] mt-0.5">
                        {prop.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    ${Number(prop.daily_budget || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-center">
                    {prop.elise_connected ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                    {prop.address || '—'}
                  </TableCell>
                  <TableCell>
                    {prop.website_url ? (
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); window.open(prop.website_url!, '_blank'); }}>
                        <Globe className="h-3 w-3 mr-1" /> Visit
                      </Button>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px]">
                    {prop.promo_url ? (
                      <span className="text-foreground">{prop.promo_url}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => openSettings(prop, e)}>
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(prop); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteProp.mutate(prop.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PropertyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={() => upsert.mutate({ ...form, id: editingId || undefined })}
        isEditing={!!editingId}
        isPending={upsert.isPending}
      />

      <MetaSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        property={settingsProperty}
        onSave={(id, adAccountId, accessToken) => updateSettings.mutate({ id, meta_ad_account_id: adAccountId, meta_access_token: accessToken })}
        isPending={updateSettings.isPending}
      />
    </div>
  );
}

function MetaSettingsDialog({
  open, onOpenChange, property, onSave, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property | null;
  onSave: (id: string, adAccountId: string, accessToken: string) => void;
  isPending: boolean;
}) {
  const [adAccountId, setAdAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (v && property) {
        setAdAccountId(property.meta_ad_account_id || '');
        setAccessToken(property.meta_access_token || '');
      }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meta Settings — {property?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Meta Ad Account ID</Label>
            <Input value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_123456789" />
          </div>
          <div>
            <Label>Meta Access Token</Label>
            <Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAA..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => property && onSave(property.id, adAccountId, accessToken)} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PropertyDialog({
  open, onOpenChange, form, setForm, onSubmit, isEditing, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  onSubmit: () => void;
  isEditing: boolean;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Property' : 'Add Property'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Property Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sunset Apartments" />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, ST ZIP" />
          </div>
          <div>
            <Label>Website URL</Label>
            <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://www.example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Daily Budget ($)</Label>
              <Input type="number" value={form.daily_budget} onChange={(e) => setForm({ ...form, daily_budget: e.target.value })} placeholder="100" />
            </div>
            <div>
              <Label>Units Count</Label>
              <Input type="number" value={form.units_count} onChange={(e) => setForm({ ...form, units_count: e.target.value })} placeholder="228" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={form.elise_connected}
                onCheckedChange={(v) => setForm({ ...form, elise_connected: v })}
              />
              <Label>Elise AI Connected</Label>
            </div>
          </div>
          <div>
            <Label>Campaign Name</Label>
            <Input value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} placeholder="Property Campaign" />
          </div>
          <div>
            <Label>Promo / Special URL</Label>
            <Input value={form.promo_url} onChange={(e) => setForm({ ...form, promo_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!form.name || isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Update' : 'Add Property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
