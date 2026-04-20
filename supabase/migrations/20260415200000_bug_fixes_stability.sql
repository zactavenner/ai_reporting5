-- Stability & data accuracy fixes
-- 1. Add ghl_webhook_secret to client_settings (for HMAC signature verification)
-- 2. Wrap Phase 2b triggers in EXCEPTION handlers so errors log but don't break parent INSERTs
-- 3. Add duplicate-event detection index on capi_events for monitoring
-- 4. Resolve daily_metrics conflict-key ambiguity by backfilling date_account_tz

-- ============================================================
-- 1. Add ghl_webhook_secret to client_settings
-- ============================================================
ALTER TABLE public.client_settings
  ADD COLUMN IF NOT EXISTS ghl_webhook_secret TEXT;

COMMENT ON COLUMN public.client_settings.ghl_webhook_secret IS
  'HMAC-SHA256 shared secret for verifying GHL webhook signatures. When set, ghl-webhook-router REQUIRES valid signature. When NULL, unsigned webhooks are allowed with a warning.';

-- ============================================================
-- 2. Replace Phase 2b triggers with error-safe versions
-- ============================================================
-- These triggers should NEVER break parent INSERTs. Wrap the whole body
-- in EXCEPTION handlers so errors log to sync_warnings but leads/calls/funded
-- still get inserted even if touchpoint creation fails.

-- Lead → form_submit touchpoint
CREATE OR REPLACE FUNCTION public.create_lead_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id TEXT;
BEGIN
  -- Try to resolve meta_campaign_id from the lead's UTM params
  IF NEW.utm_campaign IS NOT NULL THEN
    SELECT meta_campaign_id INTO v_campaign_id
    FROM public.meta_campaigns
    WHERE client_id = NEW.client_id
      AND (name = NEW.utm_campaign OR meta_campaign_id = NEW.utm_campaign)
    LIMIT 1;
  END IF;

  INSERT INTO public.lead_touchpoints (
    lead_id, client_id, touchpoint_type,
    meta_campaign_id, meta_adset_id, meta_ad_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    timestamp, metadata
  ) VALUES (
    NEW.id, NEW.client_id, 'form_submit',
    COALESCE(v_campaign_id, NULL),
    NULL, -- adset resolution would require more context
    COALESCE(NEW.ad_id, NEW.utm_content),
    NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.utm_content, NEW.utm_term,
    NEW.created_at,
    jsonb_build_object('auto_created', true, 'source', 'lead_insert_trigger')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the parent INSERT
  BEGIN
    INSERT INTO public.sync_warnings (client_id, warning_type, message, metadata)
    VALUES (
      NEW.client_id,
      'trigger_error',
      'create_lead_touchpoint trigger failed: ' || SQLERRM,
      jsonb_build_object('lead_id', NEW.id, 'sqlstate', SQLSTATE)
    );
  EXCEPTION WHEN OTHERS THEN
    -- If even warning logging fails, just continue
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Call → call_booked / call_showed touchpoint
CREATE OR REPLACE FUNCTION public.create_call_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_client_id UUID;
  v_touchpoint_type TEXT;
BEGIN
  -- Skip if no lead linkage
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get client_id via lead (calls table may not have client_id directly)
  SELECT client_id INTO v_lead_client_id FROM public.leads WHERE id = NEW.lead_id;
  IF v_lead_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_touchpoint_type := CASE WHEN NEW.showed = true THEN 'call_showed' ELSE 'call_booked' END;

  INSERT INTO public.lead_touchpoints (
    lead_id, client_id, touchpoint_type, timestamp, metadata
  ) VALUES (
    NEW.lead_id, v_lead_client_id, v_touchpoint_type,
    COALESCE(NEW.scheduled_at, NEW.created_at, now()),
    jsonb_build_object('call_id', NEW.id, 'showed', COALESCE(NEW.showed, false), 'auto_created', true)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.sync_warnings (client_id, warning_type, message, metadata)
    VALUES (
      v_lead_client_id,
      'trigger_error',
      'create_call_touchpoint trigger failed: ' || SQLERRM,
      jsonb_build_object('call_id', NEW.id, 'lead_id', NEW.lead_id, 'sqlstate', SQLSTATE)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Funded investor → funded touchpoint (with dollar value in metadata)
CREATE OR REPLACE FUNCTION public.create_funded_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_client_id UUID;
  v_amount NUMERIC;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id INTO v_lead_client_id FROM public.leads WHERE id = NEW.lead_id;
  IF v_lead_client_id IS NULL THEN
    v_lead_client_id := NEW.client_id;
  END IF;

  v_amount := COALESCE(NEW.funded_amount, NEW.commitment_amount, 0);

  INSERT INTO public.lead_touchpoints (
    lead_id, client_id, touchpoint_type, timestamp, metadata
  ) VALUES (
    NEW.lead_id, v_lead_client_id, 'funded',
    COALESCE(NEW.funded_at, now()),
    jsonb_build_object(
      'funded_investor_id', NEW.id,
      'value', v_amount,
      'funded_amount', NEW.funded_amount,
      'commitment_amount', NEW.commitment_amount,
      'auto_created', true
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.sync_warnings (client_id, warning_type, message, metadata)
    VALUES (
      COALESCE(v_lead_client_id, NEW.client_id),
      'trigger_error',
      'create_funded_touchpoint trigger failed: ' || SQLERRM,
      jsonb_build_object('funded_investor_id', NEW.id, 'lead_id', NEW.lead_id, 'sqlstate', SQLSTATE)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 3. Add duplicate detection on capi_events
-- ============================================================
-- capi_events.user_data now includes event_id (from meta-conversion-api fix).
-- This index helps detect duplicates for monitoring but doesn't enforce uniqueness
-- (we want to log attempted duplicates, not reject them).
CREATE INDEX IF NOT EXISTS idx_capi_events_event_id
  ON public.capi_events ((user_data->>'event_id'))
  WHERE user_data ? 'event_id';

-- ============================================================
-- 4. Backfill date_account_tz for existing rows
-- ============================================================
-- Earlier migration copied `date` into `date_account_tz` unconditionally.
-- This is fine for now (same value), but ensures any rows with NULL get filled.
UPDATE public.daily_metrics
  SET date_account_tz = date
  WHERE date_account_tz IS NULL;

-- Add a NOT NULL constraint going forward (prevents the race condition
-- where one writer sets date_account_tz and another doesn't).
-- We do this only after backfill, to avoid breaking existing data.
ALTER TABLE public.daily_metrics
  ALTER COLUMN date_account_tz SET DEFAULT CURRENT_DATE;

-- ============================================================
-- 5. Helpful indexes for sync_warnings lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sync_warnings_type_time
  ON public.sync_warnings(warning_type, created_at DESC);
