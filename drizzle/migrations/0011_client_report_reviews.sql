CREATE TABLE public.client_report_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  range_from date NOT NULL,
  range_to date NOT NULL CHECK (range_to >= range_from),
  author_kind text NOT NULL CHECK (author_kind IN ('ai','agent','human')),
  author_name text,
  external_agent_id uuid,
  summary text CHECK (summary IS NULL OR length(summary) <= 4000),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 12),
  facts_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_report_reviews_client_idx ON public.client_report_reviews (client_id, range_to DESC, created_at DESC);
GRANT ALL ON public.client_report_reviews TO service_role;
ALTER TABLE public.client_report_reviews ENABLE ROW LEVEL SECURITY;
-- Service-only: the operator-gated function and the agent RPC below are the only paths.

CREATE OR REPLACE FUNCTION public.mcp_agent_post_report_review(p_client_id uuid, p_from date, p_to date, p_summary text, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a external_agents; rid uuid; it jsonb;
BEGIN
  a := mcp_agent_self();
  IF a.id IS NULL THEN RAISE EXCEPTION 'not_linked_external_agent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND status = 'active') THEN RAISE EXCEPTION 'client_not_active'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN RAISE EXCEPTION 'invalid_range'; END IF;
  IF p_summary IS NOT NULL AND length(p_summary) > 4000 THEN RAISE EXCEPTION 'summary_too_long'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 12 THEN RAISE EXCEPTION 'invalid_items'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(it->>'tone','') NOT IN ('alert','watch','good')
       OR length(coalesce(it->>'title','')) NOT BETWEEN 1 AND 200
       OR length(coalesce(it->>'detail','')) > 1000 THEN RAISE EXCEPTION 'invalid_item'; END IF;
  END LOOP;
  INSERT INTO client_report_reviews (client_id, range_from, range_to, author_kind, author_name, external_agent_id, summary, items)
  VALUES (p_client_id, p_from, p_to, 'agent', a.display_name, a.id, p_summary,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('tone', e->>'tone', 'title', e->>'title', 'detail', coalesce(e->>'detail',''))), '[]'::jsonb) FROM jsonb_array_elements(p_items) e))
  RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.mcp_agent_post_report_review(uuid,date,date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_agent_post_report_review(uuid,date,date,text,jsonb) TO authenticated, service_role;