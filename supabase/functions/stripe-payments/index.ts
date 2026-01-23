import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { email, clientId, action } = await req.json();
    console.log(`Stripe payments request: action=${action}, email=${email}, clientId=${clientId}`);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (action === "get-customer-payments") {
      // Find customer by email
      const customers = await stripe.customers.list({ email, limit: 1 });
      
      if (customers.data.length === 0) {
        console.log(`No Stripe customer found for email: ${email}`);
        return new Response(
          JSON.stringify({ 
            customer: null, 
            payments: [], 
            subscriptions: [],
            totalPaid: 0,
            mrr: 0 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const customer = customers.data[0];
      console.log(`Found Stripe customer: ${customer.id} for email: ${email}`);

      // Get payment intents for this customer
      const paymentIntents = await stripe.paymentIntents.list({
        customer: customer.id,
        limit: 100,
      });

      // Get successful charges
      const charges = await stripe.charges.list({
        customer: customer.id,
        limit: 100,
      });

      // Get active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 10,
      });

      // Calculate total paid amount (from successful charges)
      const totalPaid = charges.data
        .filter((charge: any) => charge.status === 'succeeded' && !charge.refunded)
        .reduce((sum: number, charge: any) => sum + charge.amount, 0) / 100; // Convert from cents

      // Calculate MRR from active subscriptions
      let mrr = 0;
      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          const price = item.price;
          if (price.recurring) {
            let monthlyAmount = price.unit_amount || 0;
            
            // Normalize to monthly
            switch (price.recurring.interval) {
              case 'day':
                monthlyAmount = monthlyAmount * 30;
                break;
              case 'week':
                monthlyAmount = monthlyAmount * 4;
                break;
              case 'year':
                monthlyAmount = monthlyAmount / 12;
                break;
              // month is already monthly
            }
            
            mrr += (monthlyAmount * (item.quantity || 1)) / 100;
          }
        }
      }

      // Format payments for response
      const payments = charges.data.map((charge: any) => ({
        id: charge.id,
        amount: charge.amount / 100,
        currency: charge.currency,
        status: charge.status,
        created: new Date(charge.created * 1000).toISOString(),
        description: charge.description,
        receipt_url: charge.receipt_url,
        refunded: charge.refunded,
      }));

      // Format subscriptions for response
      const formattedSubscriptions = subscriptions.data.map((sub: any) => ({
        id: sub.id,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        items: sub.items.data.map((item: any) => ({
          price_id: item.price.id,
          product_id: typeof item.price.product === 'string' ? item.price.product : item.price.product?.id,
          unit_amount: (item.price.unit_amount || 0) / 100,
          currency: item.price.currency,
          interval: item.price.recurring?.interval,
          quantity: item.quantity,
        })),
      }));

      console.log(`Found ${payments.length} payments, ${subscriptions.data.length} subscriptions for customer ${customer.id}`);

      return new Response(
        JSON.stringify({
          customer: {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            created: new Date(customer.created * 1000).toISOString(),
          },
          payments,
          subscriptions: formattedSubscriptions,
          totalPaid,
          mrr,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error: any) {
    console.error("Stripe payments error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
