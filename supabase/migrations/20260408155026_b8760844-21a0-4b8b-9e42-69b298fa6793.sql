
-- Expand client_offers with new columns
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS fund_name TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS fund_type TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS raise_amount TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS min_investment TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS timeline TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS target_investor TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS targeted_returns TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS hold_period TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS distribution_schedule TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS investment_range TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS tax_advantages TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS credibility TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS fund_history TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS speaker_name TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS industry_focus TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS brand_notes TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS additional_notes TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS brand_colors JSONB DEFAULT '[]';
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS brand_fonts JSONB DEFAULT '[]';
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS pitch_deck_url TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS budget_amount NUMERIC;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS budget_mode TEXT DEFAULT 'monthly';
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS accredited_only BOOLEAN DEFAULT true;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS reg_d_type TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS meta_page_id TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_fulfillment';
ALTER TABLE public.client_offers ADD COLUMN IF NOT EXISTS raw_form_data JSONB;

-- Create fulfillment_runs table
CREATE TABLE IF NOT EXISTS public.fulfillment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.client_offers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  run_mode TEXT NOT NULL DEFAULT 'full',
  current_phase TEXT,
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  failed_steps INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fulfillment_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fulfillment_runs" ON public.fulfillment_runs FOR ALL USING (true) WITH CHECK (true);

-- Create fulfillment_steps table
CREATE TABLE IF NOT EXISTS public.fulfillment_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.fulfillment_runs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'edge_function',
  status TEXT NOT NULL DEFAULT 'pending',
  function_name TEXT,
  function_params JSONB,
  output_data JSONB,
  asset_id UUID,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  depends_on UUID[],
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fulfillment_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fulfillment_steps" ON public.fulfillment_steps FOR ALL USING (true) WITH CHECK (true);

-- Create browser_tasks table
CREATE TABLE IF NOT EXISTS public.browser_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_run_id UUID REFERENCES public.fulfillment_runs(id) ON DELETE SET NULL,
  fulfillment_step_id UUID REFERENCES public.fulfillment_steps(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offer_id UUID,
  task_type TEXT NOT NULL,
  task_group TEXT,
  priority INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued',
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB,
  error_message TEXT,
  screenshot_url TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.browser_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to browser_tasks" ON public.browser_tasks FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fulfillment_runs_client_id ON public.fulfillment_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_runs_status ON public.fulfillment_runs(status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_steps_run_id ON public.fulfillment_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_steps_status ON public.fulfillment_steps(status);
CREATE INDEX IF NOT EXISTS idx_browser_tasks_client_id ON public.browser_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_browser_tasks_status ON public.browser_tasks(status);
CREATE INDEX IF NOT EXISTS idx_browser_tasks_queued ON public.browser_tasks(priority, created_at) WHERE status = 'queued';

-- Trigger: auto-update updated_at on fulfillment_runs
CREATE TRIGGER update_fulfillment_runs_updated_at
  BEFORE UPDATE ON public.fulfillment_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger function: auto-sync step counts to fulfillment_runs
CREATE OR REPLACE FUNCTION public.sync_fulfillment_step_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.fulfillment_runs SET
    total_steps = (SELECT COUNT(*) FROM public.fulfillment_steps WHERE run_id = COALESCE(NEW.run_id, OLD.run_id)),
    completed_steps = (SELECT COUNT(*) FROM public.fulfillment_steps WHERE run_id = COALESCE(NEW.run_id, OLD.run_id) AND status = 'completed'),
    failed_steps = (SELECT COUNT(*) FROM public.fulfillment_steps WHERE run_id = COALESCE(NEW.run_id, OLD.run_id) AND status = 'failed')
  WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_step_counts_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.fulfillment_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fulfillment_step_counts();

-- Enable realtime for tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.fulfillment_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fulfillment_steps;
