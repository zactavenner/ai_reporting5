// Light, spaced Meta Graph calls for SMS-verified tracking (spec 2026-10-28):
// sequential, >=2s apart; read X-Business-Use-Case-Usage — back off >50%, pause >75%;
// on error codes 17/613/80000/80004 wait >=300s then back off exponentially.
const MIN_GAP_MS = 2000;
const THROTTLE_CODES = new Set([17, 613, 80000, 80004]);
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function maxUsagePct(res: Response): number {
  const h = res.headers.get("x-business-use-case-usage");
  if (!h) return 0;
  try {
    let max = 0;
    for (const arr of Object.values(JSON.parse(h)) as any[]) {
      for (const u of arr || []) {
        max = Math.max(max, u.call_count || 0, u.total_cputime || 0, u.total_time || 0);
      }
    }
    return max;
  } catch { return 0; }
}

export async function metaGet(url: string, maxRetries = 3): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url);
    const pct = maxUsagePct(res);
    const json = await res.json().catch(() => ({}));
    const code = json?.error?.code;
    if (code && THROTTLE_CODES.has(code)) {
      if (attempt >= maxRetries) throw new Error(`Meta throttled (code ${code})`);
      await sleep(300_000 * 2 ** attempt);
      continue;
    }
    if (pct > 75) await sleep(300_000);
    else if (pct > 50) await sleep(30_000);
    if (json?.error) throw new Error(json.error.message || `Meta error ${code}`);
    return json;
  }
}

/** lead_gen_form_id from an ad creative: object_story_spec first, then asset_feed_spec. */
export function leadFormIdFromCreative(creative: any): string | null {
  const oss = creative?.object_story_spec || {};
  const v = oss.link_data?.call_to_action?.value?.lead_gen_form_id
    || oss.video_data?.call_to_action?.value?.lead_gen_form_id
    || oss.template_data?.call_to_action?.value?.lead_gen_form_id;
  if (v) return String(v);
  const afs = creative?.asset_feed_spec || {};
  for (const cta of afs.call_to_actions || []) {
    if (cta?.value?.lead_gen_form_id) return String(cta.value.lead_gen_form_id);
  }
  for (const ld of afs.link_urls || []) {
    if (ld?.lead_gen_form_id) return String(ld.lead_gen_form_id);
  }
  return null;
}
