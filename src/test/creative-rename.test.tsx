import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRenameCreative } from '@/hooks/useCreatives';

const db = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; client_id: string; title: string; status: string; file_url: string }>,
  patches: [] as Array<Record<string, unknown>>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.patches.push(patch);
        const filters: Record<string, string> = {};
        const query = {
          eq: (key: string, value: string) => { filters[key] = value; return query; },
          select: () => query,
          single: async () => {
            const row = db.rows.find(item => Object.entries(filters).every(([key, value]) => item[key as keyof typeof item] === value));
            if (!row) return { data: null, error: new Error('Creative not found') };
            Object.assign(row, patch);
            return { data: { id: row.id, client_id: row.client_id, title: row.title }, error: null };
          },
        };
        return query;
      },
    }),
  },
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['creatives', 'newgard'], db.rows.filter(row => row.client_id === 'newgard').map(row => ({ ...row })));
  const hook = renderHook(() => useRenameCreative(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...hook, client };
}

beforeEach(() => {
  cleanup();
  db.rows = [
    { id: 'uploaded-1', client_id: 'newgard', title: 'Original upload', status: 'launched', file_url: '/upload.mp4' },
    { id: 'uploaded-2', client_id: 'other-client', title: 'Other upload', status: 'launched', file_url: '/other.mp4' },
  ];
  db.patches = [];
});

describe('Creative dashboard renaming', () => {
  it('renames a launched upload, keeps its status and file, and updates the client cache', async () => {
    const { result, client } = setup();
    await act(async () => { await result.current.mutateAsync({ id: 'uploaded-1', clientId: 'newgard', title: '  Newgard November Video  ' }); });
    expect(db.patches).toEqual([{ title: 'Newgard November Video' }]);
    expect(db.rows[0]).toEqual({ id: 'uploaded-1', client_id: 'newgard', title: 'Newgard November Video', status: 'launched', file_url: '/upload.mp4' });
    expect(client.getQueryData<Array<{ title: string }>>(['creatives', 'newgard'])?.[0].title).toBe('Newgard November Video');
  });

  it('cannot rename a creative belonging to a different client', async () => {
    const { result } = setup();
    act(() => result.current.mutate({ id: 'uploaded-2', clientId: 'newgard', title: 'Wrong client' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(db.rows[1].title).toBe('Other upload');
  });

  it('rejects an empty name without writing', async () => {
    const { result } = setup();
    act(() => result.current.mutate({ id: 'uploaded-1', clientId: 'newgard', title: '   ' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(db.patches).toEqual([]);
    expect(db.rows[0].title).toBe('Original upload');
  });
});