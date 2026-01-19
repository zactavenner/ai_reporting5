-- Add call recording fields to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 10);

-- Add RLS policy for public read access to calls (matching other tables)
DROP POLICY IF EXISTS "Public can view calls" ON public.calls;
CREATE POLICY "Public can view calls" 
ON public.calls 
FOR SELECT 
USING (true);

-- Add RLS policy for public insert on daily_metrics (for webhook updates)
DROP POLICY IF EXISTS "Public can insert daily_metrics" ON public.daily_metrics;
CREATE POLICY "Public can insert daily_metrics" 
ON public.daily_metrics 
FOR INSERT 
WITH CHECK (true);

-- Add RLS policy for public update on daily_metrics (for manual edits)
DROP POLICY IF EXISTS "Public can update daily_metrics" ON public.daily_metrics;
CREATE POLICY "Public can update daily_metrics" 
ON public.daily_metrics 
FOR UPDATE 
USING (true)
WITH CHECK (true);