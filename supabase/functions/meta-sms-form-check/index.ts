import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Daily non-SMS form check (spec 2026-10-28). Zero Meta calls: reads v_active_non_sms_forms
 * (forms with sms_verified=false referenced by an ACTIVE ad, with last-7-day spend), grouped by client.
 * Read-only; returns JSON. Schedule (pg_cron) only after the migration is approved and applied.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
