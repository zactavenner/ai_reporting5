import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, CalendarDays } from 'lucide-react';

const SCHEDULE_PRESETS = [
  { label: 'Every hour', value: '0 * * * *', description: 'Runs at the top of every hour' },
  { label: 'Every 2 hours', value: '0 */2 * * *', description: 'Runs every 2 hours' },
  { label: 'Every 4 hours', value: '0 */4 * * *', description: 'Runs 6 times a day' },
  { label: 'Every 6 hours', value: '0 */6 * * *', description: 'Runs 4 times a day' },
  { label: 'Daily at 6 AM', value: '0 6 * * *', description: 'Once daily, early morning' },
  { label: 'Daily at 9 AM', value: '0 9 * * *', description: 'Once daily, start of business' },
  { label: 'Daily at 1 PM', value: '0 13 * * *', description: 'Once daily, afternoon' },
  { label: 'Daily at 6 PM', value: '0 18 * * *', description: 'Once daily, end of business' },
  { label: 'Twice daily (9 AM & 5 PM)', value: '0 9,17 * * *', description: 'Morning and evening' },
  { label: 'Weekdays at 8 AM', value: '0 8 * * 1-5', description: 'Mon–Fri only' },
  { label: 'Weekly (Monday 9 AM)', value: '0 9 * * 1', description: 'Once per week' },
  { label: 'Manual only', value: '', description: 'No automatic schedule' },
  { label: 'Custom cron', value: '__custom__', description: 'Enter your own cron expression' },
];

interface CronSchedulePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function CronSchedulePicker({ value, onChange }: CronSchedulePickerProps) {
  const matchedPreset = SCHEDULE_PRESETS.find(p => p.value === value && p.value !== '__custom__');
  const [mode, setMode] = useState<string>(matchedPreset ? matchedPreset.value : '__custom__');
  const [customValue, setCustomValue] = useState(value || '');

  useEffect(() => {
    const matched = SCHEDULE_PRESETS.find(p => p.value === value && p.value !== '__custom__');
    if (matched) {
      setMode(matched.value);
    } else if (value) {
      setMode('__custom__');
      setCustomValue(value);
    } else {
      setMode('');
    }
  }, [value]);

  const handlePresetChange = (preset: string) => {
    setMode(preset);
    if (preset === '__custom__') {
      onChange(customValue || '0 * * * *');
    } else {
      onChange(preset);
    }
  };

  const handleCustomChange = (val: string) => {
    setCustomValue(val);
    onChange(val);
  };

  const currentPreset = SCHEDULE_PRESETS.find(p => p.value === mode);

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Schedule
      </Label>
      <Select value={mode} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select schedule..." />
        </SelectTrigger>
        <SelectContent>
          {SCHEDULE_PRESETS.map(preset => (
            <SelectItem key={preset.value || '__manual__'} value={preset.value === '' ? '__none__' : preset.value}>
              <div className="flex flex-col">
                <span className="font-medium">{preset.label}</span>
                <span className="text-[10px] text-muted-foreground">{preset.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mode === '__custom__' && (
        <div className="space-y-1">
          <Input
            value={customValue}
            onChange={e => handleCustomChange(e.target.value)}
            placeholder="0 6 * * *"
            className="font-mono text-sm"
          />
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Format: minute hour day month weekday
          </p>
        </div>
      )}

      {currentPreset && mode !== '__custom__' && (
        <p className="text-[10px] text-muted-foreground">
          {mode === '__none__' ? 'Trigger manually via the Run button' : `Cron: ${mode}`}
        </p>
      )}
    </div>
  );
}
