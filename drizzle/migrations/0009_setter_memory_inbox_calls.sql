CREATE TABLE public.lead_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact','objection','summary')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  source text NOT NULL DEFAULT 'setter' CHECK (source IN ('setter','ai_caller','transcript')),
  author text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_memory_lead_idx ON public.lead_memory (lead_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.lead_memory TO authenticated;
GRANT ALL ON public.lead_memory TO service_role;
ALTER TABLE public.lead_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_memory_read" ON public.lead_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_memory_insert" ON public.lead_memory FOR INSERT TO authenticated WITH CHECK (source <> 'ai_caller');
CREATE POLICY "lead_memory_delete" ON public.lead_memory FOR DELETE TO authenticated USING (public.is_reporting_operator());

CREATE TABLE public.inbox_reads (
  member_key text NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_key, lead_id)
);
GRANT SELECT, INSERT, UPDATE ON public.inbox_reads TO authenticated;
GRANT ALL ON public.inbox_reads TO service_role;
ALTER TABLE public.inbox_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_reads_all" ON public.inbox_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.setter_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  setter_name text,
  setter_phone text NOT NULL,
  to_phone text NOT NULL,
  from_phone text,
  twilio_call_sid text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  webhook_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX setter_calls_lead_idx ON public.setter_calls (lead_id, created_at DESC);
GRANT SELECT ON public.setter_calls TO authenticated;
GRANT ALL ON public.setter_calls TO service_role;
ALTER TABLE public.setter_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setter_calls_read" ON public.setter_calls FOR SELECT TO authenticated USING (true);
REVOKE SELECT (webhook_token) ON public.setter_calls FROM authenticated;

CREATE TABLE public.setter_call_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.setter_calls(id) ON DELETE CASCADE,
  speaker text NOT NULL CHECK (speaker IN ('lead','setter')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX setter_call_lines_call_idx ON public.setter_call_lines (call_id, created_at);
GRANT SELECT ON public.setter_call_lines TO authenticated;
GRANT ALL ON public.setter_call_lines TO service_role;
ALTER TABLE public.setter_call_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setter_call_lines_read" ON public.setter_call_lines FOR SELECT TO authenticated USING (true);