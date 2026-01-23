import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { exportToCSV } from '@/lib/exportUtils';
import { DailyMetric } from '@/hooks/useMetrics';
import { Lead, Call } from '@/hooks/useLeadsAndCalls';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
}

const PAGE_SIZE = 150;

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
}: InlineRecordsViewProps) {
  const [activeTab, setActiveTab] = useState('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [repFilter, setRepFilter] = useState<string>('all');
  const [callTypeFilter, setCallTypeFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Form states for adding/editing records
  const [formData, setFormData] = useState<any>({});

  // Get unique reps from leads
  const uniqueReps = useMemo(() => {
    const reps = new Set<string>();
    leads.forEach(lead => {
      if (lead.assigned_user) reps.add(lead.assigned_user);
    });
    return Array.from(reps);
  }, [leads]);

  // Filter showed calls from all calls
  const showedCalls = useMemo(() => calls.filter(c => c.showed), [calls]);

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

  // Reset page when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchQuery('');
    setRepFilter('all');
    setCallTypeFilter('all');
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

  const filteredCalls = useMemo(() => {
    let result = calls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    if (callTypeFilter === 'reconnect') {
      result = result.filter(c => c.is_reconnect);
    } else if (callTypeFilter === 'initial') {
      result = result.filter(c => !c.is_reconnect);
    }
    return result;
  }, [calls, searchQuery, callTypeFilter]);

  const filteredShowedCalls = useMemo(() => {
    let result = showedCalls;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((call) =>
        (call.outcome?.toLowerCase().includes(query)) ||
        (call.scheduled_at?.includes(query))
      );
    }
    if (callTypeFilter === 'reconnect') {
      result = result.filter(c => c.is_reconnect);
    } else if (callTypeFilter === 'initial') {
      result = result.filter(c => !c.is_reconnect);
    }
    return result;
  }, [showedCalls, searchQuery, callTypeFilter]);

  const filteredAdSpend = useMemo(() => {
    if (!searchQuery) return dailyMetrics;
    const query = searchQuery.toLowerCase();
    return dailyMetrics.filter((m) =>
      m.date.includes(query)
    );
  }, [dailyMetrics, searchQuery]);

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
      case 'leads': return filteredLeads.length;
      case 'calls': return filteredCalls.length;
      case 'showed': return filteredShowedCalls.length;
      case 'adspend': return filteredAdSpend.length;
      case 'funded': return filteredFunded.length;
      default: return 0;
    }
  }, [activeTab, filteredLeads.length, filteredCalls.length, filteredShowedCalls.length, filteredAdSpend.length, filteredFunded.length]);

  const totalPages = Math.ceil(currentDataLength / PAGE_SIZE);
  
  // Paginate each dataset separately
  const paginatedLeads = useMemo(() => {
    if (activeTab !== 'leads') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, currentPage, activeTab]);

  const paginatedCalls = useMemo(() => {
    if (activeTab !== 'calls') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCalls.slice(start, start + PAGE_SIZE);
  }, [filteredCalls, currentPage, activeTab]);

  const paginatedShowedCalls = useMemo(() => {
    if (activeTab !== 'showed') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredShowedCalls.slice(start, start + PAGE_SIZE);
  }, [filteredShowedCalls, currentPage, activeTab]);

  const paginatedAdSpend = useMemo(() => {
    if (activeTab !== 'adspend') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAdSpend.slice(start, start + PAGE_SIZE);
  }, [filteredAdSpend, currentPage, activeTab]);

  const paginatedFunded = useMemo(() => {
    if (activeTab !== 'funded') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFunded.slice(start, start + PAGE_SIZE);
  }, [filteredFunded, currentPage, activeTab]);

  const paginatedDataLength = useMemo(() => {
    switch (activeTab) {
      case 'leads': return paginatedLeads.length;
      case 'calls': return paginatedCalls.length;
      case 'showed': return paginatedShowedCalls.length;
      case 'adspend': return paginatedAdSpend.length;
      case 'funded': return paginatedFunded.length;
      default: return 0;
    }
  }, [activeTab, paginatedLeads.length, paginatedCalls.length, paginatedShowedCalls.length, paginatedAdSpend.length, paginatedFunded.length]);

  const handleExport = (exportAll: boolean) => {
    let data: any[] = [];
    switch (activeTab) {
      case 'leads': data = exportAll ? filteredLeads : paginatedLeads; break;
      case 'calls': data = exportAll ? filteredCalls : paginatedCalls; break;
      case 'showed': data = exportAll ? filteredShowedCalls : paginatedShowedCalls; break;
      case 'adspend': data = exportAll ? filteredAdSpend : paginatedAdSpend; break;
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
        case 'calls':
        case 'showed': {
          const { error } = await supabase.from('calls').insert({
            client_id: clientId,
            external_id: `manual-${Date.now()}`,
            scheduled_at: formData.scheduled_at || null,
            showed: formData.showed === 'true' || formData.showed === true,
            outcome: formData.outcome || null,
            is_reconnect: formData.is_reconnect === 'true' || formData.is_reconnect === true,
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
        case 'funded': {
          const { error } = await supabase.from('funded_investors').insert({
            client_id: clientId,
            external_id: `manual-${Date.now()}`,
            name: formData.name || null,
            funded_amount: Number(formData.funded_amount) || 0,
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
        case 'calls':
        case 'showed': {
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
        case 'funded': {
          const { error } = await supabase.from('funded_investors').update({
            name: formData.name || null,
            funded_amount: Number(formData.funded_amount) || 0,
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
        case 'showed': {
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
      case 'calls':
      case 'showed':
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
      case 'funded':
        setFormData({
          name: record.name || '',
          funded_amount: record.funded_amount || '',
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
      case 'calls':
      case 'showed':
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
      case 'leads': return 'Lead';
      case 'calls': return 'Call';
      case 'showed': return 'Showed Call';
      case 'adspend': return 'Ad Spend';
      case 'funded': return 'Funded Investor';
      default: return 'Record';
    }
  };

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
              <TabsList className="mb-4">
                <TabsTrigger value="leads" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Leads ({leads.length})
                </TabsTrigger>
                <TabsTrigger value="calls" className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  Calls ({calls.length})
                </TabsTrigger>
                <TabsTrigger value="showed" className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Showed ({showedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="adspend" className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  Ad Spend ({dailyMetrics.length})
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

                {/* Call Type Filter */}
                {(activeTab === 'calls' || activeTab === 'showed') && (
                  <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Call Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="initial">Initial</SelectItem>
                      <SelectItem value="reconnect">Reconnect</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                
                <span className="text-sm text-muted-foreground">
                  Showing {paginatedDataLength} of {currentDataLength}
                </span>
              </div>

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
                              <Badge className="bg-green-600">{lead.status || 'new'}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {lead.questions && Array.isArray(lead.questions) && lead.questions.length > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                {lead.questions.length} Q&A
                              </Badge>
                            ) : '-'}
                          </TableCell>
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
                                        This will permanently delete this lead record.
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

              {/* Calls Tab */}
              <TabsContent value="calls" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Created</TableHead>
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCalls.map((call) => (
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
                            {call.showed ? (
                              <Badge className="bg-green-600">Showed</Badge>
                            ) : (
                              <Badge variant="secondary">No Show</Badge>
                            )}
                          </TableCell>
                          <TableCell>{call.outcome || '-'}</TableCell>
                          <TableCell>
                            {call.is_reconnect ? (
                              <Badge variant="outline">Reconnect</Badge>
                            ) : (
                              <Badge variant="outline">Initial</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {new Date(call.created_at).toLocaleDateString()}
                          </TableCell>
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
                                      <AlertDialogAction onClick={() => handleDeleteRecord(call, 'calls')}>
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

              {/* Showed Calls Tab */}
              <TabsContent value="showed" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>Created</TableHead>
                        {clientId && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedShowedCalls.map((call) => (
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
                          <TableCell>{call.outcome || '-'}</TableCell>
                          <TableCell>
                            {call.is_reconnect ? (
                              <Badge variant="outline">Reconnect</Badge>
                            ) : (
                              <Badge variant="outline">Initial</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {call.quality_score ? (
                              <Badge variant={call.quality_score >= 7 ? 'default' : call.quality_score >= 4 ? 'secondary' : 'destructive'}>
                                {call.quality_score}/10
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {new Date(call.created_at).toLocaleDateString()}
                          </TableCell>
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
                                      <AlertDialogAction onClick={() => handleDeleteRecord(call, 'calls')}>
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
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Panel */}
      <div className="lg:col-span-1">
        <Card className="border-2 border-border sticky top-4">
          <CardHeader>
            <CardTitle className="text-lg">Record Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRecord ? (
              <RecordActivityPanel 
                record={selectedRecord} 
                type={selectedType || ''} 
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a record to view activity</p>
                <p className="text-sm">Click on any row to see details</p>
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
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRecord}>Add {getTabLabel()}</Button>
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
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleEditRecord}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Activity panel component
function RecordActivityPanel({ record, type }: { record: any; type: string }) {
  const getTimeline = () => {
    const events: { date: string; label: string; icon: React.ReactNode }[] = [];

    if (type === 'lead') {
      events.push({
        date: record.created_at,
        label: 'Lead Created',
        icon: <User className="h-4 w-4" />,
      });
      if (record.status && record.status !== 'new') {
        events.push({
          date: record.updated_at,
          label: `Status: ${record.status}`,
          icon: <Clock className="h-4 w-4" />,
        });
      }
    } else if (type === 'call') {
      events.push({
        date: record.created_at,
        label: 'Call Booked',
        icon: <Phone className="h-4 w-4" />,
      });
      if (record.scheduled_at) {
        events.push({
          date: record.scheduled_at,
          label: record.showed ? 'Showed' : 'No Show',
          icon: <Calendar className="h-4 w-4" />,
        });
      }
    } else if (type === 'funded') {
      if (record.first_contact_at) {
        events.push({
          date: record.first_contact_at,
          label: 'First Contact',
          icon: <User className="h-4 w-4" />,
        });
      }
      events.push({
        date: record.funded_at,
        label: `Funded: $${Number(record.funded_amount).toLocaleString()}`,
        icon: <TrendingUp className="h-4 w-4" />,
      });
    } else if (type === 'adspend') {
      events.push({
        date: record.date,
        label: `Ad Spend: $${Number(record.ad_spend || 0).toFixed(2)}`,
        icon: <DollarSign className="h-4 w-4" />,
      });
    }

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const timeline = getTimeline();

  return (
    <div className="space-y-6">
      {/* Contact Info for Lead */}
      {type === 'lead' && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase">Contact Info</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{record.name || 'Unknown'}</span>
            </div>
            {record.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{record.email}</span>
              </div>
            )}
            {record.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{record.phone}</span>
              </div>
            )}
            {record.source && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline">{record.source}</Badge>
              </div>
            )}
            {record.assigned_user && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Rep: {record.assigned_user}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UTM Info */}
      {type === 'lead' && (record.utm_source || record.utm_campaign || record.utm_medium) && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground uppercase">UTM Data</h4>
          <div className="text-sm space-y-1">
            {record.utm_source && <p><span className="text-muted-foreground">Source:</span> {record.utm_source}</p>}
            {record.utm_medium && <p><span className="text-muted-foreground">Medium:</span> {record.utm_medium}</p>}
            {record.utm_campaign && <p><span className="text-muted-foreground">Campaign:</span> {record.utm_campaign}</p>}
            {record.utm_content && <p><span className="text-muted-foreground">Content:</span> {record.utm_content}</p>}
            {record.utm_term && <p><span className="text-muted-foreground">Term:</span> {record.utm_term}</p>}
          </div>
        </div>
      )}

      {/* Pipeline Value for Lead */}
      {type === 'lead' && record.pipeline_value > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground uppercase">Pipeline Value</h4>
          <p className="text-2xl font-bold text-chart-2">${Number(record.pipeline_value).toLocaleString()}</p>
        </div>
      )}

      {/* Call Details */}
      {type === 'call' && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase">Call Details</h4>
          <div className="space-y-2">
            {record.recording_url && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={record.recording_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                  Listen to Recording
                </a>
              </div>
            )}
            {record.summary && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Summary:</span>
                <p className="text-sm">{record.summary}</p>
              </div>
            )}
            {record.quality_score && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Quality:</span>
                <Badge variant={record.quality_score >= 7 ? 'default' : record.quality_score >= 4 ? 'secondary' : 'destructive'}>
                  {record.quality_score}/10
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm text-muted-foreground uppercase">Activity Timeline</h4>
        <div className="relative pl-6 space-y-4">
          {timeline.map((event, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-6 w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              {i < timeline.length - 1 && (
                <div className="absolute -left-4 top-4 w-0.5 h-full bg-border" />
              )}
              <p className="font-medium text-sm">{event.label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.date).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
