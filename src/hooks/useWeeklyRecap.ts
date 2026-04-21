import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

export interface WeeklyRecapData {
  windowStart: string;
  windowEnd: string;
  tasks: {
    created: number;
    completed: number;
    completedList: Array<{ id: string; title: string; stage: string; completed_at: string | null }>;
    createdList: Array<{ id: string; title: string; stage: string; created_at: string }>;
    byStage: Record<string, { created: number; completed: number }>;
  };
  numbers: {
    leads: number;
    bookedCalls: number;
    shows: number;
    showRate: number;
    committed: number;
    funded: number;
    raiseGoal: number;
    progressPct: number;
  };
  creatives: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    blendedCpl: number | null;
    top: Array<{
      id: string;
      name: string;
      thumb: string | null;
      spend: number;
      cpl: number | null;
      leads: number;
    }>;
  };
  pipeline: {
    movedCount: number;
    stalledCount: number;
    closestList: Array<{ id: string; name: string; amount: number; stage: string }>;
  };
}

export function useWeeklyRecap(clientId: string | undefined, sinceDate?: string | null) {
  const windowStartIso = sinceDate
    ? new Date(sinceDate).toISOString()
    : subDays(new Date(), 7).toISOString();
  const windowEndIso = new Date().toISOString();

  return useQuery({
    queryKey: ['weekly-recap', clientId, windowStartIso],
    enabled: !!clientId,
    queryFn: async (): Promise<WeeklyRecapData> => {
      const cId = clientId!;

      // ── Tasks ──
      const [createdRes, completedRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, stage, created_at')
          .eq('client_id', cId)
          .gte('created_at', windowStartIso)
          .lte('created_at', windowEndIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select('id, title, stage, completed_at')
          .eq('client_id', cId)
          .eq('status', 'done')
          .gte('completed_at', windowStartIso)
          .lte('completed_at', windowEndIso)
          .order('completed_at', { ascending: false }),
      ]);

      const createdList = (createdRes.data || []) as any[];
      const completedList = (completedRes.data || []) as any[];
      const byStage: Record<string, { created: number; completed: number }> = {};
      for (const t of createdList) {
        byStage[t.stage] = byStage[t.stage] || { created: 0, completed: 0 };
        byStage[t.stage].created += 1;
      }
      for (const t of completedList) {
        byStage[t.stage] = byStage[t.stage] || { created: 0, completed: 0 };
        byStage[t.stage].completed += 1;
      }

      // ── Numbers (leads, calls, funded) ──
      const [leadsRes, callsRes, fundedRes, settingsRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', cId)
          .gte('created_at', windowStartIso)
          .lte('created_at', windowEndIso),
        supabase
          .from('calls')
          .select('id, showed, booked_at')
          .eq('client_id', cId)
          .gte('booked_at', windowStartIso)
          .lte('booked_at', windowEndIso),
        supabase
          .from('funded_investors')
          .select('id, funded_amount, commitment_amount, funded_at')
          .eq('client_id', cId)
          .gte('funded_at', windowStartIso)
          .lte('funded_at', windowEndIso),
        supabase
          .from('client_settings')
          .select('total_raise_amount')
          .eq('client_id', cId)
          .maybeSingle(),
      ]);

      const calls = (callsRes.data || []) as any[];
      const bookedCalls = calls.length;
      const shows = calls.filter((c) => c.showed).length;
      const fundedRows = (fundedRes.data || []) as any[];
      const committed = fundedRows.reduce(
        (s, r) => s + Number(r.commitment_amount || 0),
        0,
      );
      const funded = fundedRows.reduce(
        (s, r) => s + Number(r.funded_amount || 0),
        0,
      );
      const raiseGoal = Number(settingsRes.data?.total_raise_amount || 0);

      // ── Creatives (last 7 days from meta_ads) ──
      const { data: ads } = await supabase
        .from('meta_ads')
        .select('id, name, thumbnail_url, video_thumbnail_url, full_image_url, image_url, spend, attributed_leads, cost_per_lead, impressions, clicks, synced_at')
        .eq('client_id', cId)
        .gte('synced_at', windowStartIso)
        .gt('spend', 0)
        .order('spend', { ascending: false })
        .limit(5);

      const adRows = (ads || []) as any[];
      const creativeTotals = adRows.reduce(
        (acc, a) => {
          acc.spend += Number(a.spend || 0);
          acc.impressions += Number(a.impressions || 0);
          acc.clicks += Number(a.clicks || 0);
          acc.leads += Number(a.attributed_leads || 0);
          return acc;
        },
        { spend: 0, impressions: 0, clicks: 0, leads: 0 },
      );

      // ── Pipeline (deals moved / stalled / closest) ──
      let movedCount = 0;
      let stalledCount = 0;
      let closestList: WeeklyRecapData['pipeline']['closestList'] = [];
      try {
        const { data: deals } = await (supabase as any)
          .from('deals')
          .select('id, deal_name, deal_value, stage, updated_at')
          .eq('client_id', cId)
          .order('deal_value', { ascending: false })
          .limit(200);
        const dealRows = (deals || []) as any[];
        const sevenDaysAgo = new Date(windowStartIso).getTime();
        const fourteenDaysAgo = subDays(new Date(), 14).getTime();
        movedCount = dealRows.filter(
          (d) => new Date(d.updated_at).getTime() >= sevenDaysAgo,
        ).length;
        stalledCount = dealRows.filter((d) => {
          const t = new Date(d.updated_at).getTime();
          return t < fourteenDaysAgo && !['closed_won', 'closed_lost'].includes(d.stage);
        }).length;
        closestList = dealRows
          .filter((d) => !['closed_won', 'closed_lost'].includes(d.stage))
          .slice(0, 5)
          .map((d) => ({ id: d.id, name: d.deal_name, amount: Number(d.deal_value || 0), stage: d.stage }));
      } catch {
        // deals table may not exist for some clients — silent fallback
      }

      return {
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
        tasks: {
          created: createdList.length,
          completed: completedList.length,
          completedList: completedList.slice(0, 10),
          createdList: createdList.slice(0, 10),
          byStage,
        },
        numbers: {
          leads: leadsRes.count || 0,
          bookedCalls,
          shows,
          showRate: bookedCalls > 0 ? (shows / bookedCalls) * 100 : 0,
          committed,
          funded,
          raiseGoal,
          progressPct: raiseGoal > 0 ? (funded / raiseGoal) * 100 : 0,
        },
        creatives: {
          ...creativeTotals,
          blendedCpl: creativeTotals.leads > 0 ? creativeTotals.spend / creativeTotals.leads : null,
          top: adRows.map((a) => ({
            id: a.id,
            name: a.name,
            thumb: a.video_thumbnail_url || a.full_image_url || a.image_url || a.thumbnail_url,
            spend: Number(a.spend || 0),
            cpl: a.cost_per_lead != null ? Number(a.cost_per_lead) : null,
            leads: Number(a.attributed_leads || 0),
          })),
        },
        pipeline: { movedCount, stalledCount, closestList },
      };
    },
  });
}

export function buildAutoFillFromRecap(
  recap: WeeklyRecapData,
): { numbers_notes: string; pipeline_notes: string; working_not_working: string } {
  const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const numbers_notes =
    `Leads: ${recap.numbers.leads}\n` +
    `Booked calls: ${recap.numbers.bookedCalls} (showed ${recap.numbers.shows}, ${recap.numbers.showRate.toFixed(0)}% show rate)\n` +
    `Committed: ${fmtMoney(recap.numbers.committed)}\n` +
    `Funded: ${fmtMoney(recap.numbers.funded)}` +
    (recap.numbers.raiseGoal > 0
      ? ` (${recap.numbers.progressPct.toFixed(1)}% of ${fmtMoney(recap.numbers.raiseGoal)} goal)`
      : '');

  const pipeline_notes =
    `Moved this week: ${recap.pipeline.movedCount}\n` +
    `Stalled (>14 days): ${recap.pipeline.stalledCount}\n` +
    (recap.pipeline.closestList.length
      ? `Closest to close:\n${recap.pipeline.closestList
          .map((d) => `• ${d.name} — ${fmtMoney(d.amount)} (${d.stage})`)
          .join('\n')}`
      : 'No active pipeline deals tracked.');

  const top = recap.creatives.top[0];
  const working_not_working = top
    ? `Top creative: ${top.name} — ${fmtMoney(top.spend)} spend, ${top.leads} leads, CPL ${top.cpl != null ? fmtMoney(top.cpl) : 'n/a'}\n` +
      `Blended CPL: ${recap.creatives.blendedCpl != null ? fmtMoney(recap.creatives.blendedCpl) : 'n/a'} across ${recap.creatives.top.length} active creatives\n` +
      `Test for next week: …`
    : 'No active creatives in last 7 days.';

  return { numbers_notes, pipeline_notes, working_not_working };
}