-- Sendblue tables are backend-only: credentials and webhook signing secrets live
-- here, so no browser role may hold any privilege on them. Grants were present
-- (verified, not assumed) and are revoked explicitly.
REVOKE ALL ON public.sendblue_accounts FROM anon, authenticated;
REVOKE ALL ON public.sendblue_lines FROM anon, authenticated;
REVOKE ALL ON public.sendblue_conversations FROM anon, authenticated;
REVOKE ALL ON public.sendblue_messages FROM anon, authenticated;
REVOKE ALL ON public.sendblue_optouts FROM anon, authenticated;
REVOKE ALL ON public.sendblue_ghl_mirrors FROM anon, authenticated;

GRANT ALL ON public.sendblue_accounts TO service_role;
GRANT ALL ON public.sendblue_lines TO service_role;
GRANT ALL ON public.sendblue_conversations TO service_role;
GRANT ALL ON public.sendblue_messages TO service_role;
GRANT ALL ON public.sendblue_optouts TO service_role;
GRANT ALL ON public.sendblue_ghl_mirrors TO service_role;

-- RLS stays enabled with no browser policies as a second layer.
ALTER TABLE public.sendblue_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sendblue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sendblue_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sendblue_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sendblue_optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sendblue_ghl_mirrors ENABLE ROW LEVEL SECURITY;