// Pure ranking + business-day helpers for ad-scoreboard.
// Spend is lifetime meta_ads.spend until a Meta system-user token supplies daily insights.

export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

const UNSCORED = Number.POSITIVE_INFINITY;

export type ScoreAd = {
  meta_ad_id: string | null;
  name: string | null;
  spend: number | string | null;
  attributed_leads: number | null;
  attributed_calls: number | null;
  attributed_showed: number | null;
  attributed_funded: number | null;
};

export type RankedAd = {
  meta_ad_id: string;
  ad_name: string | null;
  spend: number;
  leads: number;
  booked_calls: number;
  shows: number;
  funded: number;
  cost_per_booked_call: number | null;
  cost_per_show: number | null;
  rank: number;
};

export function costPer(spend: number, count: number): number | null {
  if (!(count > 0) || !Number.isFinite(spend)) return null;
  return Math.round((spend / count) * 100) / 100;
}

function sortKey(value: number | null): number {
  return value == null ? UNSCORED : value;
}

/** Lower cost per booked call wins. Equal call cost breaks to lower cost per show. */
export function rankAds(ads: ScoreAd[]): RankedAd[] {
  const ranked = ads
    .filter((ad) => !!ad.meta_ad_id && Number(ad.spend) > 0)
    .map((ad) => {
      const spend = Number(ad.spend);
      const booked = Number(ad.attributed_calls) || 0;
      const shows = Number(ad.attributed_showed) || 0;
      return {
        meta_ad_id: ad.meta_ad_id as string,
        ad_name: ad.name,
        spend,
        leads: Number(ad.attributed_leads) || 0,
        booked_calls: booked,
        shows,
        funded: Number(ad.attributed_funded) || 0,
        cost_per_booked_call: costPer(spend, booked),
        cost_per_show: costPer(spend, shows),
      };
    })
    .sort((a, b) => {
      const byCall = sortKey(a.cost_per_booked_call) - sortKey(b.cost_per_booked_call);
      if (byCall !== 0) return byCall;
      return sortKey(a.cost_per_show) - sortKey(b.cost_per_show);
    });

  return ranked.map((ad, index) => ({ ...ad, rank: index + 1 }));
}

export function businessDay(now = new Date(), timeZone = BUSINESS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function businessDayRange(
  now = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): { day: string; start: string; end: string } {
  const day = businessDay(now, timeZone);
  return {
    day,
    start: zonedLocalToUtc(day, 0, 0, 0, 0, timeZone).toISOString(),
    end: zonedLocalToUtc(day, 23, 59, 59, 999, timeZone).toISOString(),
  };
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function zonedLocalToUtc(
  day: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, date, hour, minute, second, ms);
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  const corrected = utcGuess - offset;
  const offsetAtCorrected = timeZoneOffsetMs(new Date(corrected), timeZone);
  return new Date(utcGuess - offsetAtCorrected);
}
