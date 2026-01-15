import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WebhookLog {
  id: string;
  client_id: string;
  webhook_type: string;
  status: string;
  payload: string | null;
  error_message: string | null;
  processed_at: string;
}

export interface WebhookMapping {
  valueField?: string;
  dateField?: string;
  statusField?: string;
  summaryField?: string;
}

export interface WebhookDefinition {
  id: string;
  label: string;
  description: string;
  endpointSuffix: string;
  samplePayload: object;
  mappingFields: {
    key: keyof WebhookMapping;
    label: string;
    placeholder: string;
    expectedType: 'string' | 'number' | 'date';
    helperText?: string;
  }[];
}

export const WEBHOOK_DEFINITIONS: WebhookDefinition[] = [
  {
    id: 'lead',
    label: '1. New Lead + Pipeline Value',
    endpointSuffix: 'lead',
    description: 'Trigger on Form Submit or Contact Created. Include pipeline value if available.',
    samplePayload: {
      contact: {
        id: "ghl_123456",
        email: "lead@example.com",
        phone: "+15550000000",
        firstName: "John",
        lastName: "Doe",
        custom_fields: { estimated_value: "1500.00" }
      }
    },
    mappingFields: [
      {
        key: 'valueField',
        label: 'Pipeline Value Field',
        placeholder: 'contact.custom_fields.estimated_value',
        expectedType: 'number',
        helperText: 'Path to the revenue or deal value.'
      }
    ]
  },
  {
    id: 'booked',
    label: '2. Booked Call',
    endpointSuffix: 'booked',
    description: 'Trigger when Appointment Status is confirmed.',
    samplePayload: {
      appointment: {
        id: "app_987",
        status: "confirmed",
        contactId: "ghl_123456",
        meta: { start_time: "2024-01-15T10:00:00Z" }
      }
    },
    mappingFields: []
  },
  {
    id: 'showed',
    label: '3. Showed Call',
    endpointSuffix: 'showed',
    description: 'Trigger when Appointment Status is marked as Showed.',
    samplePayload: {
      appointment: {
        id: "app_987",
        status: "showed"
      }
    },
    mappingFields: []
  },
  {
    id: 'committed',
    label: '4. Committed Investors + Amount',
    endpointSuffix: 'committed',
    description: 'Trigger when an investor commits. MUST include the commitment dollar amount.',
    samplePayload: {
      opportunity: {
        status: "won",
        stage: "Committed",
        contactId: "ghl_123456",
        details: { monetary_value: 50000.00, currency: "USD" }
      }
    },
    mappingFields: [
      {
        key: 'valueField',
        label: 'Amount Field',
        placeholder: 'opportunity.details.monetary_value',
        expectedType: 'number'
      }
    ]
  },
  {
    id: 'funded',
    label: '5. Funded Investors + Amount',
    endpointSuffix: 'funded',
    description: 'Trigger when funds are received. MUST include the funded dollar amount.',
    samplePayload: {
      opportunity: {
        id: "opp_555",
        status: "won",
        stage: "Funded",
        contactId: "ghl_123456",
        details: { monetary_value: 50000.00 }
      }
    },
    mappingFields: [
      {
        key: 'valueField',
        label: 'Amount Field',
        placeholder: 'opportunity.details.monetary_value',
        expectedType: 'number'
      }
    ]
  },
  {
    id: 'ad-spend',
    label: '6. Ad Spend Data',
    endpointSuffix: 'ad-spend',
    description: 'Push daily ad spend metrics. Useful for syncing external ad platforms.',
    samplePayload: {
      report: {
        date: "2024-01-15",
        platform: "facebook",
        metrics: { spend: "145.50", impressions: 4500, clicks: 120 }
      }
    },
    mappingFields: [
      {
        key: 'valueField',
        label: 'Spend Amount Field',
        placeholder: 'report.metrics.spend',
        expectedType: 'number'
      },
      {
        key: 'dateField',
        label: 'Date Field',
        placeholder: 'report.date',
        expectedType: 'date'
      }
    ]
  },
  {
    id: 'bad-lead',
    label: '7. Bad Leads',
    endpointSuffix: 'bad-lead',
    description: 'Trigger to mark a lead as spam or unqualified.',
    samplePayload: {
      event: {
        contact_id: "ghl_123456",
        disposition: { reason: "spam", notes: "Bot traffic detected" }
      }
    },
    mappingFields: []
  },
];

export function useWebhookLogs(clientId: string | undefined) {
  return useQuery({
    queryKey: ['webhook-logs', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('processed_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as WebhookLog[];
    },
    enabled: !!clientId,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useWebhookMappings(clientId: string | undefined) {
  return useQuery({
    queryKey: ['webhook-mappings', clientId],
    queryFn: async () => {
      if (!clientId) return {};
      
      const { data, error } = await supabase
        .from('client_settings')
        .select('webhook_mappings')
        .eq('client_id', clientId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return (data?.webhook_mappings || {}) as Record<string, WebhookMapping>;
    },
    enabled: !!clientId,
  });
}

export function useUpdateWebhookMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      mappings
    }: {
      clientId: string;
      mappings: Record<string, WebhookMapping>;
    }) => {
      // First check if settings exist
      const { data: existing } = await supabase
        .from('client_settings')
        .select('id')
        .eq('client_id', clientId)
        .single();

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('client_settings')
          .update({ webhook_mappings: mappings as any })
          .eq('client_id', clientId)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('client_settings')
          .insert({ client_id: clientId, webhook_mappings: mappings as any })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webhook-mappings', variables.clientId] });
      toast.success('Webhook mappings saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save mappings: ${error.message}`);
    },
  });
}

export function useClearWebhookLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('webhook_logs')
        .delete()
        .eq('client_id', clientId);

      if (error) throw error;
    },
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['webhook-logs', clientId] });
      toast.success('Webhook logs cleared');
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear logs: ${error.message}`);
    },
  });
}

export function useClientWebhookSecret(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-webhook-secret', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('webhook_secret')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data?.webhook_secret as string | null;
    },
    enabled: !!clientId,
  });
}

export function useRegenerateWebhookSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      // Generate a new secret on the client side
      const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { error } = await supabase
        .from('clients')
        .update({ webhook_secret: newSecret })
        .eq('id', clientId);

      if (error) throw error;
      return newSecret;
    },
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['client-webhook-secret', clientId] });
      toast.success('Webhook secret regenerated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to regenerate secret: ${error.message}`);
    },
  });
}
