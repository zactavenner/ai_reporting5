import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEAL_STAGES, DealStage, useCreateDeal } from '@/hooks/useDeals';
import { Client } from '@/hooks/useClients';

interface CreateDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
}

export function CreateDealModal({ open, onOpenChange, clients }: CreateDealModalProps) {
  const createDeal = useCreateDeal();
  const [clientId, setClientId] = useState('');
  const [dealName, setDealName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [stage, setStage] = useState('Lead');
  const [probability, setProbability] = useState('10');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [source, setSource] = useState('');

  const handleCreate = async () => {
    if (!clientId || !dealName.trim()) return;
    await createDeal.mutateAsync({
      client_id: clientId,
      deal_name: dealName.trim(),
      deal_value: parseFloat(dealValue) || 0,
      stage: stage as DealStage,
      probability: parseInt(probability) || 0,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      source: source || null,
    });
    // Reset
    setDealName('');
    setDealValue('');
    setStage('Lead');
    setProbability('10');
    setContactName('');
    setContactEmail('');
    setSource('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Deal</DialogTitle>
          <DialogDescription>Add a deal to track in your pipeline</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Deal Name *</Label>
            <Input value={dealName} onChange={e => setDealName(e.target.value)} placeholder="Deal name" className="h-8" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Value ($)</Label>
              <Input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="0" className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Probability (%)</Label>
              <Input type="number" min={0} max={100} value={probability} onChange={e => setProbability(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g., Meta Ads" className="h-8" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Contact Email</Label>
              <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="h-8" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!clientId || !dealName.trim() || createDeal.isPending}>
              Create Deal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
