-- Data integrity hardening: add missing CHECK constraints and fix RLS inconsistencies

-- ═══════════════════════════════════════════
-- 1. ADD CHECK CONSTRAINTS to status fields
-- ═══════════════════════════════════════════

-- creatives.status — was unconstrained, allowing ad-hoc values
DO $$ BEGIN
  ALTER TABLE public.creatives
    ADD CONSTRAINT creatives_status_check
    CHECK (status IN ('pending', 'approved', 'revisions', 'rejected', 'launched'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- clients.ghl_sync_status — was unconstrained
DO $$ BEGIN
  ALTER TABLE public.clients
    ADD CONSTRAINT clients_ghl_sync_status_check
    CHECK (ghl_sync_status IS NULL OR ghl_sync_status IN ('healthy', 'stale', 'error', 'not_configured', 'partial'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- calls.appointment_status — was unconstrained
DO $$ BEGIN
  ALTER TABLE public.calls
    ADD CONSTRAINT calls_appointment_status_check
    CHECK (appointment_status IS NULL OR appointment_status IN (
      'confirmed', 'cancelled', 'no_show', 'showed', 'rescheduled', 'pending', 'completed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════
-- 2. FIX AI OUTREACH RLS — standardize to match rest of platform
-- The ai_outreach tables used `TO authenticated` while everything else uses USING (true)
-- ═══════════════════════════════════════════

-- Drop the inconsistent policies
DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON public.ai_outreach_campaigns;
DROP POLICY IF EXISTS "Authenticated users can create campaigns" ON public.ai_outreach_campaigns;
DROP POLICY IF EXISTS "Authenticated users can update own campaigns" ON public.ai_outreach_campaigns;
DROP POLICY IF EXISTS "Service role full access to campaigns" ON public.ai_outreach_campaigns;

DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.ai_outreach_messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.ai_outreach_messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.ai_outreach_messages;
DROP POLICY IF EXISTS "Service role full access to messages" ON public.ai_outreach_messages;

-- Recreate with standard open access (consistent with platform pattern)
CREATE POLICY "Public can view ai_outreach_campaigns" ON public.ai_outreach_campaigns FOR SELECT USING (true);
CREATE POLICY "Public can insert ai_outreach_campaigns" ON public.ai_outreach_campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update ai_outreach_campaigns" ON public.ai_outreach_campaigns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete ai_outreach_campaigns" ON public.ai_outreach_campaigns FOR DELETE USING (true);

CREATE POLICY "Public can view ai_outreach_messages" ON public.ai_outreach_messages FOR SELECT USING (true);
CREATE POLICY "Public can insert ai_outreach_messages" ON public.ai_outreach_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update ai_outreach_messages" ON public.ai_outreach_messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete ai_outreach_messages" ON public.ai_outreach_messages FOR DELETE USING (true);
