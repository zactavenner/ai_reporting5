import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Download, Plus } from 'lucide-react';
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

interface DateRangeFilterProps {
  onExportCSV?: () => void;
  onAddClient?: () => void;
  showAddClient?: boolean;
}

export function DateRangeFilter({ onExportCSV, onAddClient, showAddClient = true }: DateRangeFilterProps) {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2025, 11, 7),
    to: new Date(2026, 0, 6),
  });
  const [preset, setPreset] = useState('last30');

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const today = new Date();
    let from = new Date();
    let to = new Date();
    
    switch (value) {
      case 'today':
        from = new Date(today);
        to = new Date(today);
        break;
      case 'yesterday':
        from = new Date(today);
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
    }
    
    setDateRange({ from, to });
  };

  return (
    <div className="border-2 border-border bg-card p-4">
      <h2 className="font-bold text-lg mb-1">Filters & Actions</h2>
      <p className="text-sm text-muted-foreground mb-4">Select date range and export data</p>
      
      <div className="flex flex-wrap items-center gap-3">
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-36">
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
          </SelectContent>
        </Select>

        <Popover>
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
              onSelect={(range) => range && setDateRange(range as { from: Date; to: Date })}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" onClick={onExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>

        {showAddClient && (
          <Button onClick={onAddClient}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>
    </div>
  );
}
