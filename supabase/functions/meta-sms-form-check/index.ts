import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Daily non-SMS form check (spec 2026-10-28). Zero Meta calls: reads v_active_non_sms_forms
 * (forms with sms_verified=false referenced by an ACTIVE ad, with last-7-day spend), grouped by client.
 * Scheduled in the migration via pg_cron as pure SQL (public.run_non_sms_form_check, 13:45 UTC); this function
 * is the on-demand equivalent.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Store a snapshot (same SQL the daily pg_cron job runs) so the dashboard and the box export script
  // (scripts/export-non-sms-forms.py) can read the latest result from v_non_sms_forms_latest.
  const { error: snapErr } = await supabase.rpc("run_non_sms_form_check");
  if (snapErr) console.warn(`[meta-sms-form-check] snapshot failed: ${snapErr.message}`);
  const { data, error } = await supabase.from("v_active_non_sms_forms").select("*")
    .order("spend_last_7d", { ascending: false });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const byClient: Record<string, any> = {};
  for (const r of data || []) {
    const c = (byClient[r.client_id] ||= { client_id: r.client_id, client_name: r.client_name, forms: [], spend_last_7d: 0 });
    c.forms.push({ form_id: r.meta_form_id, form_name: r.form_name, active_ads: r.active_ads, spend_last_7d: Number(r.spend_last_7d), verification_source: r.verification_source });
    c.spend_last_7d += Number(r.spend_last_7d);
  }
  const clients = Object.values(byClient);
  console.log(`[meta-sms-form-check] ${clients.length} client(s) running non-SMS forms on active ads`);
  return new Response(JSON.stringify({ ok: true, generated_at: new Date().toISOString(), clients }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
