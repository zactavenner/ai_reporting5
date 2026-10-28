import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Blended CPL vs SMS-verified CPL (form-level verification). NULL / divide-by-zero shows "n/a", never 0. */
export function SmsVerifiedCplCard({ clientId, startDate, endDate }: { clientId: string; startDate?: string; endDate?: string }) {
  const { data } = useQuery({
    queryKey: ['sms-verified-cpl', clientId, startDate, endDate],
    queryFn: async () => {
      let q = (supabase as any).from('daily_metrics')
        .select('ad_spend, leads, meta_leads_verified, spend_verified_forms, spend_unverified_forms')
        .eq('client_id', clientId);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
      const { data, error } = await q;
      if (error) return null; // columns not migrated yet
      return data as any[];
    },
    enabled: !!clientId,
  });
  if (!data) return null;
  const sum = (k: string) => {
    const vals = data.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  };
  const spend = sum('ad_spend'), leads = sum('leads');
  const vLeads = sum('meta_leads_verified'), vSpend = sum('spend_verified_forms'), uSpend = sum('spend_unverified_forms');
  const div = (a: number | null, b: number | null) => (a === null || !b ? null : a / b);
  const blended = div(spend, leads), verified = div(vSpend, vLeads);
  const nonSmsPct = div(uSpend, vSpend === null || uSpend === null ? null : vSpend + uSpend);
  const money = (v: number | null) => (v === null ? 'n/a' : `$${v.toFixed(2)}`);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Cost per lead: blended vs SMS-verified</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground">Blended CPL</div><div className="text-xl font-semibold">{money(blended)}</div></div>
        <div><div className="text-muted-foreground">Verified CPL</div><div className="text-xl font-semibold">{money(verified)}</div></div>
        <div><div className="text-muted-foreground">Verified leads</div><div className="text-xl font-semibold">{vLeads === null ? 'n/a' : vLeads}</div></div>
        <div><div className="text-muted-foreground">Spend on non-SMS forms</div><div className="text-xl font-semibold">{nonSmsPct === null ? 'n/a' : `${(nonSmsPct * 100).toFixed(0)}%`}</div></div>
      </CardContent>
    </Card>
  );
}
