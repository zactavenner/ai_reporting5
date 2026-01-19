-- Add DELETE policy for daily_metrics
CREATE POLICY "Public can delete daily_metrics" 
ON public.daily_metrics 
FOR DELETE 
USING (true);

-- Add DELETE policy for leads
CREATE POLICY "Public can delete leads" 
ON public.leads 
FOR DELETE 
USING (true);

-- Add INSERT policy for leads (for manual additions)
CREATE POLICY "Public can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (true);

-- Add DELETE policy for calls
CREATE POLICY "Public can delete calls" 
ON public.calls 
FOR DELETE 
USING (true);

-- Add INSERT policy for calls (for manual additions)
CREATE POLICY "Public can insert calls" 
ON public.calls 
FOR INSERT 
WITH CHECK (true);

-- Add DELETE policy for funded_investors
CREATE POLICY "Public can delete funded_investors" 
ON public.funded_investors 
FOR DELETE 
USING (true);

-- Add INSERT policy for funded_investors (for manual additions)
CREATE POLICY "Public can insert funded_investors" 
ON public.funded_investors 
FOR INSERT 
WITH CHECK (true);

-- Add unique constraint for daily_metrics upsert (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'daily_metrics_client_id_date_key'
  ) THEN
    ALTER TABLE public.daily_metrics 
    ADD CONSTRAINT daily_metrics_client_id_date_key 
    UNIQUE (client_id, date);
  END IF;
END $$;