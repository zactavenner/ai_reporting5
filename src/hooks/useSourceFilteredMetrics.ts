import { useMemo, useEffect } from 'react';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { normalizeSource } from '@/lib/sourceUtils';

interface Lead {
  id: string;
  utm_source?: string | null;
  campaign_name?: string | null;
  created_at: string;
  is_spam?: boolean | null;
  [key: string]: any;
}

interface Call {
  id: string;
  lead_id?: string | null;
  showed?: boolean | null;
  is_reconnect?: boolean | null;
  [key: string]: any;
}

interface FundedInvestor {
  id: string;
  lead_id?: string | null;
  funded_amount: number;
  [key: string]: any;
}

interface SourceFilteredMetricsResult {
  filteredLeads: Lead[];
  filteredCalls: Call[];
  filteredFundedInvestors: FundedInvestor[];
  totalLeads: number;
  filteredLeadCount: number;
  isFiltered: boolean;
  uniqueSources: string[];
}

/**
 * Hook to filter leads, calls, and funded investors by the global source filter
 * Also extracts unique sources from the data to populate the filter dropdown
 */
export function useSourceFilteredMetrics(
  leads: Lead[] = [],
  calls: Call[] = [],
  fundedInvestors: FundedInvestor[] = [],
  updateGlobalSources: boolean = true
): SourceFilteredMetricsResult {
  const { sourceFilter, setAvailableSources } = useDateFilter();

  // Extract unique normalized sources from leads
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    leads.forEach(lead => {
      const normalized = normalizeSource(lead.utm_source);
      if (normalized && normalized !== 'Unknown') {
        sources.add(normalized);
      }
    });
    return Array.from(sources).sort();
  }, [leads]);

  // Update available sources in context only if requested (prevents overwriting between views)
  useEffect(() => {
    if (updateGlobalSources && uniqueSources.length > 0) {
      setAvailableSources(uniqueSources);
    }
  }, [uniqueSources, setAvailableSources, updateGlobalSources]);

  // Filter leads by source
  const filteredLeads = useMemo(() => {
    if (sourceFilter.length === 0) return leads;
    
    return leads.filter(lead => {
      const normalized = normalizeSource(lead.utm_source);
      return sourceFilter.includes(normalized);
    });
  }, [leads, sourceFilter]);

  // Create set of filtered lead IDs for quick lookup
  const filteredLeadIds = useMemo(() => {
    return new Set(filteredLeads.map(l => l.id));
  }, [filteredLeads]);

  // Filter calls to only include those linked to filtered leads
  const filteredCalls = useMemo(() => {
    if (sourceFilter.length === 0) return calls;
    
    return calls.filter(call => {
      // If call has no lead_id, exclude when filtering
      if (!call.lead_id) return false;
      return filteredLeadIds.has(call.lead_id);
    });
  }, [calls, sourceFilter, filteredLeadIds]);

  // Filter funded investors to only include those linked to filtered leads
  const filteredFundedInvestors = useMemo(() => {
    if (sourceFilter.length === 0) return fundedInvestors;
    
    return fundedInvestors.filter(investor => {
      // If funded investor has no lead_id, exclude when filtering
      if (!investor.lead_id) return false;
      return filteredLeadIds.has(investor.lead_id);
    });
  }, [fundedInvestors, sourceFilter, filteredLeadIds]);

  return {
    filteredLeads,
    filteredCalls,
    filteredFundedInvestors,
    totalLeads: leads.length,
    filteredLeadCount: filteredLeads.length,
    isFiltered: sourceFilter.length > 0,
    uniqueSources,
  };
}

/**
 * Calculate source-filtered aggregated metrics
 */
export function useSourceFilteredAggregatedMetrics(
  leads: Lead[] = [],
  calls: Call[] = [],
  fundedInvestors: FundedInvestor[] = [],
  totalAdSpend: number = 0
) {
  const { sourceFilter } = useDateFilter();
  const { 
    filteredLeads, 
    filteredCalls, 
    filteredFundedInvestors,
    isFiltered 
  } = useSourceFilteredMetrics(leads, calls, fundedInvestors);

  const metrics = useMemo(() => {
    const validLeads = filteredLeads.filter(l => !l.is_spam);
    const spamLeads = filteredLeads.filter(l => l.is_spam);
    const bookedCalls = filteredCalls.filter(c => !c.is_reconnect);
    const showedCalls = filteredCalls.filter(c => c.showed && !c.is_reconnect);
    const reconnectCalls = filteredCalls.filter(c => c.is_reconnect);
    const reconnectShowed = reconnectCalls.filter(c => c.showed);
    
    const fundedCount = filteredFundedInvestors.length;
    const fundedDollars = filteredFundedInvestors.reduce((sum, f) => {
      const amount = (f.funded_amount && f.funded_amount > 0) ? f.funded_amount : (f.commitment_amount || 0);
      return sum + amount;
    }, 0);

    // Calculate cost metrics using full ad spend but filtered lead counts
    // This gives "true CPL" for the selected source
    const costPerLead = validLeads.length > 0 ? totalAdSpend / validLeads.length : 0;
    const costPerCall = bookedCalls.length > 0 ? totalAdSpend / bookedCalls.length : 0;
    const costPerShow = showedCalls.length > 0 ? totalAdSpend / showedCalls.length : 0;
    const costPerInvestor = fundedCount > 0 ? totalAdSpend / fundedCount : 0;
    const costOfCapital = fundedDollars > 0 ? (totalAdSpend / fundedDollars) * 100 : 0;
    const showedPercent = bookedCalls.length > 0 ? (showedCalls.length / bookedCalls.length) * 100 : 0;

    return {
      totalLeads: validLeads.length,
      spamLeads: spamLeads.length,
      totalCalls: bookedCalls.length,
      showedCalls: showedCalls.length,
      reconnectCalls: reconnectCalls.length,
      reconnectShowed: reconnectShowed.length,
      fundedInvestors: fundedCount,
      fundedDollars,
      costPerLead,
      costPerCall,
      costPerShow,
      costPerInvestor,
      costOfCapital,
      showedPercent,
      totalAdSpend,
      isFiltered,
    };
  }, [filteredLeads, filteredCalls, filteredFundedInvestors, totalAdSpend, isFiltered]);

  return metrics;
}
