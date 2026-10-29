// Backfill missing Facebook lead attribution (campaign / ad set / ad ids and names).
//
// Why: the GHL sync often leaves ad_id empty or sets GHL's default campaign
// label 'Paid Ads'. GHL usually already knows the ad (contact.attributionSource
// .adId / campaignId / adSetId), and Meta knows it for every lead-form lead
// (GET /{leadgen_id}?fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id).
//
// Order of sources per lead (cheapest first, Meta last):
//   1. GHL contact attribution (no Meta call)
//   2. leadgen id from GHL /forms/submissions (others.facebookLeadId), then Meta /{leadgen_id}
//   3. fallback: Meta /{form_id}/leads in a +/-10 min window around the lead's created_at,
//      accepted only when exactly one lead matches (or the email matches). Needs a token
//      with leads_retrieval on the Page; ad-account-only tokens usually get error 200/10.
//
// Rules: only fills NULL / default ('Paid Ads') values, never overwrites. Idempotent:
// each lead is stamped meta_attribution_checked_at and skipped for `recheck_hours`.
// Uses the existing per-client token (meta_system_user_token || meta_access_token ||
// META_SHARED_ACCESS_TOKEN), same as sync-meta-ad-spend. On error 190 (invalid token)
// it stops Meta calls for that client and reports it. Default is dry_run=true.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Body = {
  client_id?: string;
  days_back?: number;        // default 14
  dry_run?: boolean;         // default true: compute, write nothing
  max_leads?: number;        // per client, default 500
  max_meta_calls?: number;   // per client, default 150
  recheck_hours?: number;    // default 24
};

const GHL = 'https://services.leadconnectorhq.com';
const GRAPH = 'https://graph.facebook.com/v21.0';
const META_FIELDS = 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,created_time';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isDefault = (v: unknown) => v == null || String(v).trim() === '' || String(v).trim().toLowerCase() === 'paid ads';
const isNumericId = (v: unknown) => /^\d{6,}$/.test(String(v ?? ''));

type Attr = {
  ad_id?: string | null; ad_name?: string | null; adset_id?: string | null; adset_name?: string | null;
  campaign_id?: string | null; campaign_name?: string | null; form_id?: string | null; leadgen_id?: string | null;
  source: 'ghl_attribution' | 'meta_leadgen' | 'meta_form_window';
};

async function ghlGet(key: string, path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${GHL}${path}`, { headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', Accept: 'application/json' } });
  if (res.status === 429) { await sleep(2000); return ghlGet(key, path); }
  return { status: res.status, data: res.ok ? await res.json() : await res.text() };
}

class MetaTokenError extends Error { constructor(public code: number, msg: string) { super(msg); } }

async function graphGet(token: string, path: string): Promise<any> {
  const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const code = Number(data.error.code);
    if (code === 190 || code === 102) throw new MetaTokenError(code, `token invalid (${code}/${data.error.error_subcode ?? ''})`);
    if (code === 4 || code === 17 || code === 32 || code === 613) { await sleep(5000); throw new Error(`rate limited (${code})`); }
    throw new Error(`graph error ${code}: ${String(data.error.message || '').slice(0, 120)}`);
  }
  return data;
}

function fromGhlContact(c: any): Attr | null {
  for (const a of [c?.lastAttributionSource, c?.attributionSource]) {
    if (a && (isNumericId(a.adId) || isNumericId(a.campaignId))) {
      return {
        source: 'ghl_attribution',
        ad_id: isNumericId(a.adId) ? String(a.adId) : null,
        ad_name: a.utmContent || null,
        adset_id: isNumericId(a.adSetId) ? String(a.adSetId) : null,
        adset_name: a.utmMedium || null,
        campaign_id: isNumericId(a.campaignId) ? String(a.campaignId) : null,
        campaign_name: a.campaign || a.utmCampaign || null,
        form_id: a.formId || null,
      };
    }
  }
  return null;
}

function fromMeta(m: any, leadgenId: string | null, source: Attr['source']): Attr {
  return {
    source, leadgen_id: leadgenId,
    ad_id: m.ad_id || null, ad_name: m.ad_name || null, adset_id: m.adset_id || null, adset_name: m.adset_name || null,
    campaign_id: m.campaign_id || null, campaign_name: m.campaign_name || null, form_id: m.form_id || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const body: Body = await req.json().catch(() => ({}));
  const daysBack = body.days_back ?? 14;
  const dryRun = body.dry_run !== false;
  const maxLeads = body.max_leads ?? 500;
  const maxMeta = body.max_meta_calls ?? 150;
  const recheckMs = (body.recheck_hours ?? 24) * 3600_000;
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const shared = Deno.env.get('META_SHARED_ACCESS_TOKEN') ?? '';

  let q = supabase.from('clients')
    .select('id, name, status, ghl_api_key, ghl_location_id, meta_access_token, meta_system_user_token')
    .neq('status', 'archived');
  if (body.client_id) q = q.eq('id', body.client_id);
  const { data: clients, error: cErr } = await q;
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: corsHeaders });

  const report: any[] = [];
  for (const client of clients ?? []) {
    const r = { client: client.name, candidates: 0, filled: { ghl_attribution: 0, meta_leadgen: 0, meta_form_window: 0 }, unfilled: {} as Record<string, number>, meta_calls: 0, meta_token: 'unused' as string };
    const miss = (why: string) => { r.unfilled[why] = (r.unfilled[why] ?? 0) + 1; };
    const { data: leads } = await supabase.from('leads')
      .select('id, external_id, email, created_at, ad_id, campaign_name, ad_set_name, utm_source, meta_attribution_checked_at')
      .eq('client_id', client.id).gte('created_at', since)
      .or('ad_id.is.null,campaign_name.is.null,campaign_name.eq."Paid Ads",ad_set_name.is.null')
      .order('created_at', { ascending: false }).limit(maxLeads);
    const isFb = (src: unknown) => /facebook|meta|instagram|^fb$|^ig$/i.test(String(src ?? ''));
    const todo = (leads ?? []).filter((l: any) => isFb(l.utm_source)).filter((l: any) => !l.meta_attribution_checked_at || Date.now() - Date.parse(l.meta_attribution_checked_at) > recheckMs);
    r.candidates = todo.length;
    if (!todo.length) { report.push(r); continue; }

    const token = client.meta_system_user_token || client.meta_access_token || shared;
    let tokenOk = !!token;
    if (!token) r.meta_token = 'missing';
    // leadgen ids from GHL form submissions, keyed by contactId (one paged pull per client)
    let leadgenByContact: Map<string, { leadgen: string; at: string; formId?: string }> | null = null;
    const loadLeadgen = async () => {
      leadgenByContact = new Map();
      if (!client.ghl_api_key) return;
      const startAt = since.slice(0, 10), endAt = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
      for (let page = 1; page <= 30; page++) {
        const { status, data } = await ghlGet(client.ghl_api_key, `/forms/submissions?locationId=${client.ghl_location_id}&startAt=${startAt}&endAt=${endAt}&limit=100&page=${page}`);
        if (status !== 200) { console.warn(`[${client.name}] forms/submissions ${status}`); return; }
        for (const s of data.submissions ?? []) {
          const lg = s.others?.facebookLeadId;
          if (!s.contactId || !lg) continue;
          const prev = leadgenByContact!.get(s.contactId);
          if (!prev || prev.at < s.createdAt) leadgenByContact!.set(s.contactId, { leadgen: String(lg), at: s.createdAt, formId: s.others?.facebookFormId });
        }
        if (!data.meta?.nextPage) break;
      }
    };

    for (const lead of todo) {
      let attr: Attr | null = null;
      let contact: any = null;
      // 1. GHL contact attribution
      if (client.ghl_api_key && lead.external_id) {
        const { status, data } = await ghlGet(client.ghl_api_key, `/contacts/${lead.external_id}`);
        if (status === 200) { contact = data.contact; attr = fromGhlContact(contact); }
        await sleep(120);
      }
      // 2. Meta lookup by leadgen id
      if (!attr?.ad_id && tokenOk && r.meta_calls < maxMeta) {
        if (!leadgenByContact) await loadLeadgen();
        const lg = leadgenByContact!.get(lead.external_id);
        try {
          if (lg) {
            r.meta_calls++;
            attr = fromMeta(await graphGet(token, `/${lg.leadgen}?fields=${META_FIELDS}`), lg.leadgen, 'meta_leadgen');
            await sleep(250);
          } else {
            // 3. form id + created time window
            const formId = contact?.lastAttributionSource?.formId || contact?.attributionSource?.formId;
            if (formId) {
              r.meta_calls++;
              const t = Math.floor(Date.parse(lead.created_at) / 1000);
              const filtering = encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: t - 600 }, { field: 'time_created', operator: 'LESS_THAN', value: t + 600 }]));
              const res = await graphGet(token, `/${formId}/leads?fields=id,field_data,${META_FIELDS}&filtering=${filtering}&limit=25`);
              const rows: any[] = res.data ?? [];
              const email = String(lead.email || '').toLowerCase();
              const byEmail = email ? rows.filter((x) => (x.field_data ?? []).some((f: any) => f.name === 'email' && (f.values ?? []).some((v: string) => v.toLowerCase() === email))) : [];
              const pick = byEmail.length === 1 ? byEmail[0] : rows.length === 1 ? rows[0] : null;
              if (pick) attr = fromMeta(pick, pick.id, 'meta_form_window');
              await sleep(250);
            }
          }
        } catch (e) {
          if (e instanceof MetaTokenError) { tokenOk = false; r.meta_token = e.message; }
          else miss(`meta: ${(e as Error).message}`);
        }
      }

      if (!attr || (!attr.ad_id && !attr.campaign_id)) {
        miss(!contact ? 'ghl_contact_unavailable' : !tokenOk ? 'no_ghl_ad_and_meta_token_unusable' : r.meta_calls >= maxMeta ? 'meta_call_budget' : 'no_ad_in_ghl_no_leadgen_id');
        if (!dryRun) await supabase.from('leads').update({ meta_attribution_checked_at: new Date().toISOString(), meta_attribution_status: 'unfilled' }).eq('id', lead.id);
        continue;
      }

      // only fill NULL / default values
      const upd: Record<string, any> = {
        meta_attribution_checked_at: new Date().toISOString(),
        meta_attribution_status: 'filled',
        meta_attribution_source: attr.source,
      };
      if ((!lead.ad_id || !isNumericId(lead.ad_id)) && attr.ad_id) upd.ad_id = attr.ad_id;
      if (isDefault(lead.campaign_name) && attr.campaign_name) upd.campaign_name = attr.campaign_name;
      if (isDefault(lead.ad_set_name) && attr.adset_name) upd.ad_set_name = attr.adset_name;
      const extra = { meta_campaign_id: attr.campaign_id, meta_adset_id: attr.adset_id, meta_ad_name: attr.ad_name, meta_form_id: attr.form_id, meta_leadgen_id: attr.leadgen_id };
      for (const [k, v] of Object.entries(extra)) if (v) upd[k] = v;
      r.filled[attr.source]++;
      if (!dryRun) {
        const { error } = await supabase.from('leads').update(upd).eq('id', lead.id);
        if (error) miss(`db: ${error.message}`);
      }
    }
    if (r.meta_token === 'unused' && r.meta_calls > 0) r.meta_token = 'ok';
    console.log(`[backfill-meta-lead-attribution] ${JSON.stringify(r)}`);
    report.push(r);
  }
  return new Response(JSON.stringify({ dry_run: dryRun, since, report }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
