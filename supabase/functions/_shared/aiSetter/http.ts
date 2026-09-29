import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeOperator } from '../operatorAuth.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dashboard-token, x-bridge-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Verified operator (signed dashboard session, admin/owner) — never a hardcoded password. */
export async function requireOperator(req: Request, sb: any, body: unknown) {
  const auth = await authorizeOperator(req, sb, createClient, body);
  if (!auth.ok) return { error: json({ error: auth.error, code: auth.code }, auth.status) };
  return { auth };
}

export async function requireClient(sb: any, clientId: unknown) {
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const { data } = await sb.from('clients').select('id,name').eq('id', clientId).maybeSingle();
  return data;
}

export function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
