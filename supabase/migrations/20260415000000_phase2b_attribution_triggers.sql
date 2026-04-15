-- Phase 2b: Wiring layer — DB triggers to auto-create touchpoints from lead/call/funded inserts
-- Avoids modifying massive sync edge functions; triggers fire on every INSERT regardless of source.

-- ============================================================
-- 1. Trigger: when a new lead is created, insert a form_submit touchpoint
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_lead_touchpoint()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create touchpoint if we don't already have one for this lead
  -- (prevents duplicate touchpoints on lead re-sync)
  IF NOT EXISTS (
    SELECT 1 FROM public.lead_touchpoints
    WHERE lead_id = NEW.id AND touchpoint_type IN ('form_submit', 'ad_click')
    LIMIT 1
  ) THEN
    INSERT INTO public.lead_touchpoints (
      lead_id, client_id, touchpoint_type,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      timestamp, metadata
    )
    VALUES (
      NEW.id,
      NEW.client_id,
      'form_submit',
      NEW.utm_source,
      NEW.utm_medium,
      NEW.utm_campaign,
      NEW.utm_content,
      NEW.utm_term,
      -- Try to resolve campaign_name → meta_campaign_id at trigger time
      (SELECT meta_campaign_id FROM public.meta_campaigns
        WHERE client_id = NEW.client_id
          AND (name = NEW.campaign_name OR meta_campaign_id = NEW.campaign_name OR name = NEW.utm_campaign OR meta_campaign_id = NEW.utm_campaign)
        LIMIT 1),
      (SELECT meta_adset_id FROM public.meta_ad_sets
        WHERE client_id = NEW.client_id
          AND (name = NEW.ad_set_name OR meta_adset_id = NEW.ad_set_name OR name = NEW.utm_medium OR meta_adset_id = NEW.utm_medium)
        LIMIT 1),
      (SELECT meta_ad_id FROM public.meta_ads
        WHERE client_id = NEW.client_id
          AND (meta_ad_id = NEW.ad_id OR meta_ad_id = NEW.utm_content OR name = NEW.ad_id)
        LIMIT 1),
      COALESCE(NEW.created_at, now()),
      jsonb_build_object(
        'source', 'lead_insert_trigger',
        'lead_source', NEW.source,
        'is_spam', COALESCE(NEW.is_spam, false)
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS create_lead_touchpoint_trigger ON public.leads;
CREATE TRIGGER create_lead_touchpoint_trigger
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.create_lead_touchpoint();

-- ============================================================
-- 2. Trigger: when a call is booked, insert call_booked touchpoint
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_call_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_campaign TEXT;
  v_lead_adset TEXT;
  v_lead_ad TEXT;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Inherit campaign/adset/ad from the lead's existing touchpoint
  SELECT meta_campaign_id, meta_adset_id, meta_ad_id
  INTO v_lead_campaign, v_lead_adset, v_lead_ad
  FROM public.lead_touchpoints
  WHERE lead_id = NEW.lead_id
    AND meta_campaign_id IS NOT NULL
  ORDER BY timestamp ASC
  LIMIT 1;

  -- Insert call_booked touchpoint
  INSERT INTO public.lead_touchpoints (
    lead_id, client_id, touchpoint_type,
    meta_campaign_id, meta_adset_id, meta_ad_id,
    timestamp, metadata
  )
  VALUES (
    NEW.lead_id,
    NEW.client_id,
    'call_booked',
    v_lead_campaign,
    v_lead_adset,
    v_lead_ad,
    COALESCE(NEW.booked_at, NEW.created_at, now()),
    jsonb_build_object('call_id', NEW.id, 'source', 'call_insert_trigger')
  );

  -- If the call is also marked showed on insert, add showed touchpoint too
  IF NEW.showed = true THEN
    INSERT INTO public.lead_touchpoints (
      lead_id, client_id, touchpoint_type,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      timestamp, metadata
    )
    VALUES (
      NEW.lead_id,
      NEW.client_id,
      'call_showed',
      v_lead_campaign,
      v_lead_adset,
      v_lead_ad,
      COALESCE(NEW.scheduled_at, NEW.booked_at, now()),
      jsonb_build_object('call_id', NEW.id, 'source', 'call_insert_trigger')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS create_call_touchpoint_trigger ON public.calls;
CREATE TRIGGER create_call_touchpoint_trigger
  AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.create_call_touchpoint();

-- Also fire on UPDATE when showed flips from false → true
CREATE OR REPLACE FUNCTION public.create_call_showed_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_campaign TEXT;
  v_lead_adset TEXT;
  v_lead_ad TEXT;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only when showed transitions to true
  IF (OLD.showed IS DISTINCT FROM NEW.showed) AND NEW.showed = true THEN
    SELECT meta_campaign_id, meta_adset_id, meta_ad_id
    INTO v_lead_campaign, v_lead_adset, v_lead_ad
    FROM public.lead_touchpoints
    WHERE lead_id = NEW.lead_id
      AND meta_campaign_id IS NOT NULL
    ORDER BY timestamp ASC
    LIMIT 1;

    INSERT INTO public.lead_touchpoints (
      lead_id, client_id, touchpoint_type,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      timestamp, metadata
    )
    VALUES (
      NEW.lead_id, NEW.client_id, 'call_showed',
      v_lead_campaign, v_lead_adset, v_lead_ad,
      COALESCE(NEW.scheduled_at, now()),
      jsonb_build_object('call_id', NEW.id, 'source', 'call_update_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS create_call_showed_touchpoint_trigger ON public.calls;
CREATE TRIGGER create_call_showed_touchpoint_trigger
  AFTER UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.create_call_showed_touchpoint();

-- ============================================================
-- 3. Trigger: when a funded investor is created, insert funded touchpoint
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_funded_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_campaign TEXT;
  v_lead_adset TEXT;
  v_lead_ad TEXT;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT meta_campaign_id, meta_adset_id, meta_ad_id
  INTO v_lead_campaign, v_lead_adset, v_lead_ad
  FROM public.lead_touchpoints
  WHERE lead_id = NEW.lead_id
    AND meta_campaign_id IS NOT NULL
  ORDER BY timestamp ASC
  LIMIT 1;

  -- Commitment touchpoint (if commitment_amount > 0)
  IF COALESCE(NEW.commitment_amount, 0) > 0 THEN
    INSERT INTO public.lead_touchpoints (
      lead_id, client_id, touchpoint_type,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      timestamp, metadata
    )
    VALUES (
      NEW.lead_id, NEW.client_id, 'commitment',
      v_lead_campaign, v_lead_adset, v_lead_ad,
      COALESCE(NEW.created_at, now()),
      jsonb_build_object(
        'funded_investor_id', NEW.id,
        'value', NEW.commitment_amount,
        'source', 'funded_insert_trigger'
      )
    );
  END IF;

  -- Funded touchpoint (if funded_amount > 0)
  IF COALESCE(NEW.funded_amount, 0) > 0 THEN
    INSERT INTO public.lead_touchpoints (
      lead_id, client_id, touchpoint_type,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      timestamp, metadata
    )
    VALUES (
      NEW.lead_id, NEW.client_id, 'funded',
      v_lead_campaign, v_lead_adset, v_lead_ad,
      COALESCE(NEW.funded_at, NEW.created_at, now()),
      jsonb_build_object(
        'funded_investor_id', NEW.id,
        'value', NEW.funded_amount,
        'source', 'funded_insert_trigger'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS create_funded_touchpoint_trigger ON public.funded_investors;
CREATE TRIGGER create_funded_touchpoint_trigger
  AFTER INSERT ON public.funded_investors
  FOR EACH ROW EXECUTE FUNCTION public.create_funded_touchpoint();

-- ============================================================
-- 4. Backfill: create touchpoints for existing leads (one-time)
-- ============================================================
-- Backfill form_submit touchpoints for all existing leads that don't have one
INSERT INTO public.lead_touchpoints (
  lead_id, client_id, touchpoint_type,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  meta_campaign_id, meta_adset_id, meta_ad_id,
  timestamp, metadata
)
SELECT
  l.id, l.client_id, 'form_submit',
  l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term,
  (SELECT meta_campaign_id FROM public.meta_campaigns
    WHERE client_id = l.client_id
      AND (name = l.campaign_name OR meta_campaign_id = l.campaign_name OR name = l.utm_campaign OR meta_campaign_id = l.utm_campaign)
    LIMIT 1),
  (SELECT meta_adset_id FROM public.meta_ad_sets
    WHERE client_id = l.client_id
      AND (name = l.ad_set_name OR meta_adset_id = l.ad_set_name OR name = l.utm_medium OR meta_adset_id = l.utm_medium)
    LIMIT 1),
  (SELECT meta_ad_id FROM public.meta_ads
    WHERE client_id = l.client_id
      AND (meta_ad_id = l.ad_id OR meta_ad_id = l.utm_content OR name = l.ad_id)
    LIMIT 1),
  COALESCE(l.created_at, now()),
  jsonb_build_object('source', 'one_time_backfill', 'lead_source', l.source)
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_touchpoints
  WHERE lead_id = l.id AND touchpoint_type IN ('form_submit', 'ad_click')
)
LIMIT 50000; -- safety cap; re-run if more leads exist
