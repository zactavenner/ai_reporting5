// Client Reporting — review notes for the Analytics → Reporting screen.
//   facts       → PII-free report facts + recent reviews (operator OR linked external agent)
//   list        → reviews for a client/period (operator)
//   ai_review   → AI reads the verified facts and writes "what needs attention" (operator)
//   add_note    → human note (operator)
// Reviews never change source data; they are notes on top of verified numbers.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { admin, corsHeaders, json, requireOperator } from '../_shared/aiSetter/http.ts';
import { buildRangeReport, factsHash, loadRangeRows, loadRoster, reportFacts } from '../_shared/weeklyReport/model.ts';

const UUID = /^[0-9a-f-]{36}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TONES = new Set(['alert', 'watch', 'good']);

function parseRange(body: any) {
  const from = body?.from, to = body?.to;
  if (typeof from !== 'string' || typeof to !== 'string' || !YMD.test(from) || !YMD.test(to) || to < from) return null;
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366) return null;
  return { from, to };
}

function cleanItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((i: any) => ({
    tone: TONES.has(i?.tone) ? i.tone : 'watch',
    title: String(i?.title || '').replace(/guarantee(d)?/gi, 'targeted').slice(0, 200).trim(),
    detail: String(i?.detail || '').replace(/guarantee(d)?/gi, 'targeted').slice(0, 1000).trim(),
  })).filter((i) => i.title);
}

async function linkedAgent(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+ey/.test(auth)) return null;
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anon || auth.endsWith(anon)) return null;
  const user = createClient(Deno.env.get('SUPABASE_URL')!, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.rpc('mcp_agent_self');
  return data?.id ? { id: data.id as string, name: (data.display_name as string) || 'Agent' } : null;
}

async function loadReport(sb: any, clientId: string, range: { from: string; to: string }) {
  const [entry] = await loadRoster(sb, new Date(), clientId);
  if (!entry) return null;
  const report = buildRangeReport(entry, await loadRangeRows(sb, entry, range), range);
  return { entry, report, facts: reportFacts(report) };
}

async function listReviews(sb: any, clientId: string, range: { from: string; to: string }) {
  const { data, error } = await sb.from('client_report_reviews')
    .select('id,range_from,range_to,author_kind,author_name,summary,items,facts_hash,created_at')
    .eq('client_id', clientId).lte('range_from', range.to).gte('range_to', range.from)
    .order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return data || [];
}

const SYSTEM = `You review a marketing performance report for an agency client. You receive verified, aggregated facts as JSON.
Rules:
- Use ONLY the numbers in the facts. Never invent, estimate or round into new figures.
- A null value means unavailable/not tracked — say so; never treat it as zero.
- "partial": true means the period is incomplete — call that out instead of comparing.
- Commitments are not funding. Pipeline interest is not commitment.
- Never use the word "guaranteed". Investment results are "targeted".
- No personal data. Keep each item short and specific, with the number that matters.
Return strict JSON only: {"summary": string (max 2 sentences), "items": [{"tone":"alert"|"watch"|"good","title": string (max 80 chars),"detail": string (max 220 chars)}]} with 3 to 6 items, most important first.`;

async function runAi(facts: unknown) {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('AI is not configured');
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openrouter/owl-alpha', temperature: 0.2,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }],
    }),
  });
  if (resp.status === 429) throw Object.assign(new Error('AI is busy — try again in a minute'), { status: 429 });
  if (resp.status === 402) throw Object.assign(new Error('AI credits exhausted'), { status: 402 });
  if (!resp.ok) throw new Error(`AI request failed (${resp.status})`);
  const j = await resp.json();
  const raw = String(j?.choices?.[0]?.message?.content || '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI returned no review');
  const parsed = JSON.parse(m[0]);
  const items = cleanItems(parsed?.items);
  if (!items.length) throw new Error('AI returned no review items');
  return { summary: String(parsed?.summary || '').slice(0, 600) || null, items };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const sb = admin();
  const action = body?.action;
  const clientId = body?.client_id;
  if (typeof clientId !== 'string' || !UUID.test(clientId)) return json({ error: 'invalid client_id' }, 400);
  const range = parseRange(body);
  if (!range) return json({ error: 'invalid range (from/to yyyy-mm-dd, max 366 days)' }, 400);

  try {
    if (action === 'facts') {
      const agent = await linkedAgent(req);
      if (!agent) {
        const op = await requireOperator(req, sb, body);
        if (!('auth' in op) || !op.auth) return (op as { error: Response }).error;
      }
      const r = await loadReport(sb, clientId, range);
      if (!r) return json({ error: 'client is not active' }, 404);
      return json({ facts: r.facts, facts_hash: await factsHash(r.facts), reviews: await listReviews(sb, clientId, range) });
    }

    const op = await requireOperator(req, sb, body);
    if (!('auth' in op) || !op.auth) return (op as { error: Response }).error;
    const who = (op.auth as any).memberName || 'Team';

    if (action === 'list') return json({ reviews: await listReviews(sb, clientId, range) });

    if (action === 'ai_review') {
      const r = await loadReport(sb, clientId, range);
      if (!r) return json({ error: 'client is not active' }, 404);
      const out = await runAi(r.facts);
      const { data, error } = await sb.from('client_report_reviews').insert({
        client_id: clientId, range_from: range.from, range_to: range.to, author_kind: 'ai', author_name: 'AI review',
        summary: out.summary, items: out.items, facts_hash: await factsHash(r.facts),
      }).select('id,range_from,range_to,author_kind,author_name,summary,items,facts_hash,created_at').single();
      if (error) throw error;
      return json({ review: data });
    }

    if (action === 'add_note') {
      const items = cleanItems([body?.item]);
      if (!items.length) return json({ error: 'note title required' }, 400);
      const { data, error } = await sb.from('client_report_reviews').insert({
        client_id: clientId, range_from: range.from, range_to: range.to, author_kind: 'human', author_name: who, items,
      }).select('id,range_from,range_to,author_kind,author_name,summary,items,facts_hash,created_at').single();
      if (error) throw error;
      return json({ review: data });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    const status = (e as any)?.status;
    console.error('client-report-review', (e as Error)?.message);
    if (status === 429 || status === 402) return json({ error: (e as Error).message }, status);
    return json({ error: (e as Error)?.message?.slice(0, 200) || 'internal error' }, 500);
  }
});
