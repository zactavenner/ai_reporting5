import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Layers, Target, Calendar, Filter, X, Globe, Megaphone, LayoutGrid, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Lead {
  id: string;
  campaign_name?: string | null;
  ad_set_name?: string | null;
  ad_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  created_at: string;
}

interface Call {
  id: string;
  lead_id?: string | null;
  showed?: boolean | null;
  outcome?: string | null;
  created_at: string;
}

interface FundedInvestor {
  id: string;
  lead_id?: string | null;
  funded_at: string;
}

interface AttributionDashboardProps {
  leads: Lead[];
  calls: Call[];
  fundedInvestors: FundedInvestor[];
}

interface AttributionData {
  name: string;
  leads: number;
  bookedCalls: number;
  showedCalls: number;
  fundedInvestors: number;
  leadToBookedRate: number;
  bookedToShowedRate: number;
  showedToFundedRate: number;
  leadToFundedRate: number;
}

type DatePreset = 'last7' | 'last14' | 'last30' | 'last90' | 'mtd' | 'ytd' | 'all' | 'custom';

interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  icon: React.ReactNode;
}

function FilterDropdown({ label, options, selected, onChange, icon }: FilterDropdownProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  
  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          {icon}
          <span className="max-w-[100px] truncate">{label}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 z-50 bg-popover" align="start">
        <Input 
          placeholder={`Search ${label.toLowerCase()}...`} 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8 text-xs"
        />
        <div className="flex items-center justify-between mb-2 px-1">
          <button 
            onClick={handleSelectAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selected.length === options.length ? 'Deselect All' : 'Select All'}
          </button>
          {selected.length > 0 && (
            <button 
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <ScrollArea className="h-48">
          {filteredOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No options found</p>
          ) : (
            <div className="space-y-1">
              {filteredOptions.map(option => (
                <label 
                  key={option} 
                  className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer"
                >
                  <Checkbox 
                    checked={selected.includes(option)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onChange([...selected, option]);
                      } else {
                        onChange(selected.filter(s => s !== option));
                      }
                    }}
                  />
                  <span className="text-xs truncate flex-1" title={option}>{option}</span>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function AttributionDashboard({ leads, calls, fundedInvestors }: AttributionDashboardProps) {
  const [view, setView] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [datePreset, setDatePreset] = useState<DatePreset>('last30');
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Filter states
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [adSetFilter, setAdSetFilter] = useState<string[]>([]);
  const [adFilter, setAdFilter] = useState<string[]>([]);
  const [contentFilter, setContentFilter] = useState<string[]>([]);
  const [mediumFilter, setMediumFilter] = useState<string[]>([]);

  // Extract unique values for filters
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    leads.forEach(lead => {
      if (lead.utm_source) sources.add(lead.utm_source);
    });
    return Array.from(sources).sort();
  }, [leads]);

  const uniqueCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    leads.forEach(lead => {
      if (lead.campaign_name) campaigns.add(lead.campaign_name);
    });
    return Array.from(campaigns).sort();
  }, [leads]);

  const uniqueAdSets = useMemo(() => {
    const adSets = new Set<string>();
    leads.forEach(lead => {
      if (lead.ad_set_name) adSets.add(lead.ad_set_name);
    });
    return Array.from(adSets).sort();
  }, [leads]);

  const uniqueAds = useMemo(() => {
    const ads = new Set<string>();
    leads.forEach(lead => {
      if (lead.ad_id) ads.add(lead.ad_id);
    });
    return Array.from(ads).sort();
  }, [leads]);

  const uniqueContents = useMemo(() => {
    const contents = new Set<string>();
    leads.forEach(lead => {
      if (lead.utm_content) contents.add(lead.utm_content);
    });
    return Array.from(contents).sort();
  }, [leads]);

  const uniqueMediums = useMemo(() => {
    const mediums = new Set<string>();
    leads.forEach(lead => {
      if (lead.utm_medium) mediums.add(lead.utm_medium);
    });
    return Array.from(mediums).sort();
  }, [leads]);

  const hasActiveFilters = sourceFilter.length > 0 || campaignFilter.length > 0 || 
    adSetFilter.length > 0 || adFilter.length > 0 || contentFilter.length > 0 || mediumFilter.length > 0;

  const clearAllFilters = () => {
    setSourceFilter([]);
    setCampaignFilter([]);
    setAdSetFilter([]);
    setAdFilter([]);
    setContentFilter([]);
    setMediumFilter([]);
  };

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (datePreset) {
      case 'last7':
        return { from: subDays(today, 7), to: today };
      case 'last14':
        return { from: subDays(today, 14), to: today };
      case 'last30':
        return { from: subDays(today, 30), to: today };
      case 'last90':
        return { from: subDays(today, 90), to: today };
      case 'mtd':
        return { from: startOfMonth(today), to: today };
      case 'ytd':
        return { from: startOfYear(today), to: today };
      case 'all':
        return { from: new Date(2000, 0, 1), to: today };
      case 'custom':
        return customDateRange;
      default:
        return { from: subDays(today, 30), to: today };
    }
  }, [datePreset, customDateRange]);

  // Filter data by date range AND dimension filters
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const createdAt = new Date(lead.created_at);
      const inDateRange = createdAt >= dateRange.from && createdAt <= dateRange.to;
      
      const matchesSource = sourceFilter.length === 0 || 
        (lead.utm_source && sourceFilter.includes(lead.utm_source));
      
      const matchesCampaign = campaignFilter.length === 0 || 
        (lead.campaign_name && campaignFilter.includes(lead.campaign_name));
      
      const matchesAdSet = adSetFilter.length === 0 || 
        (lead.ad_set_name && adSetFilter.includes(lead.ad_set_name));
      
      const matchesAd = adFilter.length === 0 || 
        (lead.ad_id && adFilter.includes(lead.ad_id));
      
      const matchesContent = contentFilter.length === 0 || 
        (lead.utm_content && contentFilter.includes(lead.utm_content));
      
      const matchesMedium = mediumFilter.length === 0 || 
        (lead.utm_medium && mediumFilter.includes(lead.utm_medium));
      
      return inDateRange && matchesSource && matchesCampaign && matchesAdSet && matchesAd && matchesContent && matchesMedium;
    });
  }, [leads, dateRange, sourceFilter, campaignFilter, adSetFilter, adFilter, contentFilter, mediumFilter]);

  const filteredCalls = useMemo(() => {
    return calls.filter(call => {
      const createdAt = new Date(call.created_at);
      return createdAt >= dateRange.from && createdAt <= dateRange.to;
    });
  }, [calls, dateRange]);

  const filteredFundedInvestors = useMemo(() => {
    return fundedInvestors.filter(investor => {
      const fundedAt = new Date(investor.funded_at);
      return fundedAt >= dateRange.from && fundedAt <= dateRange.to;
    });
  }, [fundedInvestors, dateRange]);

  // Create lead lookup map for calls and funded investors
  const leadMap = useMemo(() => {
    const map: Record<string, Lead> = {};
    leads.forEach(lead => {
      map[lead.id] = lead;
    });
    return map;
  }, [leads]);

  // Set of filtered lead IDs for quick lookup
  const filteredLeadIds = useMemo(() => {
    return new Set(filteredLeads.map(l => l.id));
  }, [filteredLeads]);

  // Aggregate data by dimension
  const attributionData = useMemo(() => {
    const aggregated: Record<string, AttributionData> = {};

    // Process leads
    filteredLeads.forEach(lead => {
      let key: string | null = null;
      
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
          leadToBookedRate: 0,
          bookedToShowedRate: 0,
          showedToFundedRate: 0,
          leadToFundedRate: 0,
        };
      }
      aggregated[key].leads++;
    });

    // Process calls (join via lead_id, only if lead is in filtered set)
    filteredCalls.forEach(call => {
      if (!call.lead_id) return;
      if (!filteredLeadIds.has(call.lead_id)) return;
      
      const lead = leadMap[call.lead_id];
      if (!lead) return;

      let key: string | null = null;
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
          leadToBookedRate: 0,
          bookedToShowedRate: 0,
          showedToFundedRate: 0,
          leadToFundedRate: 0,
        };
      }

      aggregated[key].bookedCalls++;
      if (call.showed) {
        aggregated[key].showedCalls++;
      }
    });

    // Process funded investors (join via lead_id, only if lead is in filtered set)
    filteredFundedInvestors.forEach(investor => {
      if (!investor.lead_id) return;
      if (!filteredLeadIds.has(investor.lead_id)) return;
      
      const lead = leadMap[investor.lead_id];
      if (!lead) return;

      let key: string | null = null;
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
          leadToBookedRate: 0,
          bookedToShowedRate: 0,
          showedToFundedRate: 0,
          leadToFundedRate: 0,
        };
      }

      aggregated[key].fundedInvestors++;
    });

    // Calculate conversion rates
    Object.values(aggregated).forEach(data => {
      data.leadToBookedRate = data.leads > 0 ? (data.bookedCalls / data.leads) * 100 : 0;
      data.bookedToShowedRate = data.bookedCalls > 0 ? (data.showedCalls / data.bookedCalls) * 100 : 0;
      data.showedToFundedRate = data.showedCalls > 0 ? (data.fundedInvestors / data.showedCalls) * 100 : 0;
      data.leadToFundedRate = data.leads > 0 ? (data.fundedInvestors / data.leads) * 100 : 0;
    });

    // Sort by leads descending
    return Object.values(aggregated).sort((a, b) => b.leads - a.leads);
  }, [filteredLeads, filteredCalls, filteredFundedInvestors, leadMap, filteredLeadIds, view]);

  const hasData = attributionData.length > 0 && attributionData.some(d => d.leads > 0);

  // Helper to format percentage with color
  const formatRate = (rate: number) => {
    const formatted = rate.toFixed(1) + '%';
    if (rate >= 50) return <span className="text-chart-4 font-medium">{formatted}</span>;
    if (rate >= 25) return <span className="text-chart-3 font-medium">{formatted}</span>;
    if (rate > 0) return <span className="text-destructive font-medium">{formatted}</span>;
    return <span className="text-muted-foreground">-</span>;
  };

  // Limit chart data to top 10
  const chartData = attributionData.slice(0, 10);

  // Get active filter chips
  const activeFilters: { type: string; value: string; onRemove: () => void }[] = [];
  
  sourceFilter.forEach(value => {
    activeFilters.push({
      type: 'Source',
      value,
      onRemove: () => setSourceFilter(prev => prev.filter(v => v !== value))
    });
  });
  
  campaignFilter.forEach(value => {
    activeFilters.push({
      type: 'Campaign',
      value,
      onRemove: () => setCampaignFilter(prev => prev.filter(v => v !== value))
    });
  });
  
  adSetFilter.forEach(value => {
    activeFilters.push({
      type: 'Ad Set',
      value,
      onRemove: () => setAdSetFilter(prev => prev.filter(v => v !== value))
    });
  });
  
  adFilter.forEach(value => {
    activeFilters.push({
      type: 'Ad',
      value,
      onRemove: () => setAdFilter(prev => prev.filter(v => v !== value))
    });
  });
  
  contentFilter.forEach(value => {
    activeFilters.push({
      type: 'Content',
      value,
      onRemove: () => setContentFilter(prev => prev.filter(v => v !== value))
    });
  });
  
  mediumFilter.forEach(value => {
    activeFilters.push({
      type: 'Medium',
      value,
      onRemove: () => setMediumFilter(prev => prev.filter(v => v !== value))
    });
  });

  return (
    <Card className="border-2 border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Attribution Dashboard
          </CardTitle>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Filter */}
            <div className="flex items-center gap-2">
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <Calendar className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="last14">Last 14 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                  <SelectItem value="last90">Last 90 Days</SelectItem>
                  <SelectItem value="mtd">Month to Date</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {datePreset === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      {format(customDateRange.from, 'MMM d')} - {format(customDateRange.to, 'MMM d')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="range"
                      selected={{ from: customDateRange.from, to: customDateRange.to }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          setCustomDateRange({ from: range.from, to: range.to });
                        }
                      }}
                      numberOfMonths={2}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* View Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="campaign" className="text-xs px-3 h-7">
                  <Layers className="h-3 w-3 mr-1" />
                  Campaigns
                </TabsTrigger>
                <TabsTrigger value="adset" className="text-xs px-3 h-7">
                  <Target className="h-3 w-3 mr-1" />
                  Ad Sets
                </TabsTrigger>
                <TabsTrigger value="ad" className="text-xs px-3 h-7">
                  Ads
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        
        {/* Date range display */}
        <p className="text-xs text-muted-foreground mt-2">
          Showing data from {format(dateRange.from, 'MMM d, yyyy')} to {format(dateRange.to, 'MMM d, yyyy')}
        </p>

        {/* Filters Section */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters:</span>
            </div>
            
            <FilterDropdown
              label="Source"
              options={uniqueSources}
              selected={sourceFilter}
              onChange={setSourceFilter}
              icon={<Globe className="h-3 w-3" />}
            />
            
            <FilterDropdown
              label="Campaign"
              options={uniqueCampaigns}
              selected={campaignFilter}
              onChange={setCampaignFilter}
              icon={<Megaphone className="h-3 w-3" />}
            />
            
            <FilterDropdown
              label="Ad Set"
              options={uniqueAdSets}
              selected={adSetFilter}
              onChange={setAdSetFilter}
              icon={<LayoutGrid className="h-3 w-3" />}
            />
            
            <FilterDropdown
              label="Ad"
              options={uniqueAds}
              selected={adFilter}
              onChange={setAdFilter}
              icon={<FileText className="h-3 w-3" />}
            />
            
            <FilterDropdown
              label="Medium"
              options={uniqueMediums}
              selected={mediumFilter}
              onChange={setMediumFilter}
              icon={<Layers className="h-3 w-3" />}
            />
            
            <FilterDropdown
              label="Content"
              options={uniqueContents}
              selected={contentFilter}
              onChange={setContentFilter}
              icon={<Target className="h-3 w-3" />}
            />

            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Active Filter Chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Active:</span>
              {activeFilters.slice(0, 8).map((filter, idx) => (
                <Badge 
                  key={`${filter.type}-${filter.value}-${idx}`}
                  variant="secondary" 
                  className="text-xs py-0.5 pl-2 pr-1 gap-1"
                >
                  <span className="truncate max-w-[150px]" title={`${filter.type}: ${filter.value}`}>
                    {filter.value}
                  </span>
                  <button
                    onClick={filter.onRemove}
                    className="hover:bg-muted rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {activeFilters.length > 8 && (
                <span className="text-xs text-muted-foreground">
                  +{activeFilters.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!hasData ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No attribution data available for the selected filters.</p>
            <p className="text-sm mt-1">Try adjusting the date range or filters, or check if leads have campaign data.</p>
          </div>
        ) : (
          <>
            {/* Bar Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={120} 
                    className="text-xs fill-muted-foreground"
                    tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="leads" name="Leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="bookedCalls" name="Booked Calls" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="showedCalls" name="Showed Calls" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="fundedInvestors" name="Funded" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data Table with Conversion Rates */}
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{view === 'campaign' ? 'Campaign' : view === 'adset' ? 'Ad Set' : 'Ad'}</TableHead>
                    <TableHead className="text-right tabular-nums">Leads</TableHead>
                    <TableHead className="text-right tabular-nums">Booked</TableHead>
                    <TableHead className="text-right tabular-nums">L→B %</TableHead>
                    <TableHead className="text-right tabular-nums">Showed</TableHead>
                    <TableHead className="text-right tabular-nums">B→S %</TableHead>
                    <TableHead className="text-right tabular-nums">Funded</TableHead>
                    <TableHead className="text-right tabular-nums">S→F %</TableHead>
                    <TableHead className="text-right tabular-nums">L→F %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attributionData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={row.name}>
                        {row.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.bookedCalls}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(row.leadToBookedRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.showedCalls}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(row.bookedToShowedRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.fundedInvestors}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(row.showedToFundedRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(row.leadToFundedRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
