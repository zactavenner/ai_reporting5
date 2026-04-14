
-- Backfill daily_metrics.leads from source leads table (Apr 7-14)
UPDATE daily_metrics dm
SET leads = sub.actual_leads
FROM (
  SELECT l.client_id, l.created_at::date as dt, 
    COUNT(*) FILTER (WHERE NOT COALESCE(l.is_spam, false) AND l.email IS NOT NULL AND l.email != '' AND l.phone IS NOT NULL AND l.phone != '') as actual_leads
  FROM leads l
  WHERE l.created_at >= '2026-04-07' AND l.created_at < '2026-04-15'
  GROUP BY l.client_id, l.created_at::date
) sub
WHERE dm.client_id = sub.client_id AND dm.date = sub.dt AND dm.leads != sub.actual_leads;

-- Backfill daily_metrics.calls from source calls table (Apr 7-14)
UPDATE daily_metrics dm
SET calls = sub.actual_calls
FROM (
  SELECT c.client_id, c.booked_at::date as dt,
    COUNT(*) FILTER (WHERE NOT COALESCE(c.is_reconnect, false)) as actual_calls
  FROM calls c
  WHERE c.booked_at >= '2026-04-07' AND c.booked_at < '2026-04-15'
  GROUP BY c.client_id, c.booked_at::date
) sub
WHERE dm.client_id = sub.client_id AND dm.date = sub.dt AND dm.calls != sub.actual_calls;

-- Backfill daily_metrics.showed_calls from source calls table (Apr 7-14)
UPDATE daily_metrics dm
SET showed_calls = sub.actual_showed
FROM (
  SELECT c.client_id, c.booked_at::date as dt,
    COUNT(*) FILTER (WHERE COALESCE(c.showed, false) AND NOT COALESCE(c.is_reconnect, false)) as actual_showed
  FROM calls c
  WHERE c.booked_at >= '2026-04-07' AND c.booked_at < '2026-04-15'
  GROUP BY c.client_id, c.booked_at::date
) sub
WHERE dm.client_id = sub.client_id AND dm.date = sub.dt AND dm.showed_calls != sub.actual_showed;

-- Also fix rows where calls/showed exist in source but daily_metrics has 0 (Titan etc with no booked_at match)
-- Insert missing Titan leads for dates where dm exists but leads=0
-- Already handled by the UPDATE above since it matches on date
