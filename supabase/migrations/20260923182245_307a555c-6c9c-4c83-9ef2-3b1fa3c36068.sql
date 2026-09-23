CREATE TABLE IF NOT EXISTS public.client_portal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.client_portal_profiles TO authenticated;
GRANT ALL ON public.client_portal_profiles TO service_role;
REVOKE ALL ON public.client_portal_profiles FROM anon;

ALTER TABLE public.client_portal_profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_profiles_email_normalized_key
  ON public.client_portal_profiles (email_normalized);

DROP POLICY IF EXISTS "Client portal users can view own profile" ON public.client_portal_profiles;
CREATE POLICY "Client portal users can view own profile"
  ON public.client_portal_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Client portal users can update own profile" ON public.client_portal_profiles;
CREATE POLICY "Client portal users can update own profile"
  ON public.client_portal_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_client_portal_profiles_updated_at
  BEFORE UPDATE ON public.client_portal_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.client_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_profile_id uuid NOT NULL REFERENCES public.client_portal_profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (portal_profile_id, client_id)
);

GRANT SELECT ON public.client_portal_access TO authenticated;
GRANT ALL ON public.client_portal_access TO service_role;
REVOKE ALL ON public.client_portal_access FROM anon;

ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS client_portal_access_profile_idx
  ON public.client_portal_access (portal_profile_id);
CREATE INDEX IF NOT EXISTS client_portal_access_client_idx
  ON public.client_portal_access (client_id);

DROP POLICY IF EXISTS "Client portal users can view own client access" ON public.client_portal_access;
CREATE POLICY "Client portal users can view own client access"
  ON public.client_portal_access
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_portal_profiles p
      WHERE p.id = client_portal_access.portal_profile_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );