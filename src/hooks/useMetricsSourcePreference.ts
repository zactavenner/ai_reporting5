import { useEffect, useState, useCallback } from 'react';

export type MetricsSource = 'sheet' | 'database';

const KEY = (clientId: string) => `metrics-source:${clientId}`;

export function useMetricsSourcePreference(
  clientId: string | undefined,
  defaultSource: MetricsSource = 'database',
  hasSheet: boolean = false,
) {
  const [source, setSourceState] = useState<MetricsSource>(defaultSource);

  useEffect(() => {
    if (!clientId) return;
    try {
      const stored = localStorage.getItem(KEY(clientId));
      if (stored === 'sheet' || stored === 'database') {
        setSourceState(hasSheet || stored === 'database' ? stored : 'database');
        return;
      }
    } catch {}
    setSourceState(hasSheet ? defaultSource : 'database');
  }, [clientId, defaultSource, hasSheet]);

  const setSource = useCallback((next: MetricsSource) => {
    setSourceState(next);
    if (clientId) {
      try { localStorage.setItem(KEY(clientId), next); } catch {}
    }
  }, [clientId]);

  return { source, setSource };
}