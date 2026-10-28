import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { metaGet } from "../_shared/metaThrottle.ts";

/**
 * 90-day form_id backfill for SMS-verified tracking (spec 2026-10-28). NOT SCHEDULED; run manually only
 * after Zac approves. Dry-run by default: pass {"confirm": true} to write.
 * Pulls /{form_id}/leads (Meta keeps 90 days) for each cached form of the client and fills
 * leads.meta_lead_id / meta_form_id / meta_ad_id, matching existing leads by meta_lead_id, then email,
 * then phone (last 10 digits). Older/unmatched leads stay unknown (is_sms_verified NULL).
 * Calls are sequential, >=2s apart, usage-header aware (see _shared/metaThrottle.ts).
 * Call cost: 1 page-token call per page + ceil(leads/500) calls per form.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GRAPH = "https://graph.facebook.com/v21.0";
const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id;
    const confirm = body.confirm === true;
    const days = Math.min(Number(body.days || 90), 90);
    if (!clientId) return json({ ok: false, error: "client_id required (one client per run keeps Meta load light)" }, 400);

    const { data: client, error } = await supabase.from("clients")
      .select("id, name, meta_access_token, meta_system_user_token").eq("id", clientId).single();
    if (error || !client) throw error || new Error("client not found");
    const token = (client as any).meta_system_user_token || client.meta_access_token || Deno.env.get("META_SHARED_ACCESS_TOKEN");
    if (!token) return json({ ok: false, error: "no Meta token for client" }, 400);

    const { data: forms } = await supabase.from("meta_lead_forms")
      .select("meta_form_id, meta_page_id, name").eq("client_id", clientId);
    const { data: leads } = await supabase.from("leads")
      .select("id, email, phone, meta_lead_id").eq("client_id", clientId)
      .gte("created_at", new Date(Date.now() - (days + 2) * 86400000).toISOString());
    const byLeadId = new Map<string, string>(), byEmail = new Map<string, string>(), byPhone = new Map<string, string>();
    for (const l of leads || []) {
      if (l.meta_lead_id) byLeadId.set(l.meta_lead_id, l.id);
      if (l.email) byEmail.set(l.email.toLowerCase().trim(), l.id);
      if (digits(l.phone).length === 10) byPhone.set(digits(l.phone), l.id);
    }

    const pageTokens = new Map<string, string | null>();
    const since = Math.floor((Date.now() - days * 86400000) / 1000);
    const updates: Array<{ id: string; meta_lead_id: string; meta_form_id: string; meta_ad_id: string | null }> = [];
    let metaCalls = 0, metaLeads = 0;
    for (const f of forms || []) {
      if (!f.meta_page_id) continue;
      if (!pageTokens.has(f.meta_page_id)) {
        metaCalls++;
        const r = await metaGet(`${GRAPH}/${f.meta_page_id}?fields=access_token&access_token=${token}`).catch(() => null);
        pageTokens.set(f.meta_page_id, r?.access_token ?? null);
      }
      const pt = pageTokens.get(f.meta_page_id);
      if (!pt) continue;
      const filtering = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]));
      let next: string | undefined =
        `${GRAPH}/${f.meta_form_id}/leads?fields=id,created_time,ad_id,form_id,field_data&limit=500&filtering=${filtering}&access_token=${pt}`;
      while (next) {
        metaCalls++;
        const page: any = await metaGet(next);
        for (const ml of page.data || []) {
          metaLeads++;
          const fd: Record<string, string> = {};
          for (const x of ml.field_data || []) fd[x.name] = (x.values || [])[0];
          const id = byLeadId.get(ml.id)
            || byEmail.get((fd.email || "").toLowerCase().trim())
            || byPhone.get(digits(fd.phone_number || fd.phone));
          if (id) updates.push({ id, meta_lead_id: ml.id, meta_form_id: ml.form_id || f.meta_form_id, meta_ad_id: ml.ad_id || null });
        }
        next = page.paging?.next;
      }
    }

    let written = 0;
    if (confirm) {
      for (const u of updates) {
        const { error: e } = await supabase.from("leads")
          .update({ meta_lead_id: u.meta_lead_id, meta_form_id: u.meta_form_id, meta_ad_id: u.meta_ad_id }).eq("id", u.id);
        if (!e) written++;
      }
    }
    return json({ ok: true, dry_run: !confirm, client: client.name, forms: forms?.length || 0, metaCalls, metaLeads,
      matched: updates.length, written });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, 500);
  }
});
