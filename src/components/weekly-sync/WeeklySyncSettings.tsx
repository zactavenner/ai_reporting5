import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  clientId: string;
}

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export function WeeklySyncSettings({ clientId }: Props) {
  const qc = useQueryClient();
  const [day, setDay] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [tz, setTz] = useState<string>('America/New_York');
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['weekly-sync-settings', clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_settings')
        .select('weekly_sync_day, weekly_sync_time, weekly_sync_timezone')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setDay(settings.weekly_sync_day != null ? String(settings.weekly_sync_day) : '');
      setTime(settings.weekly_sync_time?.slice(0, 5) || '');
      setTz(settings.weekly_sync_timezone || 'America/New_York');
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        weekly_sync_day: day === '' ? null : parseInt(day, 10),
        weekly_sync_time: time || null,
        weekly_sync_timezone: tz,
      };
      const { error } = await (supabase as any)
        .from('client_settings')
        .upsert(payload, { onConflict: 'client_id' });
      if (error) throw error;
      toast.success('Weekly sync schedule saved');
      qc.invalidateQueries({ queryKey: ['weekly-sync-settings', clientId] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Weekly Meeting Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Timezone</Label>
              <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/New_York" />
            </div>
            <Button onClick={save} disabled={saving} size="sm">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Auto-recap below will refresh each time you open this tab and rolls from the last completed sync.
        </p>
      </CardContent>
    </Card>
  );
}