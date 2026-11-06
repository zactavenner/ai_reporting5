/**
 * Ads → Management. The full per-client Ads Manager (launch readiness,
 * campaigns / ad sets / ads, launches, Jeremy review & automation, AI
 * insights) lives here, with a client picker on top.
 */
import { Suspense, lazy, useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients } from '@/hooks/useClients';

const AdsManagerTab = lazy(() =>
  import('@/components/ads-manager/AdsManagerTab').then((m) => ({ default: m.AdsManagerTab })),
);

const STORAGE_KEY = 'ads-management:last-client';

export function AdsManagementPage() {
  const { data: clients = [], isLoading } = useClients();
  const sorted = useMemo(
    () =>
      clients
        .filter((c) => c.status === 'active' || c.status === 'onboarding')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const [selectedId, setSelectedId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const selected = sorted.find((c) => c.id === selectedId) || sorted[0];

  const onChange = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Ads Management</h1>
            <p className="text-xs text-muted-foreground">Launch readiness, campaigns, ad sets, ads and AI insights per client.</p>
          </div>
        </div>
        <Select value={selected?.id || ''} onValueChange={onChange}>
          <SelectTrigger className="h-9 w-full sm:w-[280px] rounded-xl">
            <SelectValue placeholder={isLoading ? 'Loading clients…' : 'Pick a client'} />
          </SelectTrigger>
          <SelectContent>
            {sorted.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected ? (
        <Suspense fallback={<div className="text-sm text-muted-foreground p-3">Loading ads manager…</div>}>
          <AdsManagerTab key={selected.id} clientId={selected.id} clientName={selected.name} />
        </Suspense>
      ) : (
        !isLoading && <div className="text-sm text-muted-foreground">No active or onboarding clients.</div>
      )}
    </div>
  );
}
