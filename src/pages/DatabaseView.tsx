import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Filter, Users, Phone, TrendingUp, PhoneCall, X, MapPin, DollarSign, Building2, Sparkles, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { useClients } from '@/hooks/useClients';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { CSVImportModal, ImportType } from '@/components/import/CSVImportModal';

const PAGE_SIZE = 150;
const AGENCY_CLIENT_ID = '5cef9f3f-7e82-4dd6-a407-23f5fd853c8b';

export default function DatabaseView() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const [activeTab, setActiveTab] = useState('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [exportType, setExportType] = useState<'all' | 'emails' | 'phones'>('all');

  // Attribute filters
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [stateOpen, setStateOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [incomeFilter, setIncomeFilter] = useState<string[]>([]);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [enrichedFilter, setEnrichedFilter] = useState<'all' | 'enriched' | 'not_enriched'>('all');
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  const [amountMinFilter, setAmountMinFilter] = useState('');
  const [amountMaxFilter, setAmountMaxFilter] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>('leads');

  // Fetch ALL leads (no date filter) — up to 100k
  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['all-leads-db'],
    queryFn: () => fetchAllRows<any>((sb) =>
      sb.from('leads').select('*').order('created_at', { ascending: false })
    ),
  });

  // Fetch ALL calls (no date filter) — up to 100k
  const { data: allCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['all-calls-db'],
    queryFn: () => fetchAllRows<any>((sb) =>
      sb.from('calls').select('*, leads(name, email, phone)').order('created_at', { ascending: false })
    ),
  });

  const showedCalls = useMemo(() => allCalls.filter(c => c.showed), [allCalls]);

  // Fetch ALL funded investors (no date filter) — up to 20k
  const { data: allFunded = [], isLoading: fundedLoading } = useQuery({
    queryKey: ['all-funded-db'],
    queryFn: () => fetchAllRows<any>((sb) =>
      sb.from('funded_investors').select('*, leads(name, email, phone)').order('funded_at', { ascending: false })
    ),
  });

  // Fetch ALL enrichment data (for attribute filtering + display)
  const { data: enrichmentData = [] } = useQuery({
    queryKey: ['all-enrichment-db'],
    queryFn: () => fetchAllRows<any>((sb) =>
      sb.from('lead_enrichment').select('lead_id, external_id, state, household_income, city, company_name, credit_range, first_name, last_name, gender, birth_date, address, zip, linkedin_url, company_title, enriched_phones, enriched_emails, vehicles')
    ),
  });

  // Build enrichment lookups by lead_id and external_id
  const enrichmentByLeadId = useMemo(() => {
    const map = new Map<string, typeof enrichmentData[0]>();
    enrichmentData.forEach(e => {
      if (e.lead_id) map.set(e.lead_id, e);
    });
    return map;
  }, [enrichmentData]);

  const enrichmentByExternalId = useMemo(() => {
    const map = new Map<string, typeof enrichmentData[0]>();
    enrichmentData.forEach(e => {
      if (e.external_id) map.set(e.external_id, e);
    });
    return map;
  }, [enrichmentData]);

  // Helper to get enrichment for a funded investor
  const getEnrichmentForFunded = (investor: any) => {
    if (investor.lead_id) {
      const byLead = enrichmentByLeadId.get(investor.lead_id);
      if (byLead) return byLead;
    }
    if (investor.external_id) {
      return enrichmentByExternalId.get(investor.external_id) || null;
    }
    return null;
  };

  // Extract unique filter values
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    enrichmentData.forEach(e => { if (e.state) states.add(e.state); });
    return Array.from(states).sort();
  }, [enrichmentData]);

  const uniqueIncomes = useMemo(() => {
    const incomes = new Set<string>();
    enrichmentData.forEach(e => { if (e.household_income) incomes.add(e.household_income); });
    return Array.from(incomes).sort();
  }, [enrichmentData]);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    allLeads.forEach(l => { if (l.source) sources.add(l.source); });
    return Array.from(sources).sort();
  }, [allLeads]);

  const filteredStatesOptions = useMemo(() => {
    if (!stateSearch) return uniqueStates;
    return uniqueStates.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()));
  }, [uniqueStates, stateSearch]);

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || 'Unknown';
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchQuery('');
  };

  const hasAttributeFilters = stateFilter.length > 0 || incomeFilter.length > 0 || sourceFilter.length > 0 || amountMinFilter || amountMaxFilter || enrichedFilter !== 'all';

  const clearAllFilters = () => {
    setStateFilter([]);
    setIncomeFilter([]);
    setSourceFilter([]);
    setAmountMinFilter('');
    setAmountMaxFilter('');
    setEnrichedFilter('all');
  };

  // Helper: check if a lead passes enrichment-based attribute filters
  const passesEnrichmentFilter = (leadId: string | null) => {
    if (!leadId) return stateFilter.length === 0 && incomeFilter.length === 0;
    const enrichment = enrichmentByLeadId.get(leadId);
    if (stateFilter.length > 0) {
      if (!enrichment?.state || !stateFilter.includes(enrichment.state)) return false;
    }
    if (incomeFilter.length > 0) {
      if (!enrichment?.household_income || !incomeFilter.includes(enrichment.household_income)) return false;
    }
    return true;
  };

  // Filter leads
  const filteredLeads = useMemo(() => {
    let data = allLeads;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q)
      );
    }
    if (sourceFilter.length > 0) {
      data = data.filter(l => l.source && sourceFilter.includes(l.source));
    }
    if (stateFilter.length > 0 || incomeFilter.length > 0) {
      data = data.filter(l => passesEnrichmentFilter(l.id));
    }
    if (enrichedFilter !== 'all') {
      data = data.filter(l => {
        const enrich = enrichmentByLeadId.get(l.id);
        const isEnriched = !!(enrich?.state || enrich?.household_income || enrich?.company_name || enrich?.credit_range);
        return enrichedFilter === 'enriched' ? isEnriched : !isEnriched;
      });
    }
    return data;
  }, [allLeads, searchQuery, sourceFilter, stateFilter, incomeFilter, enrichedFilter, enrichmentByLeadId]);

  // Filter calls
  const filteredCalls = useMemo(() => {
    let data = allCalls;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c =>
        c.leads?.name?.toLowerCase().includes(q) ||
        c.outcome?.toLowerCase().includes(q)
      );
    }
    if (stateFilter.length > 0 || incomeFilter.length > 0) {
      data = data.filter(c => passesEnrichmentFilter(c.lead_id));
    }
    return data;
  }, [allCalls, searchQuery, stateFilter, incomeFilter, enrichmentByLeadId]);

  const filteredShowedCalls = useMemo(() => {
    let data = showedCalls;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c =>
        c.leads?.name?.toLowerCase().includes(q) ||
        c.outcome?.toLowerCase().includes(q)
      );
    }
    if (stateFilter.length > 0 || incomeFilter.length > 0) {
      data = data.filter(c => passesEnrichmentFilter(c.lead_id));
    }
    return data;
  }, [showedCalls, searchQuery, stateFilter, incomeFilter, enrichmentByLeadId]);

  // Filter funded investors (supports enrichment by external_id too)
  const passesFundedEnrichmentFilter = (investor: any) => {
    const enrich = getEnrichmentForFunded(investor);
    if (stateFilter.length > 0) {
      if (!enrich?.state || !stateFilter.includes(enrich.state)) return false;
    }
    if (incomeFilter.length > 0) {
      if (!enrich?.household_income || !incomeFilter.includes(enrich.household_income)) return false;
    }
    return true;
  };

  const filteredFunded = useMemo(() => {
    let data = allFunded;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(f => {
        const enrich = getEnrichmentForFunded(f);
        const email = f.leads?.email || (enrich?.enriched_emails?.[0] as any)?.email || '';
        return (
          f.name?.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q)
        );
      });
    }
    if (stateFilter.length > 0 || incomeFilter.length > 0) {
      data = data.filter(f => passesFundedEnrichmentFilter(f));
    }
    if (enrichedFilter !== 'all') {
      data = data.filter(f => {
        const enrich = getEnrichmentForFunded(f);
        const isEnriched = !!(enrich?.state || enrich?.household_income || enrich?.company_name || enrich?.credit_range);
        return enrichedFilter === 'enriched' ? isEnriched : !isEnriched;
      });
    }
    const minAmount = amountMinFilter ? Number(amountMinFilter) : null;
    const maxAmount = amountMaxFilter ? Number(amountMaxFilter) : null;
    if (minAmount !== null) {
      data = data.filter(f => Number(f.funded_amount) >= minAmount);
    }
    if (maxAmount !== null) {
      data = data.filter(f => Number(f.funded_amount) <= maxAmount);
    }
    return data;
  }, [allFunded, searchQuery, stateFilter, incomeFilter, amountMinFilter, amountMaxFilter, enrichedFilter, enrichmentByLeadId, enrichmentByExternalId]);

  // Count unenriched funded investors
  const unenrichedFundedCount = useMemo(() => {
    return allFunded.filter(f => {
      const enrich = getEnrichmentForFunded(f);
      return !(enrich?.state || enrich?.household_income || enrich?.company_name || enrich?.credit_range);
    }).length;
  }, [allFunded, enrichmentByLeadId, enrichmentByExternalId]);

  const handleBulkEnrich = async () => {
    setIsBulkEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-all-funded', {
        body: { client_id: AGENCY_CLIENT_ID },
      });
      if (error) throw error;
      toast.success(`Enrichment started for ${data?.total || 'all'} unenriched records`);
    } catch (err: any) {
      toast.error(`Enrichment failed: ${err.message}`);
    } finally {
      setIsBulkEnriching(false);
    }
  };

  const openImport = (type: ImportType) => {
    setImportType(type);
    setImportModalOpen(true);
  };

  // Get current data based on tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'leads': return filteredLeads;
      case 'calls': return filteredCalls;
      case 'showed': return filteredShowedCalls;
      case 'funded': return filteredFunded;
      default: return [];
    }
  };

  const currentData = getCurrentData();
  const totalPages = Math.ceil(currentData.length / PAGE_SIZE);
  const paginatedData = currentData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    const data = getCurrentData();
    let exportData: any[] = [];
    if (exportType === 'emails') {
      if (activeTab === 'leads') {
        exportData = data.filter((l: any) => l.email).map((l: any) => ({ email: l.email, name: l.name }));
      } else if (activeTab === 'funded') {
        exportData = data.filter((f: any) => f.leads?.email).map((f: any) => ({ email: f.leads?.email, name: f.name }));
      }
    } else if (exportType === 'phones') {
      if (activeTab === 'leads') {
        exportData = data.filter((l: any) => l.phone).map((l: any) => ({ phone: l.phone, name: l.name }));
      } else if (activeTab === 'calls') {
        exportData = data.filter((c: any) => c.leads?.phone).map((c: any) => ({ phone: c.leads?.phone, name: c.leads?.name }));
      }
    } else {
      exportData = data;
    }
    exportToCSV(exportData, `database-${activeTab}-${exportType}`);
  };

  const isLoading = leadsLoading || callsLoading || fundedLoading;

  const MultiSelectFilter = ({ 
    label, icon: Icon, options, selected, onToggle, open, setOpen, searchValue, setSearchValue 
  }: {
    label: string; icon: any; options: string[]; selected: string[];
    onToggle: (val: string, checked: boolean) => void; open: boolean; setOpen: (v: boolean) => void;
    searchValue?: string; setSearchValue?: (v: string) => void;
  }) => (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Icon className="h-4 w-4" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {setSearchValue && (
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={searchValue || ''}
            onChange={e => setSearchValue(e.target.value)}
            className="mb-2 h-8 text-xs"
          />
        )}
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={() => options.forEach(o => { if (!selected.includes(o)) onToggle(o, true); })} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Select All</button>
          {selected.length > 0 && (
            <button onClick={() => selected.forEach(s => onToggle(s, false))} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
        <ScrollArea className="h-48">
          <div className="space-y-1">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                <Checkbox checked={selected.includes(opt)} onCheckedChange={checked => onToggle(opt, !!checked)} />
                <span className="text-xs truncate flex-1">{opt}</span>
              </label>
            ))}
            {options.length === 0 && <p className="text-xs text-muted-foreground px-2 py-4">No options available</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-4">
          <h1 className="text-2xl font-bold">📊 Database</h1>
          <p className="text-sm text-muted-foreground">Complete database — all records, no date restrictions</p>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Attribute Filters */}
        <div className="border-2 border-border bg-card p-4">
          <h2 className="font-bold text-lg mb-1">Filters</h2>
          <p className="text-sm text-muted-foreground mb-4">Filter by attributes — state, income, source, and amount</p>
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelectFilter
              label="State"
              icon={MapPin}
              options={filteredStatesOptions}
              selected={stateFilter}
              onToggle={(val, checked) => {
                setStateFilter(prev => checked ? [...prev, val] : prev.filter(s => s !== val));
                setCurrentPage(1);
              }}
              open={stateOpen}
              setOpen={setStateOpen}
              searchValue={stateSearch}
              setSearchValue={setStateSearch}
            />
            <MultiSelectFilter
              label="Income"
              icon={DollarSign}
              options={uniqueIncomes}
              selected={incomeFilter}
              onToggle={(val, checked) => {
                setIncomeFilter(prev => checked ? [...prev, val] : prev.filter(s => s !== val));
                setCurrentPage(1);
              }}
              open={incomeOpen}
              setOpen={setIncomeOpen}
            />
            <MultiSelectFilter
              label="Source"
              icon={Building2}
              options={uniqueSources}
              selected={sourceFilter}
              onToggle={(val, checked) => {
                setSourceFilter(prev => checked ? [...prev, val] : prev.filter(s => s !== val));
                setCurrentPage(1);
              }}
              open={sourceOpen}
              setOpen={setSourceOpen}
            />

            {/* Enriched filter */}
            <Select value={enrichedFilter} onValueChange={(v: any) => { setEnrichedFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-40 h-9">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Records</SelectItem>
                <SelectItem value="enriched">Enriched Only</SelectItem>
                <SelectItem value="not_enriched">Not Enriched</SelectItem>
              </SelectContent>
            </Select>

            {/* Bulk enrich button */}
            {unenrichedFundedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkEnriching}
                onClick={handleBulkEnrich}
                className="gap-1.5"
              >
                {isBulkEnriching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Enrich {unenrichedFundedCount.toLocaleString()} Unenriched
              </Button>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Amount:</span>
              <Input
                type="number"
                placeholder="Min"
                value={amountMinFilter}
                onChange={e => { setAmountMinFilter(e.target.value); setCurrentPage(1); }}
                className="w-24 h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={amountMaxFilter}
                onChange={e => { setAmountMaxFilter(e.target.value); setCurrentPage(1); }}
                className="w-24 h-8 text-xs"
              />
            </div>

            {hasAttributeFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Clear All
              </Button>
            )}
          </div>

          {/* Active filter chips */}
          {hasAttributeFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Active:</span>
              {stateFilter.map(s => (
                <Badge key={`state-${s}`} variant="outline" className="gap-1 cursor-pointer" onClick={() => setStateFilter(prev => prev.filter(x => x !== s))}>
                  📍 {s} <X className="h-3 w-3" />
                </Badge>
              ))}
              {incomeFilter.map(s => (
                <Badge key={`income-${s}`} variant="outline" className="gap-1 cursor-pointer" onClick={() => setIncomeFilter(prev => prev.filter(x => x !== s))}>
                  💰 {s} <X className="h-3 w-3" />
                </Badge>
              ))}
              {sourceFilter.map(s => (
                <Badge key={`source-${s}`} variant="outline" className="gap-1 cursor-pointer" onClick={() => setSourceFilter(prev => prev.filter(x => x !== s))}>
                  🏢 {s} <X className="h-3 w-3" />
                </Badge>
              ))}
              {(amountMinFilter || amountMaxFilter) && (
                <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => { setAmountMinFilter(''); setAmountMaxFilter(''); }}>
                  💵 {amountMinFilter ? `$${Number(amountMinFilter).toLocaleString()}` : '$0'} – {amountMaxFilter ? `$${Number(amountMaxFilter).toLocaleString()}` : '∞'} <X className="h-3 w-3" />
                </Badge>
              )}
              {enrichedFilter !== 'all' && (
                <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => setEnrichedFilter('all')}>
                  ✨ {enrichedFilter === 'enriched' ? 'Enriched' : 'Not Enriched'} <X className="h-3 w-3" />
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-chart-1" />
                <span className="text-sm text-muted-foreground">Total Leads</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{filteredLeads.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-chart-2" />
                <span className="text-sm text-muted-foreground">Total Calls</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{filteredCalls.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-chart-3" />
                <span className="text-sm text-muted-foreground">Showed Calls</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{filteredShowedCalls.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-chart-4" />
                <span className="text-sm text-muted-foreground">Funded</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{filteredFunded.length.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Records Table */}
        <Card className="border-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg">All Records</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={exportType} onValueChange={(v: any) => setExportType(v)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Info</SelectItem>
                    <SelectItem value="emails">Emails Only</SelectItem>
                    <SelectItem value="phones">Phones Only</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
               <TabsList className="mb-4">
                <TabsTrigger value="leads" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Leads ({filteredLeads.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="calls" className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  Calls ({filteredCalls.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="showed" className="flex items-center gap-1">
                  <PhoneCall className="h-4 w-4" />
                  Showed ({filteredShowedCalls.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="funded" className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Funded ({filteredFunded.length.toLocaleString()})
                </TabsTrigger>
              </TabsList>

              {/* Search + Import */}
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="max-w-sm h-8 text-xs"
                />
                <span className="text-xs text-muted-foreground">
                  Showing {paginatedData.length} of {currentData.length.toLocaleString()}
                </span>
                <div className="ml-auto">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openImport(
                    activeTab === 'leads' ? 'leads' :
                    activeTab === 'calls' ? 'calls' :
                    activeTab === 'showed' ? 'calls' :
                    'funded_investors'
                  )}>
                    <Upload className="h-3 w-3" />
                    Import {activeTab === 'showed' ? 'Showed' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <CashBagLoader message="Loading records..." />
              ) : (
                <>
                  {/* Leads Tab */}
                  <TabsContent value="leads" className="mt-0">
                    <div className="overflow-x-auto border border-border rounded">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b">
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Client</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Date</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Name</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Email</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Phone</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">State</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Source</TableHead>
                            <TableHead className="text-[11px] py-1.5 px-2 whitespace-nowrap">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((lead: any) => {
                            const enrich = enrichmentByLeadId.get(lead.id);
                            return (
                              <TableRow key={lead.id} className="hover:bg-muted/50 border-b h-7">
                                <TableCell className="text-[11px] py-0.5 px-2"><Badge variant="outline" className="text-[10px] px-1 py-0">{getClientName(lead.client_id)}</Badge></TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2 font-mono tabular-nums whitespace-nowrap">
                                  {new Date(lead.created_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2 font-medium whitespace-nowrap">{lead.name || 'Unknown'}</TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2">{lead.email || '-'}</TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2 whitespace-nowrap">{lead.phone || '-'}</TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2">{enrich?.state || '-'}</TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2">{lead.source}</TableCell>
                                <TableCell className="text-[11px] py-0.5 px-2">
                                  {lead.is_spam ? (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">Spam</Badge>
                                  ) : (
                                    <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30 text-[10px] px-1 py-0">{lead.status || 'new'}</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* Calls Tab */}
                  <TabsContent value="calls" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((call: any) => (
                            <TableRow key={call.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(call.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="font-medium">{call.leads?.name || 'Unknown'}</TableCell>
                              <TableCell>{call.leads?.phone || '-'}</TableCell>
                              <TableCell>
                                {call.showed ? (
                                  <Badge className="bg-green-600">Showed</Badge>
                                ) : (
                                  <Badge variant="secondary">No Show</Badge>
                                )}
                              </TableCell>
                              <TableCell>{call.outcome || '-'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{call.is_reconnect ? 'Reconnect' : 'Initial'}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Showed Calls Tab */}
                  <TabsContent value="showed" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Summary</TableHead>
                            <TableHead>Quality</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((call: any) => (
                            <TableRow key={call.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(call.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="font-medium">{call.leads?.name || 'Unknown'}</TableCell>
                              <TableCell>{call.leads?.phone || '-'}</TableCell>
                              <TableCell>{call.outcome || '-'}</TableCell>
                              <TableCell className="max-w-xs truncate">{call.summary || '-'}</TableCell>
                              <TableCell>
                                {call.quality_score ? (
                                  <Badge variant={call.quality_score >= 7 ? 'default' : 'secondary'}>
                                    {call.quality_score}/10
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Funded Tab */}
                  <TabsContent value="funded" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Funded Date</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Income</TableHead>
                            <TableHead>Company</TableHead>
                            <TableHead>Credit</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Days to Fund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((investor: any) => {
                            const enrich = getEnrichmentForFunded(investor);
                            const email = investor.leads?.email || (enrich?.enriched_emails?.[0] as any)?.email || '-';
                            const phone = investor.leads?.phone || (enrich?.enriched_phones?.[0] as any)?.phone || '-';
                            return (
                              <TableRow key={investor.id} className="hover:bg-muted/50">
                                <TableCell><Badge variant="outline">{getClientName(investor.client_id)}</Badge></TableCell>
                                <TableCell className="font-mono text-sm tabular-nums">
                                  {new Date(investor.funded_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                                <TableCell className="text-xs">{email}</TableCell>
                                <TableCell className="text-xs">{phone}</TableCell>
                                <TableCell className="text-xs">{enrich?.state || '-'}</TableCell>
                                <TableCell className="text-xs">{enrich?.city || '-'}</TableCell>
                                <TableCell className="text-xs">{enrich?.household_income || '-'}</TableCell>
                                <TableCell className="text-xs">{enrich?.company_name || '-'}</TableCell>
                                <TableCell className="text-xs">{enrich?.credit_range || '-'}</TableCell>
                                <TableCell className="text-right font-mono text-chart-2 tabular-nums">
                                  ${Number(investor.funded_amount).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  {investor.time_to_fund_days || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>
                </>
              )}
            </Tabs>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
