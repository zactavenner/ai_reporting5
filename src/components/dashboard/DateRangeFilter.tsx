import { format } from 'date-fns';
import { Calendar as CalendarIcon, Download, Plus, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useState, useEffect, useMemo } from 'react';

interface DateRangeFilterProps {
  onExportCSV?: () => void;
  onAddClient?: () => void;
  onRefresh?: () => void;
  onImport?: () => void;
  showAddClient?: boolean;
  showImport?: boolean;
}

export function DateRangeFilter({ 
  onExportCSV, 
  onAddClient, 
  onRefresh, 
  onImport,
  showAddClient = true,
  showImport = false,
}: DateRangeFilterProps) {
  const { dateRange, setDateRange } = useDateFilter();
  const [preset, setPreset] = useState('last30');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Determine current preset based on actual date range
  const currentPreset = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(0, 0, 0, 0);
    
    // Check each preset
    const daysDiff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const isToday = to.getTime() === today.getTime();
    
    if (isToday && from.getTime() === today.getTime()) return 'today';
    
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (from.getTime() === yesterday.getTime() && to.getTime() === yesterday.getTime()) return 'yesterday';
    
    if (isToday && daysDiff === 7) return 'last7';
    if (isToday && daysDiff === 14) return 'last14';
    if (isToday && daysDiff === 30) return 'last30';
    if (isToday && daysDiff === 90) return 'last90';
    
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    if (from.getTime() === thisMonthStart.getTime() && isToday) return 'thisMonth';
    
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    if (from.getTime() === lastMonthStart.getTime() && to.getTime() === lastMonthEnd.getTime()) return 'lastMonth';
    
    const yearStart = new Date(today.getFullYear(), 0, 1);
    if (from.getTime() === yearStart.getTime() && isToday) return 'ytd';
    
    // Check for "all" - very old start date
    const allStartDate = new Date(2020, 0, 1);
    if (from.getTime() <= allStartDate.getTime() && isToday) return 'all';
    
    return 'custom';
  }, [dateRange]);

  // Keep preset state in sync with actual computed preset
  useEffect(() => {
    if (currentPreset !== 'custom') {
      setPreset(currentPreset);
    }
  }, [currentPreset]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let from = new Date(today);
    let to = new Date(today);
    
    switch (value) {
      case 'today':
        // from and to already set to today
        break;
      case 'yesterday':
        from.setDate(today.getDate() - 1);
        to = new Date(from);
        break;
      case 'last7':
        from.setDate(today.getDate() - 7);
        break;
      case 'last14':
        from.setDate(today.getDate() - 14);
        break;
      case 'last30':
        from.setDate(today.getDate() - 30);
        break;
      case 'last90':
        from.setDate(today.getDate() - 90);
        break;
      case 'thisMonth':
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        to = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'ytd':
        from = new Date(today.getFullYear(), 0, 1);
        break;
      case 'all':
        // Set to a very old date to show all data
        from = new Date(2020, 0, 1);
        break;
    }
    
    setDateRange({ from, to });
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setPreset('custom');
      setDateRange({ from: range.from, to: range.to });
      setCalendarOpen(false);
    } else if (range?.from) {
      // Partial selection - wait for complete range
    }
  };

  return (
    <div className="border-2 border-border bg-card p-4">
      <h2 className="font-bold text-lg mb-1">Filters & Actions</h2>
      <p className="text-sm text-muted-foreground mb-4">Select date range and export data</p>
      
      <div className="flex flex-wrap items-center gap-3">
        <Select value={currentPreset === 'custom' ? 'custom' : preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="last7">Last 7 Days</SelectItem>
            <SelectItem value="last14">Last 14 Days</SelectItem>
            <SelectItem value="last30">Last 30 Days</SelectItem>
            <SelectItem value="last90">Last 90 Days</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="all">All Time (Max)</SelectItem>
            {currentPreset === 'custom' && <SelectItem value="custom">Custom Range</SelectItem>}
          </SelectContent>
        </Select>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-64 justify-start text-left font-normal',
                !dateRange && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, 'LLL dd, yyyy')} -{' '}
                    {format(dateRange.to, 'LLL dd, yyyy')}
                  </>
                ) : (
                  format(dateRange.from, 'LLL dd, yyyy')
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {onRefresh && (
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}

        {showImport && onImport && (
          <Button variant="outline" onClick={onImport}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        )}

        {onExportCSV && (
          <Button variant="outline" onClick={onExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}

        {showAddClient && onAddClient && (
          <Button onClick={onAddClient}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>
    </div>
  );
}
