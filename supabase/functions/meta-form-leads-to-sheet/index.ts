// Operator-only backfill: pulls a client's Facebook Instant Form leads for a
// date range (America/Los_Angeles days) and appends the ones missing from the
// client's KPI sheet "Leads" tab. Dedupes on email and phone. Responses never
// include contact details — only counts and masked first names.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';
const TAB = 'Leads';
const TZ = 'America/Los_Angeles';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function fetchAll(url: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | undefined = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;
  let guard = 0;
  while (next && guard++ < 50) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`meta ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    if (Array.isArray(j.data)) out.push(...j.data);
    next = j.paging?.next;
  }
  return out;
}

async function gw(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'X-Connection-Api-Key': Deno.env.get('GOOGLE_SHEETS_API_KEY') ?? '',
      'Content-Type': 'application/json',
    },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`sheets ${res.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

const laDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const sheetDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return `${m}/${d}/${y}`; };
const digits = (p: string) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; };
const fmtPhone = (p: string) => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
const pretty = (v: string) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function pick(fields: Record<string, string>, ...pats: RegExp[]) {
  for (const p of pats) for (const [k, v] of Object.entries(fields)) if (p.test(k)) return v;
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const auth = await authorizeOperator(req, sb, createClient, body);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);

  const { client_id, start_date, end_date, dry_run = true } = body;
  if (!client_id || !/^\d{4}-\d{2}-\d{2}$/.test(start_date ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end_date ?? '')) {
    return json({ error: 'client_id, start_date, end_date (YYYY-MM-DD) required' }, 400);
  }
  try {
    const { data: c } = await sb.from('clients')
      .select('id, meta_ad_account_id, meta_access_token, meta_system_user_token').eq('id', client_id).maybeSingle();
    const { data: s } = await sb.from('client_settings').select('kpi_google_sheet_url').eq('client_id', client_id).maybeSingle();
    const sheetId = (s?.kpi_google_sheet_url ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (!c?.meta_ad_account_id || !sheetId) return json({ error: 'client missing ad account or KPI sheet' }, 400);
    const token = (c as any).meta_system_user_token || c.meta_access_token || Deno.env.get('META_SHARED_ACCESS_TOKEN');
    if (!token) return json({ error: 'no Meta token' }, 400);
    const acct = String(c.meta_ad_account_id).startsWith('act_') ? c.meta_ad_account_id : `act_${c.meta_ad_account_id}`;

    // Window with a day of padding; exact LA-day filter applied below.
    const since = Math.floor(new Date(`${start_date}T00:00:00Z`).getTime() / 1000) - 86400;
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]));

    const pages = await fetchAll(`${GRAPH}/${acct}/promote_pages?fields=id`, token);
    const leads: any[] = [];
    let formCount = 0;
    for (const p of pages) {
      const pt = await fetch(`${GRAPH}/${p.id}?fields=access_token&access_token=${token}`).then((r) => r.json()).catch(() => null);
      const pageToken = pt?.access_token;
      if (!pageToken) continue;
      const forms = await fetchAll(`${GRAPH}/${p.id}/leadgen_forms?fields=id`, pageToken);
      for (const f of forms) {
        formCount++;
        const rows = await fetchAll(
          `${GRAPH}/${f.id}/leads?fields=created_time,field_data,ad_name,adset_name,campaign_name,is_organic&filtering=${filtering}&limit=200`,
          pageToken,
        );
        leads.push(...rows);
      }
    }

    const inRange = leads.filter((l) => { const d = laDate(l.created_time); return d >= start_date && d <= end_date; });

    const existing = await gw(`/spreadsheets/${sheetId}/values/${TAB}!A2:F5000`);
    const emails = new Set<string>(); const phones = new Set<string>();
    for (const r of existing.values ?? []) {
      if (r[4]) emails.add(String(r[4]).trim().toLowerCase());
      if (r[5]) phones.add(digits(r[5]));
    }

    const toAdd: string[][] = [];
    const masked: string[] = [];
    const seen = new Set<string>();
    for (const l of inRange.sort((a, b) => a.created_time.localeCompare(b.created_time))) {
      const f: Record<string, string> = {};
      for (const fd of l.field_data ?? []) f[String(fd.name).toLowerCase()] = (fd.values ?? []).join(', ');
      const email = pick(f, /^email$/, /email/).trim();
      const phone = pick(f, /^phone_number$/, /phone/);
      const key = email.toLowerCase() || digits(phone);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if ((email && emails.has(email.toLowerCase())) || (phone && phones.has(digits(phone)))) continue;
      const name = pick(f, /^full_name$/, /name/) || [f.first_name, f.last_name].filter(Boolean).join(' ');
      toAdd.push([
        sheetDate(laDate(l.created_time)), 'Paid Ads', l.is_organic ? 'Facebook (Organic)' : 'Facebook',
        name, email, fmtPhone(phone),
        pretty(pick(f, /accredit/)), pretty(pick(f, /investment|range|invest/)), pretty(pick(f, /deploy|soon|timeline/)),
        l.campaign_name ?? '', l.adset_name ?? '', l.ad_name ?? '',
        pretty(pick(f, /income/)), pretty(pick(f, /net_?worth/)),
      ]);
      masked.push(`${laDate(l.created_time)} ${(name.split(' ')[0] || '?').slice(0, 1)}***`);
    }

    if (!dry_run && toAdd.length) {
      await gw(`/spreadsheets/${sheetId}/values/${TAB}!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST', body: JSON.stringify({ values: toAdd }),
      });
    }
    return json({
      ok: true, dry_run, pages: pages.length, forms: formCount,
      facebook_leads_in_range: inRange.length, already_in_sheet: inRange.length - toAdd.length,
      added: dry_run ? 0 : toAdd.length, would_add: toAdd.length, leads: masked,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
