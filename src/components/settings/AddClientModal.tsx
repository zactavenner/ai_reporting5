import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const addClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(100, 'Name must be less than 100 characters'),
  // KPI Thresholds
  kpi_cost_per_lead: z.coerce.number().min(0, 'Must be a positive number').optional(),
  kpi_cost_per_call: z.coerce.number().min(0, 'Must be a positive number').optional(),
  kpi_cost_per_investor: z.coerce.number().min(0, 'Must be a positive number').optional(),
  kpi_cost_of_capital: z.coerce.number().min(0, 'Must be a positive number').max(100, 'Must be 100 or less').optional(),
  slack_webhook_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type AddClientFormValues = z.infer<typeof addClientSchema>;

interface AddClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddClientModal({ open, onOpenChange }: AddClientModalProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const form = useForm<AddClientFormValues>({
    resolver: zodResolver(addClientSchema),
    defaultValues: {
      name: '',
      kpi_cost_per_lead: undefined,
      kpi_cost_per_call: undefined,
      kpi_cost_per_investor: undefined,
      kpi_cost_of_capital: undefined,
      slack_webhook_url: '',
    },
  });

  const onSubmit = async (values: AddClientFormValues) => {
    setSaving(true);
    try {
      // Create the client
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: values.name,
          status: 'active',
        })
        .select()
        .single();

      if (clientError) throw clientError;

      // Create alert configs if KPI thresholds are set
      const alertConfigs = [];
      const webhookUrl = values.slack_webhook_url || null;

      if (values.kpi_cost_per_lead !== undefined && values.kpi_cost_per_lead > 0) {
        alertConfigs.push({
          client_id: client.id,
          metric: 'cost_per_lead',
          threshold: values.kpi_cost_per_lead,
          operator: 'above',
          slack_webhook_url: webhookUrl,
          enabled: true,
        });
      }

      if (values.kpi_cost_per_call !== undefined && values.kpi_cost_per_call > 0) {
        alertConfigs.push({
          client_id: client.id,
          metric: 'cost_per_call',
          threshold: values.kpi_cost_per_call,
          operator: 'above',
          slack_webhook_url: webhookUrl,
          enabled: true,
        });
      }

      if (values.kpi_cost_per_investor !== undefined && values.kpi_cost_per_investor > 0) {
        alertConfigs.push({
          client_id: client.id,
          metric: 'cost_per_investor',
          threshold: values.kpi_cost_per_investor,
          operator: 'above',
          slack_webhook_url: webhookUrl,
          enabled: true,
        });
      }

      if (values.kpi_cost_of_capital !== undefined && values.kpi_cost_of_capital > 0) {
        alertConfigs.push({
          client_id: client.id,
          metric: 'cost_of_capital',
          threshold: values.kpi_cost_of_capital,
          operator: 'above',
          slack_webhook_url: webhookUrl,
          enabled: true,
        });
      }

      if (alertConfigs.length > 0) {
        const { error: alertError } = await supabase
          .from('alert_configs')
          .insert(alertConfigs);

        if (alertError) {
          console.error('Error creating alert configs:', alertError);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`Client "${values.name}" created successfully`);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating client:', error);
      toast.error('Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl border-2 border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Add New Client</DialogTitle>
          <DialogDescription>
            Create a new client to track their capital raising performance
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            {/* Client Info */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Capital" {...field} />
                  </FormControl>
                  <FormDescription>
                    After creating, configure webhooks in client settings to ingest data
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* KPI Thresholds */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">KPI Thresholds (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                  Set alert thresholds for key performance indicators
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="kpi_cost_per_lead"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Per Lead</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number" 
                            placeholder="150" 
                            className="pl-7"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="kpi_cost_per_call"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Per Call</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number" 
                            placeholder="400" 
                            className="pl-7"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="kpi_cost_per_investor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Per Investor</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number" 
                            placeholder="5000" 
                            className="pl-7"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="kpi_cost_of_capital"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost of Capital %</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="number" 
                            placeholder="15" 
                            className="pr-7"
                            {...field}
                            value={field.value ?? ''}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="slack_webhook_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slack Webhook URL (for alerts)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://hooks.slack.com/services/..." 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Optional: Receive Slack notifications when KPIs exceed thresholds
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Client'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
