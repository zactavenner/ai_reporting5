import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Latest daily non-SMS form check (pg_cron 13:45 UTC): non-SMS forms on ACTIVE ads + last-7-day spend. */
export function NonSmsFormsPanel() {
  const { data } = useQuery({
    queryKey: ['non-sms-forms-latest'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('v_non_sms_forms_latest').select('ran_at, result').maybeSingle();
      if (error) return null; // migration not applied yet
      return data as { ran_at: string; result: { clients: any[] } } | null;
    },
  });
  if (!data) return null;
  const clients = data.result?.clients || [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Non-SMS lead forms on active ads</CardTitle>
        <div className="text-xs text-muted-foreground">Last check {new Date(data.ran_at).toLocaleString()}</div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {clients.length === 0 && <div className="text-muted-foreground">All active lead-form ads use SMS-verified forms.</div>}
        {clients.map((c) => (
          <div key={c.client_id}>
            <span className="font-medium">{c.client_name}</span> — ${Number(c.spend_last_7d || 0).toFixed(2)} last 7d
            <ul className="ml-4 list-disc text-xs text-muted-foreground">
              {(c.forms || []).map((f: any) => (
                <li key={f.form_id}>{f.form_name || f.form_id} ({f.form_id}) · {f.active_ads} active ad(s) · ${Number(f.spend_last_7d || 0).toFixed(2)}</li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
