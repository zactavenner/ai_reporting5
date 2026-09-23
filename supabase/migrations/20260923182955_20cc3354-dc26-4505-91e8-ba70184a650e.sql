REVOKE UPDATE ON public.client_portal_profiles FROM authenticated;

DROP POLICY IF EXISTS "Client portal users can update own profile" ON public.client_portal_profiles;