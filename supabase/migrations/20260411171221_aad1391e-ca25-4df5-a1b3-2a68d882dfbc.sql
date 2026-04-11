-- Backfill daily_metrics.leads from the leads table for all dates in last 60 days
WITH daily_lead_counts AS (
  SELECT client_id, created_at::date as lead_date, count(*) as actual_count
  FROM leads
  WHERE created_at >= now() - interval '60 days'
  GROUP BY client_id, created_at::date
)
UPDATE daily_metrics dm
SET leads = dlc.actual_count,
    updated_at = now()
FROM daily_lead_counts dlc
WHERE dm.client_id = dlc.client_id
  AND dm.date = dlc.lead_date
  AND (dm.leads IS NULL OR dm.leads < dlc.actual_count);

-- Also insert missing daily_metrics rows where leads exist but no metrics row
INSERT INTO daily_metrics (client_id, date, leads, ad_spend, created_at, updated_at)
SELECT dlc.client_id, dlc.lead_date, dlc.actual_count, 0, now(), now()
FROM (
  SELECT client_id, created_at::date as lead_date, count(*) as actual_count
  FROM leads
  WHERE created_at >= now() - interval '60 days'
  GROUP BY client_id, created_at::date
) dlc
LEFT JOIN daily_metrics dm ON dm.client_id = dlc.client_id AND dm.date = dlc.lead_date
WHERE dm.id IS NULL;