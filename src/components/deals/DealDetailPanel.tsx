import { useState } from 'react';
import { X, Plus, Phone, Mail, MessageSquare, Calendar, ArrowRightLeft, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Deal, DealStage, DEAL_STAGES, useUpdateDeal, useDeleteDeal, useDealActivities, useCreateDealActivity } from '@/hooks/useDeals';
import { format, differenceInDays } from 'date-fns';

interface DealDetailPanelProps {
  deal: Deal;
  clientName?: string;
  onClose: () => void;
}

const ACTIVITY_ICONS: Record<string, any> = {
  note: MessageSquare,
  call: Phone,
  email: Mail,
  meeting: Calendar,
  stage_change: ArrowRightLeft,
  value_change: DollarSign,
};

export function DealDetailPanel({ deal, clientName, onClose }: DealDetailPanelProps) {
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const { data: activities = [] } = useDealActivities(deal.id);
  const createActivity = useCreateDealActivity();

  const [editName, setEditName] = useState(deal.deal_name);
  const [editValue, setEditValue] = useState(String(deal.deal_value));
  const [editProbability, setEditProbability] = useState(String(deal.probability));
  const [editContactName, setEditContactName] = useState(deal.contact_name || '');
  const [editContactEmail, setEditContactEmail] = useState(deal.contact_email || '');
  const [editContactPhone, setEditContactPhone] = useState(deal.contact_phone || '');
  const [editNotes, setEditNotes] = useState(deal.notes || '');
  const [editAssigned, setEditAssigned] = useState(deal.assigned_to || '');
  const [editSource, setEditSource] = useState(deal.source || '');
  const [editCloseDate, setEditCloseDate] = useState(deal.expected_close_date || '');
  const [newActivityType, setNewActivityType] = useState('note');
  const [newActivityDesc, setNewActivityDesc] = useState('');

  const handleSave = () => {
    updateDeal.mutate({
      id: deal.id,
      updates: {
        deal_name: editName,
        deal_value: parseFloat(editValue) || 0,
        probability: parseInt(editProbability) || 0,
        contact_name: editContactName || null,
        contact_email: editContactEmail || null,
        contact_phone: editContactPhone || null,
        notes: editNotes || null,
        assigned_to: editAssigned || null,
        source: editSource || null,
        expected_close_date: editCloseDate || null,
      },
    });
  };

  const handleStageChange = (newStage: string) => {
    const oldStage = deal.stage;
    updateDeal.mutate({ id: deal.id, updates: { stage: newStage as DealStage } });
    createActivity.mutate({
      deal_id: deal.id,
      activity_type: 'stage_change',
      description: `Stage changed from "${oldStage}" to "${newStage}"`,
    });
  };

  const handleAddActivity = () => {
    if (!newActivityDesc.trim()) return;
    createActivity.mutate({
      deal_id: deal.id,
      activity_type: newActivityType,
      description: newActivityDesc.trim(),
    });
    setNewActivityDesc('');
  };

  const handleDelete = () => {
    deleteDeal.mutate(deal.id);
    onClose();
  };

  const daysInStage = differenceInDays(new Date(), new Date(deal.updated_at));

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-card border-l border-border shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-bold truncate">{deal.deal_name}</h3>
          {clientName && <p className="text-xs text-muted-foreground">{clientName}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Stage & Value */}
          <div className="flex gap-2">
            <Select value={deal.stage} onValueChange={handleStageChange}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">{daysInStage}d</Badge>
          </div>

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Deal Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Value ($)</Label>
              <Input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Probability (%)</Label>
              <Input type="number" min={0} max={100} value={editProbability} onChange={e => setEditProbability(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Expected Close</Label>
              <Input type="date" value={editCloseDate} onChange={e => setEditCloseDate(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input value={editContactName} onChange={e => setEditContactName(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={editContactEmail} onChange={e => setEditContactEmail(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Assigned To</Label>
              <Input value={editAssigned} onChange={e => setEditAssigned(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Input value={editSource} onChange={e => setEditSource(e.target.value)} onBlur={handleSave} className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} onBlur={handleSave} rows={3} className="text-sm" />
          </div>

          <Separator />

          {/* Add Activity */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Log Activity</h4>
            <div className="flex gap-2">
              <Select value={newActivityType} onValueChange={setNewActivityType}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Description..."
                value={newActivityDesc}
                onChange={e => setNewActivityDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddActivity()}
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" className="h-8" onClick={handleAddActivity} disabled={!newActivityDesc.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Activity Timeline</h4>
            {activities.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {activities.map(act => {
                  const Icon = ACTIVITY_ICONS[act.activity_type] || MessageSquare;
                  return (
                    <div key={act.id} className="flex gap-2 text-xs">
                      <div className="mt-0.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground">{act.description}</p>
                        <p className="text-muted-foreground">
                          {format(new Date(act.created_at), 'MMM d, h:mm a')}
                          {act.created_by && ` · ${act.created_by}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          <Button variant="destructive" size="sm" onClick={handleDelete} className="w-full">
            Delete Deal
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
