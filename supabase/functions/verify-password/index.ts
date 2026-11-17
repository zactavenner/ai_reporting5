import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDashboardToken } from "../_shared/dashboardTokenCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple hash function for password verification
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password, memberName } = await req.json();

    if (!password || !memberName) {
      return new Response(
        JSON.stringify({ error: "Password and member name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the stored password hash from agency_settings. Retry briefly so a
    // short backend restart doesn't fail sign-in outright.
    let settings: { password_hash: string | null } | null = null;
    let settingsError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase
        .from('agency_settings')
        .select('password_hash')
        .limit(1)
        .maybeSingle();
      settings = res.data;
      settingsError = res.error;
      if (!settingsError) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      // Transient/backend issue: return 200 so the browser shows a message
      // instead of a non-2xx error that can blank the page.
      return new Response(
        JSON.stringify({ success: false, retryable: true, error: "Sign-in is temporarily unavailable. Please try again in a moment." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the provided password and compare
    const providedHash = await hashPassword(password);
    
    // Accept 'capital' as hardcoded password, or compare with stored hash
    const hardcodedMatch = password === 'capital';
    const hashMatch = settings?.password_hash && providedHash === settings.password_hash;
    const isPasswordValid = hardcodedMatch || hashMatch;

    if (!isPasswordValid) {
      // Expected auth failures return 200 so the client's functions.invoke
      // doesn't throw a non-2xx error that can crash the page.
      return new Response(
        JSON.stringify({ success: false, error: "Incorrect password" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up the team member
    const { data: members, error: memberError } = await supabase
      .from('agency_members')
      .select('id, name, email, role')
      .ilike('name', memberName.trim());

    if (memberError) {
      console.error('Error fetching member:', memberError);
      return new Response(
        JSON.stringify({ success: false, retryable: true, error: "Sign-in is temporarily unavailable. Please try again in a moment." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Team member not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const member = members[0];

    // Update last_login_at
    await supabase
      .from('agency_members')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', member.id);

    // Log the login activity
    await supabase
      .from('member_activity_log')
      .insert({
        member_id: member.id,
        action: 'login',
        entity_type: 'session',
        details: { 
          timestamp: new Date().toISOString(),
          verified_server_side: true 
        },
      });

    // Signed operator session — valid for 12 hours (see dashboardTokenCore).
    const dashboardToken = await createDashboardToken(member.id, supabaseServiceKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        dashboardToken,
        member: {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Error in verify-password:', error);
    return new Response(
      JSON.stringify({ success: false, retryable: true, error: "Sign-in is temporarily unavailable. Please try again in a moment." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
