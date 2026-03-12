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
  Zap,
  RefreshCcw,
  Pencil,
  Layers,
  Target,
  MessageSquare,
  Play,
} from 'lucide-react';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { exportToCSV } from '@/lib/exportUtils';
import { DailyMetric } from '@/hooks/useMetrics';
import { Lead, Call } from '@/hooks/useLeadsAndCalls';
import { useClientOpportunities, EnrichedOpportunity } from '@/hooks/usePipelines';
import { useLeadCallRecordings } from '@/hooks/useLeadEngagementStats';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSingleContactSync } from '@/hooks/useSingleContactSync';
import { UniversalRecordPanel } from '@/components/records/UniversalRecordPanel';
import { fetchAllRows } from '@/lib/fetchAllRows';
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
  TooltipProvider,
} from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

// High-density row class matching agency dashboard style
const ROW_CLASS = "h-7 text-[11px]";
const CELL_CLASS = "py-0 px-1 text-[11px]";
const HEAD_CLASS = "py-0 px-1 text-[10px] font-semibold h-7";

interface EnrichmentData {
  external_id?: string | null;
  lead_id?: string | null;
  state?: string | null;
  net_worth?: string | null;
  household_income?: string | null;
  estimated_capital_to_deploy?: string | null;
}

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

type TabType = 'adspend' | 'leads' | 'booked' | 'showed' | 'reconnect' | 'reconnect-showed' | 'commitments' | 'funded' | 'opportunities';

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
  
  // Fetch opportunities for this client
  const { data: opportunities = [] } = useClientOpportunities(clientId);
  
  // Fetch call recordings map
  const { data: callRecordingsMap = {} } = useLeadCallRecordings(clientId);
  
  // State for UniversalRecordPanel
  const [panelOpen, setPanelOpen] = useState(false);

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
  
  // Format relative time for lead created date
  const formatDaysSince = (createdAt: string): string => {
    try {
      return formatDistanceToNow(new Date(createdAt), { addSuffix: false });
    } catch {
      return '-';
    }
  };
  
  // Extract accredited status from questions array
  const getAccreditedStatus = (questions: any[] | null): 'yes' | 'no' | null => {
    if (!questions || !Array.isArray(questions)) return null;
    const accreditedQ = questions.find(q => 
      q.question === 'UKtZxKiQgUDUa2wpb7SS' || 
      String(q.question || '').toLowerCase().includes('accredited')
    );
    if (!accreditedQ) return null;
    const answer = String(accreditedQ.answer || '').toLowerCase();
    if (answer === 'yes' || answer.includes('yes')) return 'yes';
    if (answer === 'no' || answer.includes('no')) return 'no';
    return null;
  };

  // Extract investment range from questions array
  const getInvestmentRange = (questions: any[] | null): string | null => {
    if (!questions || !Array.isArray(questions)) return null;
    const investmentQ = questions.find(q => 
      q.question === 'DHkLtULj05sgxm3H8RET' ||
      String(q.question || '').toLowerCase().includes('investment')
    );
    return investmentQ ? String(investmentQ.answer) : null;
  };
  
  // Handle record click - open UniversalRecordPanel
  const handleRecordClick = (record: any, type: string) => {
    onRecordSelect?.(record, type);
    setPanelOpen(true);
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

  // Get display name for a call - uses embedded contact data with fallback to lead lookup
  const getCallDisplayName = (call: Call): string => {
    // Priority 1: Use embedded contact_name on the call record
    if (call.contact_name) {
      return call.contact_name;
    }
    // Priority 2: Look up from lead via lead_id
    if (call.lead_id && leadNameMap[call.lead_id]) {
      return leadNameMap[call.lead_id];
    }
    // Priority 3: Use contact_email as fallback
    if (call.contact_email) {
      return call.contact_email;
    }
    // Priority 4: Show external_id if it looks like a real contact ID (not webhook ID)
    if (call.external_id && !call.external_id.startsWith('wh_') && !call.external_id.startsWith('manual-')) {
      return call.external_id;
    }
    return '-';
  };

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

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    if (!searchQuery) return opportunities;
    const query = searchQuery.toLowerCase();
    return opportunities.filter((opp) =>
      (opp.contact_name?.toLowerCase().includes(query)) ||
      (opp.contact_email?.toLowerCase().includes(query)) ||
      (opp.stage_name?.toLowerCase().includes(query)) ||
      (opp.pipeline_name?.toLowerCase().includes(query)) ||
      (opp.source?.toLowerCase().includes(query))
    );
  }, [opportunities, searchQuery]);

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
      case 'opportunities': return filteredOpportunities.length;
      default: return 0;
    }
  }, [activeTab, filteredAdSpend.length, filteredLeads.length, filteredBookedCalls.length, filteredShowedCalls.length, filteredReconnectCalls.length, filteredReconnectShowedCalls.length, filteredCommitments.length, filteredFunded.length, filteredOpportunities.length]);

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

  const paginatedOpportunities = useMemo(() => {
    if (activeTab !== 'opportunities') return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOpportunities.slice(start, start + PAGE_SIZE);
  }, [filteredOpportunities, currentPage, activeTab]);

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
      case 'opportunities': return paginatedOpportunities.length;
      default: return 0;
    }
  }, [activeTab, paginatedAdSpend.length, paginatedLeads.length, paginatedBookedCalls.length, paginatedShowedCalls.length, paginatedReconnectCalls.length, paginatedReconnectShowedCalls.length, paginatedCommitments.length, paginatedFunded.length, paginatedOpportunities.length]);

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
      case 'opportunities': data = exportAll ? filteredOpportunities : paginatedOpportunities; break;
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
      case 'opportunities': return 'Opportunity';
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
      onClick={() => handleRecordClick(call, 'call')}
    >
      <TableCell className="font-mono text-sm">
        {call.scheduled_at
          ? new Date(call.scheduled_at).toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })
          : '-'}
      </TableCell>
      <TableCell className="font-medium">{getCallDisplayName(call)}</TableCell>
      <TableCell>
        {call.showed ? (
          <Badge className="bg-chart-2 text-chart-2-foreground">Showed</Badge>
        ) : (
          <Badge variant="secondary">No Show</Badge>
        )}
      </TableCell>
      <TableCell>{call.outcome || '-'}</TableCell>
      <TableCell className="font-mono text-sm">
        {(call.booked_at || call.created_at) ? new Date(call.booked_at || call.created_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }) : '-'}</TableCell>
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
            <TableHead>Showed</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Booked</TableHead>
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
    <div className="space-y-6">
      {/* Records Table */}
      <div>
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
                <TabsTrigger value="commitments" className="flex items-center gap-1">
                  <Handshake className="h-4 w-4" />
                  Commitments ({commitments.length})
                </TabsTrigger>
                <TabsTrigger value="funded" className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Funded ({fundedInvestors.length})
                </TabsTrigger>
                <TabsTrigger value="opportunities" className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  Opportunities ({opportunities.length})
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
                          onClick={() => handleRecordClick(metric, 'adspend')}
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
                        <TableHead>Age</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Accredited</TableHead>
                        <TableHead>Investment</TableHead>
                        <TableHead>Questions</TableHead>
                        {ghlLocationId && <TableHead>GHL Sync</TableHead>}
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedLeads.map((lead) => {
                        const accreditedStatus = getAccreditedStatus(lead.questions as any[] | null);
                        const investmentRange = getInvestmentRange(lead.questions as any[] | null);
                        const hasRecording = callRecordingsMap[lead.id] || false;
                        
                        return (
                            <TableRow
                              key={lead.id}
                              className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                                selectedRecord?.id === lead.id && selectedType === 'lead'
                                  ? 'bg-primary/10 border-l-2 border-l-primary'
                                  : ''
                              }`}
                              onClick={() => handleRecordClick(lead, 'lead')}
                            >
                              <TableCell>
                                <span className="text-xs text-muted-foreground">
                                  {formatDaysSince(lead.created_at)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">{lead.name || 'Unknown'}</span>
                                  {lead.assigned_user && (
                                    <span className="text-xs text-muted-foreground">{lead.assigned_user}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col text-sm">
                                  {lead.email && (
                                    <span className="text-muted-foreground truncate max-w-[180px]" title={lead.email}>
                                      {lead.email}
                                    </span>
                                  )}
                                  {lead.phone && (
                                    <span className="text-muted-foreground text-xs">{lead.phone}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground truncate max-w-[120px] block" title={lead.campaign_name || ''}>
                                  {lead.campaign_name || '-'}
                                </span>
                              </TableCell>
                              <TableCell>
                                {lead.is_spam ? (
                                  <Badge variant="destructive" className="text-xs">Spam</Badge>
                                ) : (
                                  <Badge 
                                    className={`text-xs ${
                                      lead.status === 'booked' || lead.status === 'qualified' 
                                        ? 'bg-amber-500 text-amber-50' 
                                        : lead.status === 'showed' || lead.status === 'completed'
                                          ? 'bg-chart-4 text-background'
                                          : lead.status === 'no_show'
                                            ? 'bg-destructive text-destructive-foreground'
                                            : 'bg-chart-1 text-background'
                                    }`}
                                  >
                                    {lead.status || 'new'}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {accreditedStatus === 'yes' ? (
                                  <Badge className="bg-primary text-primary-foreground text-xs">Yes</Badge>
                                ) : accreditedStatus === 'no' ? (
                                  <Badge variant="secondary" className="text-xs">No</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{investmentRange || '-'}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {lead.questions && Array.isArray(lead.questions) && lead.questions.length > 0 ? (
                                    <Badge variant="secondary" className="text-xs">
                                      {lead.questions.length} Q&A
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                  {hasRecording && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                          <Play className="h-3 w-3 text-primary" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Call recording available</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                              {ghlLocationId && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {lead.ghl_synced_at ? (
                                      <CheckCircle className="h-3 w-3 text-chart-4" />
                                    ) : null}
                                    <span className={`text-xs ${
                                      !lead.ghl_synced_at 
                                        ? 'text-muted-foreground' 
                                        : new Date(lead.ghl_synced_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)
                                          ? 'text-amber-500'
                                          : 'text-chart-4'
                                    }`}>
                                      {formatLastSync(lead.ghl_synced_at)}
                                    </span>
                                    {canSyncFromGHL(lead.external_id, !!ghlLocationId) && clientId && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        disabled={isSyncing(lead.external_id)}
                                        onClick={(e) => handleSyncClick(e, lead.external_id, 'lead')}
                                      >
                                        {isSyncing(lead.external_id) ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RefreshCw className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                    {lead.external_id && !lead.external_id.startsWith('wh_') && !lead.external_id.startsWith('manual-') && (
                                      <a 
                                        href={getGHLContactUrl(ghlLocationId, lead.external_id)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:text-primary/80"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {clientId && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => { e.stopPropagation(); openEditModal(lead); }}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
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
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                        );
                      })}
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
                          onClick={() => handleRecordClick(investor, 'commitment')}
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
                          onClick={() => handleRecordClick(investor, 'funded')}
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

              {/* Opportunities Tab */}
              <TabsContent value="opportunities" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Pipeline</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Source</TableHead>
                        {ghlLocationId && <TableHead>GHL</TableHead>}
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedOpportunities.map((opp) => {
                        const statusColors: Record<string, string> = {
                          open: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                          won: 'bg-green-500/10 text-green-600 border-green-500/20',
                          lost: 'bg-red-500/10 text-red-600 border-red-500/20',
                          abandoned: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
                        };
                        
                        return (
                          <TableRow
                            key={opp.id}
                            className={`cursor-pointer hover:bg-muted/50 ${
                              selectedRecord?.id === opp.id && selectedType === 'opportunity'
                                ? 'bg-primary/10'
                                : ''
                            }`}
                            onClick={() => handleRecordClick(opp, 'opportunity')}
                          >
                            <TableCell className="font-medium">
                              {opp.contact_name || 'Unknown'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {opp.contact_email || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {opp.contact_phone || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {opp.pipeline_name}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {opp.stage_name}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${statusColors[opp.status] || ''}`}
                              >
                                {opp.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-chart-2">
                              {opp.monetary_value > 0 
                                ? `$${Number(opp.monetary_value).toLocaleString()}` 
                                : '-'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {opp.source || '-'}
                            </TableCell>
                            {ghlLocationId && (
                              <TableCell>
                                {opp.ghl_contact_id ? (
                                  <a 
                                    href={getGHLContactUrl(ghlLocationId, opp.ghl_contact_id)}
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
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {new Date(opp.updated_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {paginatedOpportunities.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No opportunities found. Sync a GHL pipeline to see opportunities here.
                          </TableCell>
                        </TableRow>
                      )}
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

      {/* Universal Record Panel - replaces the right sidebar */}
      {selectedRecord && clientId && (
        <UniversalRecordPanel
          record={selectedRecord}
          recordType={
            selectedType === 'lead' ? 'lead' :
            selectedType === 'opportunity' ? 'opportunity' :
            selectedType === 'funded' || selectedType === 'commitment' ? 'funded' :
            'call'
          }
          clientId={clientId}
          open={panelOpen}
          onOpenChange={setPanelOpen}
          isPublicView={isPublicView}
          linkedLead={selectedLinkedLead || undefined}
        />
      )}

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