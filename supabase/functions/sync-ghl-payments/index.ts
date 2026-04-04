import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

interface GHLTransaction {
  _id: string;
  contactId?: string;
  contactName?: string;
  amount: number;
  currency?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  entityType?: string;
  entityId?: string;
  liveMode?: boolean;
  chargeId?: string;
}

/**
 * Fetch all transactions from GHL Payments API v2 with pagination.
 * GET /payments/transactions?altId={locationId}&altType=location&startAt=...&endAt=...
 */
async function fetchGHLTransactions(
  apiKey: string,
  locationId: string,
  startDate: string,
  endDate: string
): Promise<GHLTransaction[]> {
  const allTransactions: GHLTransaction[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      altId: locationId,
      altType: "location",
      startAt: `${startDate}T00:00:00.000Z`,
      endAt: `${endDate}T23:59:59.999Z`,
      limit: String(limit),
      offset: String(offset),
    });

    const url = `${GHL_BASE_URL}/payments/transactions?${params}`;
    console.log(`[sync-ghl-payments] Fetching: offset=${offset}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GHL API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const transactions: GHLTransaction[] = data.data || data.transactions || [];
    
    allTransactions.push(...transactions);
    
    if (transactions.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }

    // Safety: max 10 pages (1000 transactions)
    if (offset >= 1000) {
      console.log("[sync-ghl-payments] Hit max pagination limit (1000)");
      hasMore = false;
    }
  }

  return allTransactions;
}

interface DailyPaymentTotals {
  sales_count: number;
  sales_dollars: number;
  refund_count: number;
  refund_dollars: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let clientId: string;
  let startDate: string;
  let endDate: string;

  try {
    const body = await req.json();
    clientId = body.clientId || body.client_id;
    
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "clientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.startDate && body.endDate) {
      startDate = body.startDate;
      endDate = body.endDate;
    } else {
      // Default: last 90 days
      const end = new Date();
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - 90);
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[sync-ghl-payments] Client: ${clientId}, Range: ${startDate} to ${endDate}`);

  // Get client GHL credentials
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, ghl_api_key, ghl_location_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return new Response(
      JSON.stringify({ success: false, error: "Client not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!client.ghl_api_key || !client.ghl_location_id) {
    return new Response(
      JSON.stringify({ success: false, error: "Client has no GHL credentials configured" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch transactions from GHL
    const transactions = await fetchGHLTransactions(
      client.ghl_api_key,
      client.ghl_location_id,
      startDate,
      endDate
    );

    console.log(`[sync-ghl-payments] Fetched ${transactions.length} transactions for ${client.name}`);

    // Categorize transactions: successful payments vs refunds
    const successStatuses = ["succeeded", "completed", "paid"];
    const refundStatuses = ["refunded", "partially_refunded", "refund"];

    const successfulPayments = transactions.filter(
      (t) => successStatuses.includes(t.status.toLowerCase())
    );
    const refundedPayments = transactions.filter(
      (t) => refundStatuses.includes(t.status.toLowerCase())
    );

    console.log(`[sync-ghl-payments] ${successfulPayments.length} sales, ${refundedPayments.length} refunds`);

    // Aggregate by date
    const dailyTotals: Record<string, DailyPaymentTotals> = {};

    const ensureDay = (dateStr: string) => {
      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = { sales_count: 0, sales_dollars: 0, refund_count: 0, refund_dollars: 0 };
      }
    };

    // GHL amounts are typically in cents
    const normalizeAmount = (amount: number) => amount >= 100 ? amount / 100 : amount;

    for (const txn of successfulPayments) {
      const dateStr = new Date(txn.createdAt).toISOString().split("T")[0];
      ensureDay(dateStr);
      dailyTotals[dateStr].sales_count++;
      dailyTotals[dateStr].sales_dollars += normalizeAmount(txn.amount);
    }

    for (const txn of refundedPayments) {
      const dateStr = new Date(txn.createdAt).toISOString().split("T")[0];
      ensureDay(dateStr);
      dailyTotals[dateStr].refund_count++;
      dailyTotals[dateStr].refund_dollars += normalizeAmount(Math.abs(txn.amount));
    }

    // Upsert into daily_metrics
    let daysUpdated = 0;
    const errors: string[] = [];

    for (const [dateStr, totals] of Object.entries(dailyTotals)) {
      const { error: upsertError } = await supabase
        .from("daily_metrics" as any)
        .upsert(
          {
            client_id: clientId,
            date: dateStr,
            sales_count: totals.sales_count,
            sales_dollars: totals.sales_dollars,
            refund_count: totals.refund_count,
            refund_dollars: totals.refund_dollars,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,date", ignoreDuplicates: false }
        );

      if (upsertError) {
        errors.push(`${dateStr}: ${upsertError.message}`);
      } else {
        daysUpdated++;
      }
    }

    // Zero out days in range that had no transactions
    const current = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T00:00:00Z");
    while (current <= end) {
      const ds = current.toISOString().split("T")[0];
      if (!dailyTotals[ds]) {
        await supabase
          .from("daily_metrics" as any)
          .update({
            sales_count: 0,
            sales_dollars: 0,
            refund_count: 0,
            refund_dollars: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("client_id", clientId)
          .eq("date", ds);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const totalRevenue = Object.values(dailyTotals).reduce((s, d) => s + d.sales_dollars, 0);
    const totalSales = Object.values(dailyTotals).reduce((s, d) => s + d.sales_count, 0);
    const totalRefunds = Object.values(dailyTotals).reduce((s, d) => s + d.refund_count, 0);
    const totalRefundDollars = Object.values(dailyTotals).reduce((s, d) => s + d.refund_dollars, 0);

    console.log(`[sync-ghl-payments] Done: ${totalSales} sales ($${totalRevenue.toFixed(2)}), ${totalRefunds} refunds ($${totalRefundDollars.toFixed(2)}), ${daysUpdated} days updated`);

    return new Response(
      JSON.stringify({
        success: true,
        client: client.name,
        totalTransactions: transactions.length,
        successfulPayments: successfulPayments.length,
        totalSales,
        totalRevenue,
        totalRefunds,
        totalRefundDollars,
        daysUpdated,
        errors,
        dateRange: { startDate, endDate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[sync-ghl-payments] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
