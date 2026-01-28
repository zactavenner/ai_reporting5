import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  DollarSign, 
  Users, 
  Phone, 
  TrendingUp,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  Mail,
  User,
  Globe,
  Clock,
  Plus,
  Trash2,
  Edit,
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle,
  RefreshCw,
  Handshake,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { exportToCSV } from '@/lib/exportUtils';
import { DailyMetric } from '@/hooks/useMetrics';
import { Lead, Call } from '@/hooks/useLeadsAndCalls';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSingleContactSync } from '@/hooks/useSingleContactSync';
import { RecordDetailsGHLSection, LinkedContactInfo } from './RecordDetailsGHLSection';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface FundedInvestor {
  id: string;
  name: string | null;
  funded_amount: number;
  funded_at: string;
  first_contact_at: string | null;
  time_to_fund_days: number | null;
  calls_to_fund: number;
  lead_id: string | null;
  client_id?: string;
  external_id?: string;
  commitment_amount?: number | null;
}

interface InlineRecordsViewProps {
  dailyMetrics: DailyMetric[];
  leads: Lead[];
  calls: Call[];
  fundedInvestors: FundedInvestor[];
  isLoading?: boolean;
  onRecordSelect?: (record: any, type: string) => void;
  selectedRecord?: any;
  selectedType?: string;
  clientId?: string;
  isPublicView?: boolean;
  ghlLocationId?: string | null;
}

// GHL contact link URL builder
const getGHLContactUrl = (locationId: string, contactId: string) => {
  return `https://app.gohighlevel.com/location/${locationId}/contacts/detail/${contactId}`;
};

const PAGE_SIZE = 150;

type TabType = 'adspend' | 'leads' | 'booked' | 'showed' | 'reconnect' | 'reconnect-showed' | 'commitments' | 'funded';

export function InlineRecordsView({
  dailyMetrics,
  leads,
  calls,
  fundedInvestors,
  isLoading,
  onRecordSelect,
  selectedRecord,
  selectedType,
  clientId,
  isPublicView = false,
  ghlLocationId,
}: InlineRecordsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('adspend');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [repFilter, setRepFilter] = useState<string>('all');
  const queryClient = useQueryClient();
  const { syncContact, isSyncing } = useSingleContactSync();

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Form states for adding/editing records
  const [formData, setFormData] = useState<any>({});
  
  // Helper to check if a record can be synced from GHL
  const canSyncFromGHL = (externalId: string | undefined, hasGhlLocation: boolean) => {
    return hasGhlLocation && 
           externalId && 
           !externalId.startsWith('wh_') && 
           !externalId.startsWith('manual-');
  };
  
  // Format relative time for last sync
  const formatLastSync = (syncedAt: string | null | undefined): string => {
    if (!syncedAt) return 'Never';
    try {
      return formatDistanceToNow(new Date(syncedAt), { addSuffix: true });
    } catch {
      return 'Never';
    }
  };
  
  // Handle sync button click
  const handleSyncClick = async (
    e: React.MouseEvent, 
    externalId: string, 
    recordType: 'lead' | 'call'
  ) => {
    e.stopPropagation();
    if (!clientId) return;
    await syncContact(clientId, externalId, recordType);
  };

  // Get unique reps from leads
  const uniqueReps = useMemo(() => {
    const reps = new Set<string>();
    leads.forEach(lead => {
      if (lead.assigned_user) reps.add(lead.assigned_user);
    });
    return Array.from(reps);
  }, [leads]);

  // Separate call types into distinct arrays
  const bookedCalls = useMemo(() => 
    calls.filter(c => !c.is_reconnect), [calls]);

  const showedCalls = useMemo(() => 
    bookedCalls.filter(c => c.showed), [bookedCalls]);

  const reconnectCalls = useMemo(() => 
    calls.filter(c => c.is_reconnect && !c.showed), [calls]);

  const reconnectShowedCalls = useMemo(() => 
    calls.filter(c => c.is_reconnect && c.showed), [calls]);

  // Commitments from funded_investors with commitment_amount > 0
  const commitments = useMemo(() => 
    fundedInvestors.filter(f => f.commitment_amount && f.commitment_amount > 0), 
    [fundedInvestors]);

  // Create a map of lead IDs to lead names for call display
  const leadNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    leads.forEach(lead => {
      map[lead.id] = lead.name || lead.email || lead.phone || 'Unknown';
    });
    return map;
  }, [leads]);

  const getLeadName = (leadId: string | null) => {
    if (!leadId) return '-';
    return leadNameMap[leadId] || '-';
  };

  // Helper to get linked lead for any record type
  const getLinkedLead = useCallback((record: any, recordType: string): Lead | null => {
    if (recordType === 'lead') return record as Lead;
    
    // For calls, use lead_id
    if (record?.lead_id) {
      return leads.find(l => l.id === record.lead_id) || null;
    }
    
    // For funded/commitments, match by external_id or lead_id
    if (record?.lead_id) {
      return leads.find(l => l.id === record.lead_id) || null;
    }
    if (record?.external_id) {
      return leads.find(l => l.external_id === record.external_id) || null;
    }
    
    return null;
  }, [leads]);

  // Get current selected record's linked lead
  const selectedLinkedLead = useMemo(() => {
    if (!selectedRecord || !selectedType) return null;
    return getLinkedLead(selectedRecord, selectedType);
  }, [selectedRecord, selectedType, getLinkedLead]);

  // Handle sync for selected record
  const handleSelectedRecordSync = useCallback(async () => {
    if (!selectedRecord || !clientId) return;
    
    // Get the external_id to sync
    const externalId = selectedType === 'lead' 
      ? selectedRecord.external_id 
      : selectedLinkedLead?.external_id || selectedRecord.external_id;
    
    if (!externalId) return;
    
    await syncContact(clientId, externalId, 'lead');
  }, [selectedRecord, selectedType, selectedLinkedLead, clientId, syncContact]);

  // Reset page when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    setCurrentPage(1);
    setSearchQuery('');
    setRepFilter('all');
  };

  // Filter data based on search and filters
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((lead) =>
        (lead.name?.toLowerCase().includes(query)) ||
        (lead.email?.toLowerCase().includes(query)) ||
        (lead.phone?.includes(query)) ||
        (lead.source?.toLowerCase().includes(query))
      );
    }
    if (repFilter !== 'all') {
      result = result.filter(lead => lead.assigned_user === repFilter);
    }
    return result;
  }, [leads, searchQuery, repFilter]);

  const filteredBookedCalls = useMemo(() => {
    let result = bookedCalls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    return result;
  }, [bookedCalls, searchQuery]);

  const filteredShowedCalls = useMemo(() => {
    let result = showedCalls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    return result;
  }, [showedCalls, searchQuery]);

  const filteredReconnectCalls = useMemo(() => {
    let result = reconnectCalls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    return result;
  }, [reconnectCalls, searchQuery]);

  const filteredReconnectShowedCalls = useMemo(() => {
    let result = reconnectShowedCalls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    return result;
  }, [reconnectShowedCalls, searchQuery]);

  const filteredAdSpend = useMemo(() => {
    if (!searchQuery) return dailyMetrics;
    const query = searchQuery.toLowerCase();
    return dailyMetrics.filter((m) =>
      m.date.includes(query)
    );
  }, [dailyMetrics, searchQuery]);

  const filteredCommitments = useMemo(() => {
    if (!searchQuery) return commitments;
    const query = searchQuery.toLowerCase();
    return commitments.filter((f) =>
      (f.name?.toLowerCase().includes(query))
    );
  }, [commitments, searchQuery]);

  const filteredFunded = useMemo(() => {
    if (!searchQuery) return fundedInvestors;
    const query = searchQuery.toLowerCase();
    return fundedInvestors.filter((f) =>
      (f.name?.toLowerCase().includes(query))
    );
  }, [fundedInvestors, searchQuery]);

  // Get current data length based on tab
  const currentDataLength = useMemo(() => {
    switch (activeTab) {
      case 'adspend': return filteredAdSpend.length;
      case 'leads': return filteredLeads.length;
      case 'booked': return filteredBookedCalls.length;
      case 'showed': return filteredShowedCalls.length;
      case 'reconnect': return filteredReconnectCalls.length;
      case 'reconnect-showed': return filteredReconnectShowedCalls.length;
      case 'commitments': return filteredCommitments.length;
      case 'funded': return filteredFunded.length;
      default: return 0;
    }
  }, [activeTab, filteredAdSpend.length, filteredLeads.length, filteredBookedCalls.length, filteredShowedCalls.length, filteredReconnectCalls.length, filteredReconnectShowedCalls.length, filteredCommitments.length, filteredFunded.length]);

  const totalPages = Math.ceil(currentDataLength / PAGE_SIZE);
  
  // Paginate each dataset separately
  const paginatedAdSpend = useMemo(() => {
    if (activeTab !== 'adspend') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAdSpend.slice(start, start + PAGE_SIZE);
  }, [filteredAdSpend, currentPage, activeTab]);

  const paginatedLeads = useMemo(() => {
    if (activeTab !== 'leads') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, currentPage, activeTab]);

  const paginatedBookedCalls = useMemo(() => {
    if (activeTab !== 'booked') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBookedCalls.slice(start, start + PAGE_SIZE);
  }, [filteredBookedCalls, currentPage, activeTab]);

  const paginatedShowedCalls = useMemo(() => {
    if (activeTab !== 'showed') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredShowedCalls.slice(start, start + PAGE_SIZE);
  }, [filteredShowedCalls, currentPage, activeTab]);

  const paginatedReconnectCalls = useMemo(() => {
    if (activeTab !== 'reconnect') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredReconnectCalls.slice(start, start + PAGE_SIZE);
  }, [filteredReconnectCalls, currentPage, activeTab]);

  const paginatedReconnectShowedCalls = useMemo(() => {
    if (activeTab !== 'reconnect-showed') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredReconnectShowedCalls.slice(start, start + PAGE_SIZE);
  }, [filteredReconnectShowedCalls, currentPage, activeTab]);

  const paginatedCommitments = useMemo(() => {
    if (activeTab !== 'commitments') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCommitments.slice(start, start + PAGE_SIZE);
  }, [filteredCommitments, currentPage, activeTab]);

  const paginatedFunded = useMemo(() => {
    if (activeTab !== 'funded') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFunded.slice(start, start + PAGE_SIZE);
  }, [filteredFunded, currentPage, activeTab]);

  const paginatedDataLength = useMemo(() => {
    switch (activeTab) {
      case 'adspend': return paginatedAdSpend.length;
      case 'leads': return paginatedLeads.length;
      case 'booked': return paginatedBookedCalls.length;
      case 'showed': return paginatedShowedCalls.length;
      case 'reconnect': return paginatedReconnectCalls.length;
      case 'reconnect-showed': return paginatedReconnectShowedCalls.length;
      case 'commitments': return paginatedCommitments.length;
      case 'funded': return paginatedFunded.length;
      default: return 0;
    }
  }, [activeTab, paginatedAdSpend.length, paginatedLeads.length, paginatedBookedCalls.length, paginatedShowedCalls.length, paginatedReconnectCalls.length, paginatedReconnectShowedCalls.length, paginatedCommitments.length, paginatedFunded.length]);

  const handleExport = (exportAll: boolean) => {
    let data: any[] = [];
    switch (activeTab) {
      case 'adspend': data = exportAll ? filteredAdSpend : paginatedAdSpend; break;
      case 'leads': data = exportAll ? filteredLeads : paginatedLeads; break;
      case 'booked': data = exportAll ? filteredBookedCalls : paginatedBookedCalls; break;
      case 'showed': data = exportAll ? filteredShowedCalls : paginatedShowedCalls; break;
      case 'reconnect': data = exportAll ? filteredReconnectCalls : paginatedReconnectCalls; break;
      case 'reconnect-showed': data = exportAll ? filteredReconnectShowedCalls : paginatedReconnectShowedCalls; break;
      case 'commitments': data = exportAll ? filteredCommitments : paginatedCommitments; break;
      case 'funded': data = exportAll ? filteredFunded : paginatedFunded; break;
    }
    exportToCSV(data, `${activeTab}-${exportAll ? 'all' : 'filtered'}`);
  };

  // CRUD Operations
  const handleAddRecord = async () => {
    if (!clientId) {
      toast.error('Client ID is required');
      return;
    }

    try {
      switch (activeTab) {
        case 'leads': {
          const { error } = await supabase.from('leads').insert({
            client_id: clientId,
            external_id: `manual-${Date.now()}`,
            name: formData.name || null,
            email: formData.email || null,
            phone: formData.phone || null,
            source: formData.source || 'manual',
            status: formData.status || 'new',
            assigned_user: formData.assigned_user || null,
            pipeline_value: formData.pipeline_value ? Number(formData.pipeline_value) : null,
          });
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          break;
        }
        case 'booked':
        case 'showed':
        case 'reconnect':
        case 'reconnect-showed': {
          const isReconnect = activeTab === 'reconnect' || activeTab === 'reconnect-showed';
          const showed = activeTab === 'showed' || activeTab === 'reconnect-showed';
          const { error } = await supabase.from('calls').insert({
            client_id: clientId,
            external_id: `manual-${Date.now()}`,
            scheduled_at: formData.scheduled_at || null,
            showed: formData.showed === 'true' || formData.showed === true || showed,
            outcome: formData.outcome || null,
            is_reconnect: formData.is_reconnect === 'true' || formData.is_reconnect === true || isReconnect,
          });
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['calls'] });
          break;
        }
        case 'adspend': {
          const { error } = await supabase.from('daily_metrics').upsert({
            client_id: clientId,
            date: formData.date,
            ad_spend: Number(formData.ad_spend) || 0,
            impressions: Number(formData.impressions) || 0,
            clicks: Number(formData.clicks) || 0,
            ctr: formData.clicks && formData.impressions 
              ? (Number(formData.clicks) / Number(formData.impressions)) * 100 
              : 0,
          }, { onConflict: 'client_id,date' });
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
          break;
        }
        case 'commitments':
        case 'funded': {
          const { error } = await supabase.from('funded_investors').insert({
            client_id: clientId,
            external_id: `manual-${Date.now()}`,
            name: formData.name || null,
            funded_amount: Number(formData.funded_amount) || 0,
            commitment_amount: Number(formData.commitment_amount) || 0,
            funded_at: formData.funded_at || new Date().toISOString(),
          });
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
          break;
        }
      }
      toast.success('Record added successfully');
      setAddModalOpen(false);
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to add record');
    }
  };

  const handleEditRecord = async () => {
    if (!editingRecord) return;

    try {
      switch (activeTab) {
        case 'leads': {
          const { error } = await supabase.from('leads').update({
            name: formData.name || null,
            email: formData.email || null,
            phone: formData.phone || null,
            source: formData.source || 'manual',
            status: formData.status || 'new',
            assigned_user: formData.assigned_user || null,
            pipeline_value: formData.pipeline_value ? Number(formData.pipeline_value) : null,
          }).eq('id', editingRecord.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          break;
        }
        case 'booked':
        case 'showed':
        case 'reconnect':
        case 'reconnect-showed': {
          const { error } = await supabase.from('calls').update({
            scheduled_at: formData.scheduled_at || null,
            showed: formData.showed === 'true' || formData.showed === true,
            outcome: formData.outcome || null,
            is_reconnect: formData.is_reconnect === 'true' || formData.is_reconnect === true,
          }).eq('id', editingRecord.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['calls'] });
          break;
        }
        case 'adspend': {
          const { error } = await supabase.from('daily_metrics').update({
            ad_spend: Number(formData.ad_spend) || 0,
            impressions: Number(formData.impressions) || 0,
            clicks: Number(formData.clicks) || 0,
            ctr: formData.clicks && formData.impressions 
              ? (Number(formData.clicks) / Number(formData.impressions)) * 100 
              : 0,
          }).eq('id', editingRecord.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
          break;
        }
        case 'commitments':
        case 'funded': {
          const { error } = await supabase.from('funded_investors').update({
            name: formData.name || null,
            funded_amount: Number(formData.funded_amount) || 0,
            commitment_amount: Number(formData.commitment_amount) || 0,
            funded_at: formData.funded_at || new Date().toISOString(),
          }).eq('id', editingRecord.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
          break;
        }
      }
      toast.success('Record updated successfully');
      setEditModalOpen(false);
      setEditingRecord(null);
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to update record');
    }
  };

  const handleDeleteRecord = async (record: any, type: string) => {
    try {
      let queryKey: string[];
      
      switch (type) {
        case 'lead':
        case 'leads': {
          const { error } = await supabase.from('leads').delete().eq('id', record.id);
          if (error) throw error;
          queryKey = ['leads'];
          break;
        }
        case 'call':
        case 'calls':
        case 'booked':
        case 'showed':
        case 'reconnect':
        case 'reconnect-showed': {
          const { error } = await supabase.from('calls').delete().eq('id', record.id);
          if (error) throw error;
          queryKey = ['calls'];
          break;
        }
        case 'adspend': {
          const { error } = await supabase.from('daily_metrics').delete().eq('id', record.id);
          if (error) throw error;
          queryKey = ['daily-metrics'];
          break;
        }
        case 'commitments':
        case 'funded': {
          const { error } = await supabase.from('funded_investors').delete().eq('id', record.id);
          if (error) throw error;
          queryKey = ['funded-investors'];
          break;
        }
        default:
          return;
      }

      queryClient.invalidateQueries({ queryKey });
      toast.success('Record deleted successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete record');
    }
  };

  const openEditModal = (record: any) => {
    setEditingRecord(record);
    switch (activeTab) {
      case 'leads':
        setFormData({
          name: record.name || '',
          email: record.email || '',
          phone: record.phone || '',
          source: record.source || '',
          status: record.status || '',
          assigned_user: record.assigned_user || '',
          pipeline_value: record.pipeline_value || '',
        });
        break;
      case 'booked':
      case 'showed':
      case 'reconnect':
      case 'reconnect-showed':
        setFormData({
          scheduled_at: record.scheduled_at?.slice(0, 16) || '',
          showed: record.showed ? 'true' : 'false',
          outcome: record.outcome || '',
          is_reconnect: record.is_reconnect ? 'true' : 'false',
        });
        break;
      case 'adspend':
        setFormData({
          date: record.date || '',
          ad_spend: record.ad_spend || '',
          impressions: record.impressions || '',
          clicks: record.clicks || '',
        });
        break;
      case 'commitments':
      case 'funded':
        setFormData({
          name: record.name || '',
          funded_amount: record.funded_amount || '',
          commitment_amount: record.commitment_amount || '',
          funded_at: record.funded_at?.slice(0, 10) || '',
        });
        break;
    }
    setEditModalOpen(true);
  };

  const openAddModal = () => {
    setFormData({});
    if (activeTab === 'adspend') {
      setFormData({ date: new Date().toISOString().slice(0, 10) });
    }
    setAddModalOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-border">
        <CardContent className="py-8">
          <CashBagLoader message="Loading records..." />
        </CardContent>
      </Card>
    );
  }

  const renderFormFields = () => {
    switch (activeTab) {
      case 'leads':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input 
                  value={formData.name || ''} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Lead name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={formData.email || ''} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input 
                  value={formData.phone || ''} 
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Input 
                  value={formData.source || ''} 
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="facebook, google, etc."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status || 'new'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Rep</Label>
                <Input 
                  value={formData.assigned_user || ''} 
                  onChange={(e) => setFormData({ ...formData, assigned_user: e.target.value })}
                  placeholder="Rep name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pipeline Value ($)</Label>
              <Input 
                type="number"
                value={formData.pipeline_value || ''} 
                onChange={(e) => setFormData({ ...formData, pipeline_value: e.target.value })}
                placeholder="0"
              />
            </div>
          </>
        );
      case 'booked':
      case 'showed':
      case 'reconnect':
      case 'reconnect-showed':
        return (
          <>
            <div className="space-y-2">
              <Label>Scheduled Date/Time</Label>
              <Input 
                type="datetime-local"
                value={formData.scheduled_at || ''} 
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Showed</Label>
                <Select value={formData.showed || 'false'} onValueChange={(v) => setFormData({ ...formData, showed: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.is_reconnect || 'false'} onValueChange={(v) => setFormData({ ...formData, is_reconnect: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Initial Call</SelectItem>
                    <SelectItem value="true">Reconnect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Input 
                value={formData.outcome || ''} 
                onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                placeholder="Call outcome"
              />
            </div>
          </>
        );
      case 'adspend':
        return (
          <>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date"
                value={formData.date || ''} 
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Ad Spend ($)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={formData.ad_spend || ''} 
                  onChange={(e) => setFormData({ ...formData, ad_spend: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Impressions</Label>
                <Input 
                  type="number"
                  value={formData.impressions || ''} 
                  onChange={(e) => setFormData({ ...formData, impressions: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Clicks</Label>
                <Input 
                  type="number"
                  value={formData.clicks || ''} 
                  onChange={(e) => setFormData({ ...formData, clicks: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </>
        );
      case 'commitments':
        return (
          <>
            <div className="space-y-2">
              <Label>Investor Name</Label>
              <Input 
                value={formData.name || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Investor name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commitment Amount ($)</Label>
                <Input 
                  type="number"
                  value={formData.commitment_amount || ''} 
                  onChange={(e) => setFormData({ ...formData, commitment_amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Commitment Date</Label>
                <Input 
                  type="date"
                  value={formData.funded_at || ''} 
                  onChange={(e) => setFormData({ ...formData, funded_at: e.target.value })}
                />
              </div>
            </div>
          </>
        );
      case 'funded':
        return (
          <>
            <div className="space-y-2">
              <Label>Investor Name</Label>
              <Input 
                value={formData.name || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Investor name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Funded Amount ($)</Label>
                <Input 
                  type="number"
                  value={formData.funded_amount || ''} 
                  onChange={(e) => setFormData({ ...formData, funded_amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Funded Date</Label>
                <Input 
                  type="date"
                  value={formData.funded_at || ''} 
                  onChange={(e) => setFormData({ ...formData, funded_at: e.target.value })}
                />
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'adspend': return 'Ad Spend';
      case 'leads': return 'Lead';
      case 'booked': return 'Booked Call';
      case 'showed': return 'Showed Call';
      case 'reconnect': return 'Reconnect Call';
      case 'reconnect-showed': return 'Reconnect Showed';
      case 'commitments': return 'Commitment';
      case 'funded': return 'Funded Investor';
      default: return 'Record';
    }
  };

  // Render call table row (reused across multiple tabs)
  const renderCallRow = (call: Call, tabType: string) => (
    <TableRow
      key={call.id}
      className={`cursor-pointer hover:bg-muted/50 ${
        selectedRecord?.id === call.id && selectedType === 'call'
          ? 'bg-primary/10'
          : ''
      }`}
      onClick={() => onRecordSelect?.(call, 'call')}
    >
      <TableCell className="font-mono text-sm">
        {call.scheduled_at
          ? new Date(call.scheduled_at).toLocaleString()
          : '-'}
      </TableCell>
      <TableCell className="font-medium">{getLeadName(call.lead_id)}</TableCell>
      <TableCell>
        {call.direction === 'inbound' ? (
          <PhoneIncoming className="h-4 w-4 text-chart-2" />
        ) : (
          <PhoneOutgoing className="h-4 w-4 text-chart-1" />
        )}
      </TableCell>
      <TableCell>
        {call.showed ? (
          <Badge className="bg-chart-2 text-chart-2-foreground">Showed</Badge>
        ) : (
          <Badge variant="secondary">No Show</Badge>
        )}
      </TableCell>
      <TableCell>{call.outcome || '-'}</TableCell>
      <TableCell className="font-mono text-sm">
        {new Date(call.created_at).toLocaleDateString()}
      </TableCell>
      {ghlLocationId && (
        <TableCell>
          {call.external_id && !call.external_id.startsWith('wh_') && !call.external_id.startsWith('manual-') ? (
            <a 
              href={getGHLContactUrl(ghlLocationId, call.external_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : '-'}
        </TableCell>
      )}
      {ghlLocationId && (
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-xs ${
                !call.ghl_synced_at 
                  ? 'text-muted-foreground' 
                  : new Date(call.ghl_synced_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)
                    ? 'text-amber-500'
                    : 'text-chart-2'
              }`}>
                {formatLastSync(call.ghl_synced_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <p><strong>Last Sync:</strong> {call.ghl_synced_at ? new Date(call.ghl_synced_at).toLocaleString() : 'Never'}</p>
                <p><strong>GHL ID:</strong> {call.external_id || 'N/A'}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TableCell>
      )}
      {ghlLocationId && clientId && (
        <TableCell>
          {canSyncFromGHL(call.external_id, !!ghlLocationId) ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isSyncing(call.external_id)}
              onClick={(e) => handleSyncClick(e, call.external_id, 'call')}
            >
              {isSyncing(call.external_id) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : '-'}
        </TableCell>
      )}
      {clientId && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); openEditModal(call); }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Call?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this call record.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteRecord(call, tabType)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      )}
    </TableRow>
  );

  // Render call table (reused across multiple tabs)
  const renderCallTable = (callData: Call[], tabType: string) => (
    <ScrollArea className="h-[400px]">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2">
            <TableHead>Scheduled</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Dir</TableHead>
            <TableHead>Showed</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Created</TableHead>
            {ghlLocationId && <TableHead>GHL</TableHead>}
            {ghlLocationId && <TableHead>Last Sync</TableHead>}
            {ghlLocationId && clientId && <TableHead>Sync</TableHead>}
            {clientId && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {callData.map((call) => renderCallRow(call, tabType))}
        </TableBody>
      </Table>
    </ScrollArea>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Records Table */}
      <div className="lg:col-span-2">
        <Card className="border-2 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Detailed Records</CardTitle>
              <div className="flex items-center gap-2">
                {clientId && (
                  <Button variant="outline" size="sm" onClick={openAddModal}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add {getTabLabel()}
                  </Button>
                )}
                <Select onValueChange={(v) => handleExport(v === 'all')}>
                  <SelectTrigger className="w-36">
                    <Download className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Export" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filtered">Export Filtered</SelectItem>
                    <SelectItem value="all">Export All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="adspend" className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  Ad Spend ({dailyMetrics.length})
                </TabsTrigger>
                <TabsTrigger value="leads" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Leads ({leads.length})
                </TabsTrigger>
                <TabsTrigger value="booked" className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  Booked ({bookedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="showed" className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Showed ({showedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="reconnect" className="flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" />
                  Reconnect ({reconnectCalls.length})
                </TabsTrigger>
                <TabsTrigger value="reconnect-showed" className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Rec. Showed ({reconnectShowedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="commitments" className="flex items-center gap-1">
                  <Handshake className="h-4 w-4" />
                  Commitments ({commitments.length})
                </TabsTrigger>
                <TabsTrigger value="funded" className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Funded ({fundedInvestors.length})
                </TabsTrigger>
              </TabsList>

              {/* Filters */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="max-w-sm"
                />
                
                {/* Rep Filter for Leads */}
                {activeTab === 'leads' && uniqueReps.length > 0 && (
                  <Select value={repFilter} onValueChange={setRepFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by Rep" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reps</SelectItem>
                      {uniqueReps.map((rep) => (
                        <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                <span className="text-sm text-muted-foreground">
                  Showing {paginatedDataLength} of {currentDataLength}
                </span>
              </div>

              {/* Ad Spend Tab */}
              <TabsContent value="adspend" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Ad Spend</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAdSpend.map((metric) => (
                        <TableRow
                          key={metric.id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedRecord?.id === metric.id && selectedType === 'adspend'
                              ? 'bg-primary/10'
                              : ''
                          }`}
                          onClick={() => onRecordSelect?.(metric, 'adspend')}
                        >
                          <TableCell className="font-mono">{metric.date}</TableCell>
                          <TableCell className="text-right font-mono text-chart-1">
                            ${Number(metric.ad_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(metric.impressions || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(metric.clicks || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(metric.ctr || 0).toFixed(2)}%
                          </TableCell>
                          {clientId && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(metric); }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Ad Spend Record?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete this ad spend record.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRecord(metric, 'adspend')}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Leads Tab */}
              <TabsContent value="leads" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Ad Set</TableHead>
                        <TableHead>Ad ID</TableHead>
                        <TableHead>Rep</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Questions</TableHead>
                        {ghlLocationId && <TableHead>GHL</TableHead>}
                        {ghlLocationId && <TableHead>Last Sync</TableHead>}
                        {ghlLocationId && clientId && <TableHead>Sync</TableHead>}
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedLeads.map((lead) => (
                        <TableRow
                          key={lead.id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedRecord?.id === lead.id && selectedType === 'lead'
                              ? 'bg-primary/10'
                              : ''
                          }`}
                          onClick={() => onRecordSelect?.(lead, 'lead')}
                        >
                          <TableCell className="font-mono text-sm">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium">{lead.name || 'Unknown'}</TableCell>
                          <TableCell>{lead.email || '-'}</TableCell>
                          <TableCell>{lead.phone || '-'}</TableCell>
                          <TableCell><Badge variant="outline">{lead.source}</Badge></TableCell>
                          <TableCell className="max-w-[120px] truncate text-xs" title={lead.campaign_name || ''}>
                            {lead.campaign_name || '-'}
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate text-xs" title={lead.ad_set_name || ''}>
                            {lead.ad_set_name || '-'}
                          </TableCell>
                          <TableCell className="max-w-[80px] truncate text-xs" title={lead.ad_id || ''}>
                            {lead.ad_id || '-'}
                          </TableCell>
                          <TableCell>{lead.assigned_user || '-'}</TableCell>
                          <TableCell>
                            {lead.is_spam ? (
                              <Badge variant="destructive">Spam</Badge>
                            ) : (
                              <Badge className="bg-chart-2 text-chart-2-foreground">{lead.status || 'new'}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {lead.questions && Array.isArray(lead.questions) && lead.questions.length > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                {lead.questions.length} Q&A
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          {ghlLocationId && (
                            <TableCell>
                              {lead.external_id && !lead.external_id.startsWith('wh_') && !lead.external_id.startsWith('manual-') ? (
                                <a 
                                  href={getGHLContactUrl(ghlLocationId, lead.external_id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : '-'}
                            </TableCell>
                          )}
                          {ghlLocationId && (
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`text-xs ${
                                    !lead.ghl_synced_at 
                                      ? 'text-muted-foreground' 
                                      : new Date(lead.ghl_synced_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)
                                        ? 'text-amber-500'
                                        : 'text-chart-2'
                                  }`}>
                                    {formatLastSync(lead.ghl_synced_at)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs space-y-1">
                                    <p><strong>Last Sync:</strong> {lead.ghl_synced_at ? new Date(lead.ghl_synced_at).toLocaleString() : 'Never'}</p>
                                    <p><strong>GHL ID:</strong> {lead.external_id || 'N/A'}</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          )}
                          {ghlLocationId && clientId && (
                            <TableCell>
                              {canSyncFromGHL(lead.external_id, !!ghlLocationId) ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={isSyncing(lead.external_id)}
                                  onClick={(e) => handleSyncClick(e, lead.external_id, 'lead')}
                                >
                                  {isSyncing(lead.external_id) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              ) : '-'}
                            </TableCell>
                          )}
                          {clientId && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(lead); }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete this lead and all associated data.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRecord(lead, 'leads')}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Booked Calls Tab */}
              <TabsContent value="booked" className="mt-0">
                {renderCallTable(paginatedBookedCalls, 'booked')}
              </TabsContent>

              {/* Showed Calls Tab */}
              <TabsContent value="showed" className="mt-0">
                {renderCallTable(paginatedShowedCalls, 'showed')}
              </TabsContent>

              {/* Reconnect Calls Tab */}
              <TabsContent value="reconnect" className="mt-0">
                {renderCallTable(paginatedReconnectCalls, 'reconnect')}
              </TabsContent>

              {/* Reconnect Showed Tab */}
              <TabsContent value="reconnect-showed" className="mt-0">
                {renderCallTable(paginatedReconnectShowedCalls, 'reconnect-showed')}
              </TabsContent>

              {/* Commitments Tab */}
              <TabsContent value="commitments" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Commitment</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Time to Commit</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        {ghlLocationId && <TableHead>GHL</TableHead>}
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCommitments.map((investor) => (
                        <TableRow
                          key={investor.id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedRecord?.id === investor.id && selectedType === 'commitment'
                              ? 'bg-primary/10'
                              : ''
                          }`}
                          onClick={() => onRecordSelect?.(investor, 'commitment')}
                        >
                          <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                          <TableCell className="text-right font-mono text-chart-4">
                            ${Number(investor.commitment_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {new Date(investor.funded_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days}d` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">{investor.calls_to_fund || 0}</TableCell>
                          {ghlLocationId && (
                            <TableCell>
                              {investor.external_id && !investor.external_id.startsWith('wh_') && !investor.external_id.startsWith('manual-') ? (
                                <a 
                                  href={getGHLContactUrl(ghlLocationId, investor.external_id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : '-'}
                            </TableCell>
                          )}
                          {clientId && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(investor); }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Commitment?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete this commitment record.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRecord(investor, 'commitments')}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Funded Tab */}
              <TabsContent value="funded" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Funded Date</TableHead>
                        <TableHead className="text-right">Time to Fund</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        {ghlLocationId && <TableHead>GHL</TableHead>}
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedFunded.map((investor) => (
                        <TableRow
                          key={investor.id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedRecord?.id === investor.id && selectedType === 'funded'
                              ? 'bg-primary/10'
                              : ''
                          }`}
                          onClick={() => onRecordSelect?.(investor, 'funded')}
                        >
                          <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                          <TableCell className="text-right font-mono text-chart-2">
                            ${Number(investor.funded_amount).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {new Date(investor.funded_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days}d` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">{investor.calls_to_fund || 0}</TableCell>
                          {ghlLocationId && (
                            <TableCell>
                              {investor.external_id && !investor.external_id.startsWith('wh_') && !investor.external_id.startsWith('manual-') ? (
                                <a 
                                  href={getGHLContactUrl(ghlLocationId, investor.external_id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : '-'}
                            </TableCell>
                          )}
                          {clientId && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(investor); }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Funded Investor?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete this funded investor record.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRecord(investor, 'funded')}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Record Details Panel */}
      <div className="lg:col-span-1">
        <Card className="border-2 border-border sticky top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Record Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRecord ? (
              <ScrollArea className="h-[calc(100vh-200px)] pr-2">
              <div className="space-y-4">
                {/* GHL Integration Section - Top of Record Details */}
                <RecordDetailsGHLSection
                  record={selectedRecord}
                  recordType={selectedType || ''}
                  ghlLocationId={ghlLocationId || null}
                  linkedLead={selectedLinkedLead}
                  onSync={handleSelectedRecordSync}
                  isSyncing={isSyncing(
                    selectedType === 'lead' 
                      ? selectedRecord.external_id 
                      : selectedLinkedLead?.external_id || selectedRecord.external_id || ''
                  )}
                />

                {/* Linked Contact Info for non-lead records */}
                {selectedType !== 'lead' && selectedType !== 'adspend' && selectedLinkedLead && (
                  <LinkedContactInfo lead={selectedLinkedLead} />
                )}

                {/* Timeline */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timeline
                  </h4>
                  <div className="pl-6 border-l-2 border-border space-y-2">
                    {selectedType === 'lead' && (
                      <>
                        <div className="relative">
                          <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-1" />
                          <p className="text-sm">
                            <span className="text-muted-foreground">Created:</span>{' '}
                            {new Date(selectedRecord.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-2" />
                          <p className="text-sm">
                            <span className="text-muted-foreground">Updated:</span>{' '}
                            {new Date(selectedRecord.updated_at).toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}
                    {selectedType === 'call' && (
                      <>
                        {selectedRecord.scheduled_at && (
                          <div className="relative">
                            <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-1" />
                            <p className="text-sm">
                              <span className="text-muted-foreground">Scheduled:</span>{' '}
                              {new Date(selectedRecord.scheduled_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                        <div className="relative">
                          <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-2" />
                          <p className="text-sm">
                            <span className="text-muted-foreground">Created:</span>{' '}
                            {new Date(selectedRecord.created_at).toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}
                    {(selectedType === 'funded' || selectedType === 'commitment') && (
                      <>
                        {selectedRecord.first_contact_at && (
                          <div className="relative">
                            <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-1" />
                            <p className="text-sm">
                              <span className="text-muted-foreground">First Contact:</span>{' '}
                              {new Date(selectedRecord.first_contact_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                        <div className="relative">
                          <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-2" />
                          <p className="text-sm">
                            <span className="text-muted-foreground">Funded:</span>{' '}
                            {new Date(selectedRecord.funded_at).toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}
                    {selectedType === 'adspend' && (
                      <div className="relative">
                        <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-1" />
                        <p className="text-sm">
                          <span className="text-muted-foreground">Date:</span>{' '}
                          {selectedRecord.date}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Journey for Leads - Show linked calls */}
                {selectedType === 'lead' && (() => {
                  // Find all calls linked to this lead
                  const linkedCalls = calls.filter(c => 
                    c.lead_id === selectedRecord.id || 
                    c.external_id === selectedRecord.external_id
                  ).sort((a, b) => {
                    const dateA = a.scheduled_at || a.created_at;
                    const dateB = b.scheduled_at || b.created_at;
                    return new Date(dateA).getTime() - new Date(dateB).getTime();
                  });
                  
                  // Find linked funded investor
                  const linkedFunded = fundedInvestors.find(f => 
                    f.lead_id === selectedRecord.id || 
                    f.external_id === selectedRecord.external_id
                  );
                  
                  if (linkedCalls.length === 0 && !linkedFunded) return null;
                  
                  return (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Customer Journey
                      </h4>
                      <div className="pl-6 border-l-2 border-primary/30 space-y-3">
                        {/* Lead Created */}
                        <div className="relative">
                          <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-chart-1" />
                          <p className="text-sm font-medium">Lead Created</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(selectedRecord.created_at).toLocaleString()}
                          </p>
                        </div>
                        
                        {/* Calls */}
                        {linkedCalls.map((call, idx) => {
                          // Determine call status label based on outcome field
                          const getCallStatusLabel = () => {
                            const outcome = call.outcome?.toLowerCase();
                            if (outcome === 'no_show' || outcome === 'noshow' || outcome === 'no-show') {
                              return { label: 'No Show', color: 'bg-destructive' };
                            }
                            if (outcome === 'rescheduled') {
                              return { label: 'Rescheduled', color: 'bg-amber-500' };
                            }
                            if (call.showed) {
                              return { label: 'Showed', color: 'bg-chart-2' };
                            }
                            if (outcome === 'confirmed' || outcome === 'booked') {
                              return { label: 'Confirmed', color: 'bg-chart-4' };
                            }
                            // Default: Booked (not yet confirmed, showed, or no-show)
                            return { label: 'Booked', color: 'bg-chart-3' };
                          };
                          
                          const status = getCallStatusLabel();
                          const callDate = call.scheduled_at || call.created_at;
                          
                          return (
                            <div key={call.id} className="relative">
                              <div className={`absolute -left-[25px] w-3 h-3 rounded-full ${status.color}`} />
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                  {call.is_reconnect ? 'Reconnect Call' : 'Call'} - {status.label}
                                </p>
                                <Badge variant="outline" className="text-[10px] h-4">
                                  {call.is_reconnect ? 'RC' : '#' + (idx + 1)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {new Date(callDate).toLocaleString()}
                              </p>
                              {call.outcome && call.outcome !== status.label.toLowerCase() && (
                                <p className="text-xs text-muted-foreground">
                                  Outcome: {call.outcome}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        
                        {/* Funded */}
                        {linkedFunded && (
                          <div className="relative">
                            <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-primary" />
                            <p className="text-sm font-medium">
                              Funded - ${Number(linkedFunded.funded_amount || 0).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(linkedFunded.funded_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Contact Info for Leads */}
                {selectedType === 'lead' && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contact Info
                    </h4>
                    <div className="space-y-1 text-sm">
                      {selectedRecord.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <a href={`mailto:${selectedRecord.email}`} className="text-primary hover:underline">
                            {selectedRecord.email}
                          </a>
                        </div>
                      )}
                      {selectedRecord.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <a href={`tel:${selectedRecord.phone}`} className="text-primary hover:underline">
                            {selectedRecord.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* UTM Parameters for Leads */}
                {selectedType === 'lead' && (selectedRecord.utm_source || selectedRecord.utm_campaign) && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      UTM Parameters
                    </h4>
                    <div className="space-y-1 text-sm">
                      {selectedRecord.utm_source && (
                        <p><span className="text-muted-foreground">Source:</span> {selectedRecord.utm_source}</p>
                      )}
                      {selectedRecord.utm_medium && (
                        <p><span className="text-muted-foreground">Medium:</span> {selectedRecord.utm_medium}</p>
                      )}
                      {selectedRecord.utm_campaign && (
                        <p><span className="text-muted-foreground">Campaign:</span> {selectedRecord.utm_campaign}</p>
                      )}
                      {selectedRecord.utm_content && (
                        <p><span className="text-muted-foreground">Content:</span> {selectedRecord.utm_content}</p>
                      )}
                      {selectedRecord.utm_term && (
                        <p><span className="text-muted-foreground">Term:</span> {selectedRecord.utm_term}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Questions for Leads */}
                {selectedType === 'lead' && selectedRecord.questions && Array.isArray(selectedRecord.questions) && selectedRecord.questions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Form Questions</h4>
                    <div className="space-y-2 text-sm">
                      {selectedRecord.questions.map((q: any, idx: number) => (
                        <div key={idx} className="bg-muted/50 p-2 rounded">
                          <p className="text-muted-foreground text-xs">{q.question}</p>
                          <p className="font-medium">{String(q.answer)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Call Details */}
                {selectedType === 'call' && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Call Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Showed:</span> {selectedRecord.showed ? 'Yes' : 'No'}</p>
                      <p><span className="text-muted-foreground">Type:</span> {selectedRecord.is_reconnect ? 'Reconnect' : 'Initial'}</p>
                      {selectedRecord.outcome && (
                        <p><span className="text-muted-foreground">Outcome:</span> {selectedRecord.outcome}</p>
                      )}
                      {selectedRecord.quality_score && (
                        <p><span className="text-muted-foreground">Quality:</span> {selectedRecord.quality_score}/10</p>
                      )}
                      {selectedRecord.summary && (
                        <div className="mt-2">
                          <p className="text-muted-foreground mb-1">Summary:</p>
                          <p className="bg-muted/50 p-2 rounded text-xs">{selectedRecord.summary}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ad Spend Details */}
                {selectedType === 'adspend' && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Metrics</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">Ad Spend</p>
                        <p className="font-mono font-medium">${Number(selectedRecord.ad_spend || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">Impressions</p>
                        <p className="font-mono font-medium">{(selectedRecord.impressions || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">Clicks</p>
                        <p className="font-mono font-medium">{(selectedRecord.clicks || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">CTR</p>
                        <p className="font-mono font-medium">{(selectedRecord.ctr || 0).toFixed(2)}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Funded/Commitment Details */}
                {(selectedType === 'funded' || selectedType === 'commitment') && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Investment Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {selectedRecord.commitment_amount > 0 && (
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-muted-foreground text-xs">Commitment</p>
                          <p className="font-mono font-medium">${Number(selectedRecord.commitment_amount).toLocaleString()}</p>
                        </div>
                      )}
                      {selectedRecord.funded_amount > 0 && (
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-muted-foreground text-xs">Funded</p>
                          <p className="font-mono font-medium">${Number(selectedRecord.funded_amount).toLocaleString()}</p>
                        </div>
                      )}
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">Time to Fund</p>
                        <p className="font-mono font-medium">
                          {selectedRecord.time_to_fund_days !== null ? `${selectedRecord.time_to_fund_days} days` : '-'}
                        </p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground text-xs">Calls to Fund</p>
                        <p className="font-mono font-medium">{selectedRecord.calls_to_fund || 0}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Select a record to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Record Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {getTabLabel()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {renderFormFields()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRecord}>
              Add Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Record Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {getTabLabel()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {renderFormFields()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditRecord}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}