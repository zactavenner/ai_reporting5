import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const DEAL_STAGES = [
  'Lead',
  'Qualified',
  'Proposal Sent',
  'In Negotiation',
  'Due Diligence',
  'Closed Won',
  'Closed Lost',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  client_id: string;
  deal_name: string;
  deal_value: number;
  stage: DealStage;
  probability: number;
  expected_close_date: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  source: string | null;
  assigned_to: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export function useDeals(clientId?: string) {
  return useQuery({
    queryKey: ['deals', clientId],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('*')
        .order('updated_at', { ascending: false });
      if (clientId) query = query.eq('client_id', clientId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Deal[];
    },
  });
}

export function useAllDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });
}

export function useDealActivities(dealId?: string) {
  return useQuery({
    queryKey: ['deal-activities', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_activities')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DealActivity[];
    },
    enabled: !!dealId,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deal: Partial<Deal> & { client_id: string; deal_name: string }) => {
      const { data, error } = await supabase
        .from('deals')
        .insert(deal)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal created');
    },
    onError: (e: any) => toast.error('Failed to create deal: ' + e.message),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Deal> }) => {
      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: (e: any) => toast.error('Failed to update deal: ' + e.message),
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal deleted');
    },
    onError: (e: any) => toast.error('Failed to delete deal: ' + e.message),
  });
}

export function useCreateDealActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activity: { deal_id: string; activity_type: string; description?: string; created_by?: string }) => {
      const { data, error } = await supabase
        .from('deal_activities')
        .insert(activity)
        .select()
        .single();
      if (error) throw error;
      // Also update last_activity_at on the deal
      await supabase
        .from('deals')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', activity.deal_id);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['deal-activities', data.deal_id] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: (e: any) => toast.error('Failed to add activity: ' + e.message),
  });
}
