ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_hot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hot_reason text,
  ADD COLUMN IF NOT EXISTS hot_marked_by text,
  ADD COLUMN IF NOT EXISTS hot_marked_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_client_hot_idx ON public.leads (client_id) WHERE is_hot;

CREATE TABLE public.setter_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  opening text NOT NULL DEFAULT '',
  questions text[] NOT NULL DEFAULT '{}',
  booking text NOT NULL DEFAULT '',
  objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.setter_scripts TO authenticated;
GRANT ALL ON public.setter_scripts TO service_role;

ALTER TABLE public.setter_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setter_scripts_read" ON public.setter_scripts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "setter_scripts_write" ON public.setter_scripts
  FOR ALL TO authenticated
  USING (public.is_reporting_operator())
  WITH CHECK (public.is_reporting_operator());

CREATE TRIGGER setter_scripts_updated_at BEFORE UPDATE ON public.setter_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX setter_scripts_client_idx ON public.setter_scripts (client_id);