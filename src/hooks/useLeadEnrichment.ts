import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LeadEnrichment {
  id: string;
  lead_id: string | null;
  client_id: string;
  external_id: string;
  enriched_at: string;
  source: string;
  raw_data: any;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  gender: string | null;
  birth_date: string | null;
  household_income: string | null;
  credit_range: string | null;
  company_name: string | null;
  company_title: string | null;
  linkedin_url: string | null;
  enriched_phones: any[];
  enriched_emails: any[];
  vehicles: any[];
  // Financial
  discretionary_income: string | null;
  financial_power: number | null;
  net_worth: string | null;
  net_worth_midpoint: number | null;
  home_ownership: string | null;
  home_value: number | null;
  median_home_value: number | null;
  mortgage_amount: number | null;
  owns_investments: boolean | null;
  is_investor: boolean | null;
  owns_stocks_bonds: boolean | null;
  // Demographics
  education: string | null;
  occupation: string | null;
  occupation_type: string | null;
  occupation_category: string | null;
  marital_status: string | null;
  age: number | null;
  generation: string | null;
  ethnicity: string | null;
  language: string | null;
  urbanicity: string | null;
  // Household
  household_adults: number | null;
  household_persons: number | null;
  has_children: boolean | null;
  dwelling_type: string | null;
  length_of_residence: number | null;
  is_veteran: boolean | null;
  // Company & Spouse
  companies: any[] | null;
  spouse_data: any[] | null;
  is_primary_identity: boolean | null;
  retargetiq_id: number | null;
  enrichment_methods_used: string[] | null;
  enrichment_match_count: number | null;
}

export function useLeadEnrichment(clientId: string, externalId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-enrichment', clientId, externalId],
    queryFn: async () => {
      if (!externalId) return null;
      const { data, error } = await supabase
        .from('lead_enrichment')
        .select('*')
        .eq('client_id', clientId)
        .eq('external_id', externalId)
        .maybeSingle();
      if (error) throw error;
      return data as LeadEnrichment | null;
    },
    enabled: !!clientId && !!externalId,
  });
}

export function useEnrichLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      client_id: string;
      lead_id?: string;
      external_id: string;
      phone?: string;
      email?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('enrich-lead-retargetiq', {
        body: params,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Enrichment failed');
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success('Lead enriched successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-enrichment', variables.client_id, variables.external_id] });
    },
    onError: (error: Error) => {
      toast.error(`Enrichment failed: ${error.message}`);
    },
  });
}
