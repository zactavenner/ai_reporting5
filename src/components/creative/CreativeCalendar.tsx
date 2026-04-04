import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar, Image, Video, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CalendarCreative {
  id: string;
  title: string;
  type: string;
  status: string;
  client_id: string;
  client_name?: string;
  created_at: string;
  file_url?: string | null;
  platform?: string | null;
}

export function CreativeCalendar({ embedded = false }: { embedded?: boolean }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [clientFilter, setClientFilter] = useState<string>('all');
  const { data: clients = [] } = useClients();

  const { data: creatives = [] } = useQuery<CalendarCreative[]>({
    queryKey: ['calendar-creatives', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
      const { data } = await supabase
        .from('creatives')
        .select('id, title, type, status, client_id, created_at, file_url, platform')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: true });
      return (data || []) as CalendarCreative[];
    },
  });

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const enrichedCreatives = useMemo(() => {
    return creatives
      .map(c => ({ ...c, client_name: clientMap[c.client_id] || 'Unknown' }))
      .filter(c => clientFilter === 'all' || c.client_id === clientFilter);
  }, [creatives, clientMap, clientFilter]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getCreativesForDay = (date: Date) =>
    enrichedCreatives.filter(c => isSameDay(new Date(c.created_at), date));

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-3 w-3" />;
      case 'video': return <Video className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  const getStatusDot = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-400',
      pending: 'bg-amber-400',
      approved: 'bg-green-400',
      launched: 'bg-blue-400',
      revisions: 'bg-orange-400',
      rejected: 'bg-red-400',
    };
    return colors[status] || 'bg-muted-foreground';
  };

  return (
    <Card className="border-2 border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Creative Calendar
        </CardTitle>
        <div className="flex items-center gap-3">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.filter(c => c.status === 'active').map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {weeks.flat().map((date, idx) => {
            const dayCreatives = getCreativesForDay(date);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isToday = isSameDay(date, new Date());

            return (
              <div
                key={idx}
                className={`bg-card min-h-[80px] p-1.5 ${!isCurrentMonth ? 'opacity-40' : ''} ${isToday ? 'ring-1 ring-primary ring-inset' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(date, 'd')}
                </span>
                <div className="mt-1 space-y-0.5">
                  <TooltipProvider>
                    {dayCreatives.slice(0, 3).map(c => (
                      <Tooltip key={c.id}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-muted/60 truncate cursor-default">
                            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${getStatusDot(c.status)}`} />
                            {getTypeIcon(c.type)}
                            <span className="truncate">{c.title}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-medium">{c.title}</p>
                          <p className="text-muted-foreground">{c.client_name} • {c.status}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {dayCreatives.length > 3 && (
                      <span className="text-[10px] text-muted-foreground pl-1">+{dayCreatives.length - 3} more</span>
                    )}
                  </TooltipProvider>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {[
            { label: 'Draft', color: 'bg-slate-400' },
            { label: 'Pending', color: 'bg-amber-400' },
            { label: 'Approved', color: 'bg-green-400' },
            { label: 'Launched', color: 'bg-blue-400' },
            { label: 'Revisions', color: 'bg-orange-400' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              {s.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
