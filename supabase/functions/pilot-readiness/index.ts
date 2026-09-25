import { createClient } from 'npm:@supabase/supabase-js@2';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import { createPilotHandler } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
// Custom signed dashboard authentication is checked before all source reads.
Deno.serve(createPilotHandler(db, (req, body) => authorizeOperator(req, db, createClient, body)));
