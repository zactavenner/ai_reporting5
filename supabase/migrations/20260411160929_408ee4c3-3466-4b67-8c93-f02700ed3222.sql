
-- Backfill leads counts from the leads table into daily_metrics
-- for any dates where ad_spend > 0 but leads = 0
WITH lead_counts AS (
  SELECT 
    client_id,
    DATE(created_at) as lead_date,
    COUNT(*) FILTER (WHERE 
      COALESCE(is_spam, false) = false 
      AND email IS NOT NULL AND email != '' 
      AND phone IS NOT NULL AND phone != ''
    ) as valid_leads,
    COUNT(*) FILTER (WHERE COALESCE(is_spam, false) = true) as spam_count
  FROM leads
  WHERE created_at >= '2026-04-03'
  GROUP BY client_id, DATE(created_at)
)
UPDATE daily_metrics dm
SET 
  leads = COALESCE(lc.valid_leads, 0),
  spam_leads = COALESCE(lc.spam_count, 0),
  updated_at = NOW()
FROM lead_counts lc
WHERE dm.client_id = lc.client_id 
  AND dm.date = lc.lead_date
  AND dm.leads = 0
  AND dm.ad_spend > 0;
