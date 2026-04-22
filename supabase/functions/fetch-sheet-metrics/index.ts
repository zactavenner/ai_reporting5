const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_sheets/v4';

interface DailyMetric {
  date: string;
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  commitments: number;
  commitment_dollars: number;
  funded_investors: number;
  funded_dollars: number;
  reconnect_calls: number;
  reconnect_showed: number;
}

const FIELD_ALIASES: Record<string, string[]> = {
  date: ['date', 'day'],
  ad_spend: ['spend', 'ad spend', 'total spend', 'adspend'],
  leads: ['leads', 'total leads', 'new leads'],
  spam_leads: ['spam', 'spam leads', 'bad leads'],
  calls: ['calls', 'booked calls', 'booked'],
  showed_calls: ['showed', 'shows', 'showed calls'],
  reconnect_calls: ['reconnects', 'reconnect calls', 'reconnect'],
  reconnect_showed: ['reconnect showed', 'reconnects showed'],
  commitments: ['commitments', 'committed'],
  commitment_dollars: ['commitment $', 'committed $', 'commitment dollars', 'commitments $'],
  funded_investors: ['funded', 'funded investors', 'investors funded'],
  funded_dollars: ['funded $', 'capital raised', 'funded dollars', 'raised'],
  impressions: ['impressions', 'impr'],
  clicks: ['clicks'],
};

function normalize(s: string): string {
  return (s || '').toString().trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function parseNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[$,\s%]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDate(v: any): string | null {
  if (!v) return null;
  // Handle Sheets serial dates and various formats
  if (typeof v === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY or M/D/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, mm, dd, yy] = m;
    let year = parseInt(yy);
    if (year < 100) year += 2000;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function buildHeaderMap(headers: string[], override?: Record<string, string>): Record<string, number> {
  const map: Record<string, number> = {};
  const normHeaders = headers.map(normalize);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (override && override[field]) {
      const idx = normHeaders.indexOf(normalize(override[field]));
      if (idx >= 0) { map[field] = idx; continue; }
    }
    for (const alias of aliases) {
      const idx = normHeaders.indexOf(normalize(alias));
      if (idx >= 0) { map[field] = idx; break; }
    }
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_SHEETS_API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!GOOGLE_SHEETS_API_KEY) throw new Error('GOOGLE_SHEETS_API_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const { sheet_id, gid, range, mapping, start_date, end_date } = body || {};

    if (!sheet_id || typeof sheet_id !== 'string') {
      return new Response(JSON.stringify({ error: 'sheet_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GOOGLE_SHEETS_API_KEY,
    };

    // 1. Resolve gid -> sheet title
    let sheetTitle: string;
    if (range && typeof range === 'string') {
      // user provided explicit range like 'Sheet1!A:Z'
      sheetTitle = range;
    } else {
      const metaRes = await fetch(
        `${GATEWAY_URL}/spreadsheets/${sheet_id}?fields=sheets(properties(sheetId,title))`,
        { headers }
      );
      const metaText = await metaRes.text();
      if (!metaRes.ok) {
        throw new Error(`Sheet metadata fetch failed [${metaRes.status}]: ${metaText}`);
      }
      const meta = JSON.parse(metaText);
      const sheets = meta?.sheets || [];
      let target = sheets[0]?.properties;
      if (gid !== undefined && gid !== null && gid !== '') {
        const found = sheets.find((s: any) => String(s?.properties?.sheetId) === String(gid));
        if (found) target = found.properties;
      }
      if (!target?.title) throw new Error('Could not resolve sheet title from gid');
      sheetTitle = target.title;
    }

    // 2. Fetch values (do NOT encode the range)
    const valuesRes = await fetch(
      `${GATEWAY_URL}/spreadsheets/${sheet_id}/values/${sheetTitle}`,
      { headers }
    );
    const valuesText = await valuesRes.text();
    if (!valuesRes.ok) {
      throw new Error(`Sheet values fetch failed [${valuesRes.status}]: ${valuesText}`);
    }
    const valuesJson = JSON.parse(valuesText);
    const rows: any[][] = valuesJson?.values || [];

    if (rows.length < 2) {
      return new Response(JSON.stringify({ daily: [], aggregated: null, sheetTitle, fetchedAt: new Date().toISOString(), rowCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the header row — the first row that contains a recognizable "date" column
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const candidate = rows[i].map(normalize);
      if (FIELD_ALIASES.date.some((a) => candidate.includes(normalize(a)))) {
        headerRowIdx = i; break;
      }
    }

    const headerRow = rows[headerRowIdx].map((c) => String(c ?? ''));
    const headerMap = buildHeaderMap(headerRow, mapping);

    if (headerMap.date === undefined) {
      throw new Error(`Could not find a 'Date' column in sheet headers: ${headerRow.join(', ')}`);
    }

    const startD = start_date ? new Date(start_date) : null;
    const endD = end_date ? new Date(end_date) : null;

    const daily: DailyMetric[] = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const dateStr = parseDate(row[headerMap.date]);
      if (!dateStr) continue;
      if (startD && new Date(dateStr) < startD) continue;
      if (endD && new Date(dateStr) > endD) continue;

      const get = (k: string) => headerMap[k] !== undefined ? parseNumber(row[headerMap[k]]) : 0;
      const impressions = get('impressions');
      const clicks = get('clicks');

      daily.push({
        date: dateStr,
        ad_spend: get('ad_spend'),
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        leads: get('leads'),
        spam_leads: get('spam_leads'),
        calls: get('calls'),
        showed_calls: get('showed_calls'),
        commitments: get('commitments'),
        commitment_dollars: get('commitment_dollars'),
        funded_investors: get('funded_investors'),
        funded_dollars: get('funded_dollars'),
        reconnect_calls: get('reconnect_calls'),
        reconnect_showed: get('reconnect_showed'),
      });
    }

    // Aggregate
    const t = daily.reduce((acc, d) => ({
      totalAdSpend: acc.totalAdSpend + d.ad_spend,
      totalLeads: acc.totalLeads + d.leads,
      spamLeads: acc.spamLeads + d.spam_leads,
      totalCalls: acc.totalCalls + d.calls,
      showedCalls: acc.showedCalls + d.showed_calls,
      reconnectCalls: acc.reconnectCalls + d.reconnect_calls,
      reconnectShowed: acc.reconnectShowed + d.reconnect_showed,
      totalCommitments: acc.totalCommitments + d.commitments,
      commitmentDollars: acc.commitmentDollars + d.commitment_dollars,
      fundedInvestors: acc.fundedInvestors + d.funded_investors,
      fundedDollars: acc.fundedDollars + d.funded_dollars,
      totalClicks: acc.totalClicks + d.clicks,
      totalImpressions: acc.totalImpressions + d.impressions,
    }), {
      totalAdSpend: 0, totalLeads: 0, spamLeads: 0, totalCalls: 0, showedCalls: 0,
      reconnectCalls: 0, reconnectShowed: 0, totalCommitments: 0, commitmentDollars: 0,
      fundedInvestors: 0, fundedDollars: 0, totalClicks: 0, totalImpressions: 0,
    });

    const aggregated = {
      totalAdSpend: t.totalAdSpend,
      totalLeads: t.totalLeads,
      spamLeads: t.spamLeads,
      totalCalls: t.totalCalls,
      showedCalls: t.showedCalls,
      reconnectCalls: t.reconnectCalls,
      reconnectShowed: t.reconnectShowed,
      totalCommitments: t.totalCommitments,
      commitmentDollars: t.commitmentDollars,
      fundedInvestors: t.fundedInvestors,
      fundedDollars: t.fundedDollars,
      ctr: t.totalImpressions > 0 ? (t.totalClicks / t.totalImpressions) * 100 : 0,
      costPerLead: t.totalLeads > 0 ? t.totalAdSpend / t.totalLeads : 0,
      costPerCall: t.totalCalls > 0 ? t.totalAdSpend / t.totalCalls : 0,
      showedPercent: t.totalCalls > 0 ? (t.showedCalls / t.totalCalls) * 100 : 0,
      costPerShow: t.showedCalls > 0 ? t.totalAdSpend / t.showedCalls : 0,
      costPerInvestor: t.fundedInvestors > 0 ? t.totalAdSpend / t.fundedInvestors : 0,
      costOfCapital: t.fundedDollars > 0 ? (t.totalAdSpend / t.fundedDollars) * 100 : 0,
      avgTimeToFund: 0,
      avgCallsToFund: 0,
      leadToBookedPercent: t.totalLeads > 0 ? (t.totalCalls / t.totalLeads) * 100 : 0,
      closeRate: t.showedCalls > 0 ? (t.fundedInvestors / t.showedCalls) * 100 : 0,
      pipelineValue: 0,
      costPerReconnectCall: t.reconnectCalls > 0 ? t.totalAdSpend / t.reconnectCalls : 0,
      costPerReconnectShowed: t.reconnectShowed > 0 ? t.totalAdSpend / t.reconnectShowed : 0,
    };

    return new Response(JSON.stringify({
      daily,
      aggregated,
      sheetTitle,
      headerMap,
      headers: headerRow,
      fetchedAt: new Date().toISOString(),
      rowCount: daily.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('fetch-sheet-metrics error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});