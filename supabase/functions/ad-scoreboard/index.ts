// ad-scoreboard: rank ads per client by cost per booked call (then cost per show).
// Reads meta_ads (attributed_* filled by run-attribution) and upserts ad_scoreboard_daily.
// EOD show check: flags calls scheduled today with showed IS NULL so the setter confirms outcome.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) return new Response("forbidden", { status: 403, headers: cors });
  const day = new Date().toISOString().slice(0, 10);
  const { data: clients } = await sb.from("clients").select("id, name").in("status", ["active", "onboarding"]);
  let rows = 0; const eod: any[] = [];
  for (const c of clients || []) {
    const { data: ads } = await sb.from("meta_ads")
      .select("id, meta_ad_id, name, spend, attributed_leads, attributed_calls, attributed_showed, attributed_funded")
      .eq("client_id", c.id).gt("spend", 0);
    const ranked = (ads || []).map((a: any) => ({
      ...a,
      cost_per_booked_call: a.attributed_calls > 0 ? Number(a.spend) / a.attributed_calls : null,
      cost_per_show: a.attributed_showed > 0 ? Number(a.spend) / a.attributed_showed : null,
    })).sort((x: any, y: any) => (x.cost_per_booked_call ?? 1e12) - (y.cost_per_booked_call ?? 1e12) || Number(y.spend) - Number(x.spend));
    const up = ranked.map((a: any, i: number) => ({
      snapshot_date: day, client_id: c.id, meta_ad_id: a.meta_ad_id, ad_name: a.name, spend: a.spend,
      leads: a.attributed_leads, booked_calls: a.attributed_calls, shows: a.attributed_showed, funded: a.attributed_funded,
      cost_per_booked_call: a.cost_per_booked_call, cost_per_show: a.cost_per_show, rank: i + 1,
    }));
    if (up.length) { await sb.from("ad_scoreboard_daily").upsert(up, { onConflict: "snapshot_date,meta_ad_id" }); rows += up.length; }
    const { count } = await sb.from("calls").select("id", { count: "exact", head: true })
      .eq("client_id", c.id).gte("scheduled_at", `${day}T00:00:00Z`).lte("scheduled_at", `${day}T23:59:59Z`).is("showed", null);
    if (count) eod.push({ client: c.name, calls_missing_show_outcome: count });
  }
  return new Response(JSON.stringify({ success: true, rows, eod_show_check: eod }), { headers: { ...cors, "Content-Type": "application/json" } });
});
