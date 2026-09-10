CREATE TABLE IF NOT EXISTS public.agent_api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  endpoint text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  request_fingerprint text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.agent_api_idempotency TO service_role;
ALTER TABLE public.agent_api_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only idempotency"
  ON public.agent_api_idempotency FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS agent_api_idempotency_key_idx
  ON public.agent_api_idempotency (endpoint, idempotency_key);