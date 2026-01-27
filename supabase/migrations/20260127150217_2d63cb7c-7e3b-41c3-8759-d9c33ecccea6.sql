-- Add sort_order column to clients table for persistent ordering
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Set initial sort order based on name alphabetically
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as rn
  FROM public.clients
)
UPDATE public.clients c
SET sort_order = o.rn
FROM ordered o
WHERE c.id = o.id;