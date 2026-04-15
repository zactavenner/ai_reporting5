import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RepairPhase = 'idle' | 'meta' | 'ghl' | 'calendar' | 'recalculating';

export interface RepairResult {
  meta: { ok: boolean; error?: string; skipped?: boolean };
  ghl: { ok: boolean; error?: string; skipped?: boolean };
  calendar: { ok: boolean; error?: string; skipped?: boolean };
}

interface RepairTargets {
  hasMeta: boolean;
  hasGhl: boolean;
  hasCalendars: boolean;
}

/**
 * One-click per-client repair sync.
 * Runs Meta Ads → GHL Contacts → Calendar Appointments in sequence so
 * a row whose CRM-leads / booked-calls cells are flagged red can be
 * fixed without leaving the dashboard.
 *
 * - Meta ads sync repopulates daily_metrics (ad spend, impressions, clicks)
 * - GHL contacts sync repopulates the leads table (CRM Leads column)
 * - Calendar sync repopulates the calls table (Booked / Shows columns)
 */
export function useRepairClientSync() {
  const queryClient = useQueryClient();
  const [busyClientId, setBusyClientId] = useState<string | null>(null);
  const [phase, setPhase] = useState<RepairPhase>('idle');

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['client-source-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['calls'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
    queryClient.invalidateQueries({ queryKey: ['all-client-full-settings'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['yesterday-metrics'] });
  }, [queryClient]);

  const runRepair = useCallback(
    async (clientId: string, targets: RepairTargets): Promise<RepairResult> => {
      setBusyClientId(clientId);
      const result: RepairResult = {
        meta: { ok: false, skipped: !targets.hasMeta },
        ghl: { ok: false, skipped: !targets.hasGhl },
        calendar: { ok: false, skipped: !targets.hasCalendars },
      };

      // Step 1 — Meta Ads (ad spend → daily_metrics)
      if (targets.hasMeta) {
        setPhase('meta');
        try {
          const { error } = await supabase.functions.invoke('sync-meta-ads', {
            body: { clientId },
          });
          if (error) throw new Error(error.message);
          result.meta.ok = true;
        } catch (err) {
          result.meta.error = err instanceof Error ? err.message : 'Unknown';
        }
      }

      // Step 2 — GHL Contacts (CRM Leads column)
      if (targets.hasGhl) {
        setPhase('ghl');
        try {
          const { error } = await supabase.functions.invoke('sync-ghl-contacts', {
            body: { client_id: clientId, mode: 'contacts' },
          });
          if (error) throw new Error(error.message);
          result.ghl.ok = true;
        } catch (err) {
          result.ghl.error = err instanceof Error ? err.message : 'Unknown';
        }
      }

      // Step 3 — Calendar appointments (Booked / Shows columns)
      if (targets.hasCalendars) {
        setPhase('calendar');
        try {
          const { error } = await supabase.functions.invoke('sync-calendar-appointments', {
            body: { clientId },
          });
          if (error) throw new Error(error.message);
          result.calendar.ok = true;
        } catch (err) {
          result.calendar.error = err instanceof Error ? err.message : 'Unknown';
        }
      }

      setPhase('recalculating');
      invalidate();

      // Build summary toast
      const failed: string[] = [];
      const ok: string[] = [];
      if (!result.meta.skipped) (result.meta.ok ? ok : failed).push('Meta');
      if (!result.ghl.skipped) (result.ghl.ok ? ok : failed).push('GHL');
      if (!result.calendar.skipped) (result.calendar.ok ? ok : failed).push('Calendar');

      if (failed.length === 0 && ok.length > 0) {
        toast.success(`Repair complete: ${ok.join(' + ')} synced`);
      } else if (failed.length > 0 && ok.length > 0) {
        toast.warning(`Partial repair — ok: ${ok.join(', ')} | failed: ${failed.join(', ')}`);
      } else if (failed.length > 0) {
        toast.error(`Repair failed: ${failed.join(', ')}`);
      } else {
        toast.info('Nothing to sync — no integrations configured for this client');
      }

      setPhase('idle');
      setBusyClientId(null);
      return result;
    },
    [invalidate]
  );

  return {
    runRepair,
    busyClientId,
    phase,
    isBusy: (clientId: string) => busyClientId === clientId,
  };
}
