-- Phase 3: Dashboard Configurability (Databox Core)
-- Multi-board dashboard system, widget positioning, goal tracking, scorecards

-- ============================================================
-- 1. dashboard_boards: Saved dashboard layouts per client
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dashboard_boards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  board_type TEXT DEFAULT 'custom' CHECK (board_type IN (
    'custom', 'executive', 'ad_performance', 'attribution', 'funnel', 'scorecard'
  )),
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view dashboard_boards"
  ON public.dashboard_boards FOR SELECT USING (true);

CREATE POLICY "Service role full access to dashboard_boards"
  ON public.dashboard_boards FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_dashboard_boards_client ON public.dashboard_boards(client_id);

CREATE TRIGGER update_dashboard_boards_updated_at
  BEFORE UPDATE ON public.dashboard_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. dashboard_widgets: Individual widgets on a board
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES public.dashboard_boards(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL CHECK (widget_type IN (
    'kpi_card', 'line_chart', 'bar_chart', 'area_chart', 'funnel',
    'table', 'goal_tracker', 'attribution', 'journey_summary',
    'scorecard', 'text_note', 'sync_status'
  )),
  title TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "w": 4, "h": 3}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view dashboard_widgets"
  ON public.dashboard_widgets FOR SELECT USING (true);

CREATE POLICY "Service role full access to dashboard_widgets"
  ON public.dashboard_widgets FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_dashboard_widgets_board ON public.dashboard_widgets(board_id);

-- ============================================================
-- 3. goals: KPI targets with period tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_label TEXT,
  target_value NUMERIC(14,2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_start DATE,
  period_end DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view goals"
  ON public.goals FOR SELECT USING (true);

CREATE POLICY "Service role full access to goals"
  ON public.goals FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_goals_client ON public.goals(client_id);
CREATE INDEX idx_goals_active ON public.goals(client_id, is_active) WHERE is_active = true;

-- ============================================================
-- 4. goal_snapshots: Daily progress snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.goal_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  current_value NUMERIC(14,2) NOT NULL,
  target_value NUMERIC(14,2) NOT NULL,
  progress_pct NUMERIC(8,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('on_track', 'at_risk', 'behind', 'achieved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(goal_id, snapshot_date)
);

ALTER TABLE public.goal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view goal_snapshots"
  ON public.goal_snapshots FOR SELECT USING (true);

CREATE POLICY "Service role full access to goal_snapshots"
  ON public.goal_snapshots FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_goal_snapshots_goal ON public.goal_snapshots(goal_id, snapshot_date DESC);

-- ============================================================
-- 5. Seed default board templates
-- ============================================================
INSERT INTO public.dashboard_boards (client_id, name, description, board_type, is_template, layout) VALUES
  (NULL, 'Executive Overview', 'High-level KPIs, cost of capital, and funded pipeline', 'executive', true,
   '[{"i":"kpi-spend","x":0,"y":0,"w":3,"h":2},{"i":"kpi-leads","x":3,"y":0,"w":3,"h":2},{"i":"kpi-funded","x":6,"y":0,"w":3,"h":2},{"i":"kpi-coc","x":9,"y":0,"w":3,"h":2},{"i":"chart-funnel","x":0,"y":2,"w":6,"h":4},{"i":"chart-spend-trend","x":6,"y":2,"w":6,"h":4},{"i":"table-monthly","x":0,"y":6,"w":12,"h":5}]'),
  (NULL, 'Ad Performance', 'Campaign, adset, and ad-level metrics with attribution', 'ad_performance', true,
   '[{"i":"attribution-table","x":0,"y":0,"w":12,"h":6},{"i":"chart-cpl-trend","x":0,"y":6,"w":6,"h":4},{"i":"chart-roas","x":6,"y":6,"w":6,"h":4}]'),
  (NULL, 'Capital Raising Funnel', 'Full funnel from ad click to funded investor', 'funnel', true,
   '[{"i":"funnel-viz","x":0,"y":0,"w":8,"h":6},{"i":"goal-funded","x":8,"y":0,"w":4,"h":3},{"i":"goal-coc","x":8,"y":3,"w":4,"h":3},{"i":"journey-summary","x":0,"y":6,"w":12,"h":5}]')
ON CONFLICT DO NOTHING;
