// ad-scoreboard: rank each client's ads by cost per booked call, then cost per show.
// Reads meta_ads (attributed_* filled by run-attribution) and upserts ad_scoreboard_daily.
// Cost uses lifetime spend until Meta daily insights are available.
// EOD show check: calls scheduled on the America/Los_Angeles business day with showed IS NULL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { businessDayRange, rankAds, type ScoreAd } from "./score.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchAll(
  sb: any,
  table: string,
  columns: string,
  apply: (query: any) => any,
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = apply(
      sb.from(table).select(columns).order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1),
    );
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: "missing supabase env" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${serviceKey}`) return json({ success: false, error: "forbidden" }, 403);

  const sb = createClient(supabaseUrl, serviceKey);
  const { day, start, end } = businessDayRange();
  const errors: string[] = [];
  const eod: { client_id: string; client: string; calls_missing_show_outcome: number }[] = [];
  let rows = 0;

  try {
    const clients = await fetchAll(sb, "clients", "id, name", (query) =>
      query.in("status", ["active", "onboarding"]),
    );

    for (const client of clients) {
      try {
        const ads = await fetchAll(
          sb,
          "meta_ads",
          "id, meta_ad_id, name, spend, attributed_leads, attributed_calls, attributed_showed, attributed_funded",
          (query) => query.eq("client_id", client.id).gt("spend", 0),
        );
        const ranked = rankAds(ads as ScoreAd[]);
        const payload = ranked.map((ad) => ({
          snapshot_date: day,
          client_id: client.id,
          meta_ad_id: ad.meta_ad_id,
          ad_name: ad.ad_name,
          spend: ad.spend,
          leads: ad.leads,
          booked_calls: ad.booked_calls,
          shows: ad.shows,
          funded: ad.funded,
          cost_per_booked_call: ad.cost_per_booked_call,
          cost_per_show: ad.cost_per_show,
          rank: ad.rank,
        }));

        for (let i = 0; i < payload.length; i += 200) {
          const chunk = payload.slice(i, i + 200);
          const { error } = await sb.from("ad_scoreboard_daily").upsert(chunk, {
            onConflict: "snapshot_date,client_id,meta_ad_id",
          });
          if (error) throw new Error(error.message);
          rows += chunk.length;
        }

        const { count, error: callError } = await sb
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("scheduled_at", start)
          .lte("scheduled_at", end)
          .is("showed", null);
        if (callError) throw new Error(callError.message);
        eod.push({
          client_id: client.id,
          client: client.name,
          calls_missing_show_outcome: count ?? 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown";
        errors.push(`${client.name}: ${message}`);
        console.error(`[ad-scoreboard] ${client.name}`, err);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    console.error("[ad-scoreboard]", err);
    return json({ success: false, error: message, rows, eod_show_check: eod }, 500);
  }

  return json({
    success: errors.length === 0,
    rows,
    snapshot_date: day,
    spend_basis: "lifetime",
    eod_show_check: eod,
    error: errors.length ? errors.join("; ") : undefined,
  }, errors.length ? 500 : 200);
});
