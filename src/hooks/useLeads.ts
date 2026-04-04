import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EnrichedLead, QualificationTier, RoutingDestination } from '@/components/funnel-builder/admin/mockLeads';

function mapDbLeadToEnrichedLead(row: Record<string, unknown>): EnrichedLead {
  return {
    id: row.id as string,
    leadName: row.lead_name as string,
    leadEmail: (row.lead_email as string) || '',
    leadPhone: (row.lead_phone as string) || '',
    source: (row.source as string) || '',
    createdAt: (row.created_at as string)?.split('T')[0] || '',
    status: row.status as EnrichedLead['status'],
    accredited: (row.accredited as boolean) || false,
    investmentRange: (row.investment_range as string) || '',
    appointmentDate: (row.appointment_date as string) || null,
    qualificationTier: (row.qualification_tier as QualificationTier) || 'unqualified',
    qualificationScore: (row.qualification_score as number) || 0,
    routingDestination: (row.routing_destination as RoutingDestination) || 'downsell',
    showedUp: row.showed_up as boolean | null,
    enrichmentStatus: (row.enrichment_status as EnrichedLead['enrichmentStatus']) || 'pending',
    enrichmentMethod: (row.enrichment_method as 'phone' | 'email') || null,
    identity: row.identity as EnrichedLead['identity'],
    address: row.address as EnrichedLead['address'],
    financial: row.financial as EnrichedLead['financial'],
    investments: row.investments as EnrichedLead['investments'],
    home: row.home as EnrichedLead['home'],
    household: row.household as EnrichedLead['household'],
    education: row.education as EnrichedLead['education'],
    interests: (row.interests as string[]) || [],
    vehicles: (row.vehicles as EnrichedLead['vehicles']) || [],
    companies: (row.companies as EnrichedLead['companies']) || [],
    phones: (row.phones as EnrichedLead['phones']) || [],
    emails: (row.emails as EnrichedLead['emails']) || [],
    donations: (row.donations as string[]) || [],
    reading: (row.reading as string[]) || [],
  };
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((row: Record<string, unknown>) => mapDbLeadToEnrichedLead(row));
    },
    refetchInterval: 30000,
  });
}
