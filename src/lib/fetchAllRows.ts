import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/**
 * Fetches ALL rows from a Supabase table, paginating automatically
 * to bypass the default 1,000-row limit.
 *
 * Pass a function that builds the query (without executing it).
 * The function receives the supabase client so you can chain filters.
 *
 * Usage:
 *   const data = await fetchAllRows<Lead>((sb) =>
 *     sb.from('leads').select('*').eq('client_id', id).order('created_at', { ascending: false })
 *   );
 */
export async function fetchAllRows<T = any>(
  buildQuery: (sb: typeof supabase) => any
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(supabase).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data || []) as T[];
    allRows.push(...rows);

    // If we got fewer than PAGE_SIZE rows, we've reached the end
    if (rows.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allRows;
}
