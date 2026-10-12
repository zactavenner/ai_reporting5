// One definition of a "reporting day" for every daily_metrics reader/writer.
// daily_metrics rows in production are bucketed by America/Los_Angeles days,
// so UTC-day recounts disagree every day (and the "auto-fix" flips them back and forth).
export const REPORTING_TZ = Deno.env.get("REPORTING_TIMEZONE") || "America/Los_Angeles";

function tzOffsetMinutes(utc: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(utc);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUtc - utc.getTime()) / 60000;
}

/** UTC ISO [start, nextStart) for local calendar day `date` (YYYY-MM-DD) in `tz`. DST-safe. */
export function dayBounds(date: string, tz: string = REPORTING_TZ): { start: string; next: string } {
  const startOf = (d: string) => {
    const guess = new Date(`${d}T00:00:00Z`);
    let t = guess.getTime() - tzOffsetMinutes(guess, tz) * 60000;
    t = guess.getTime() - tzOffsetMinutes(new Date(t), tz) * 60000; // re-evaluate across DST edge
    return new Date(t).toISOString();
  };
  const n = new Date(`${date}T00:00:00Z`); n.setUTCDate(n.getUTCDate() + 1);
  return { start: startOf(date), next: startOf(n.toISOString().slice(0, 10)) };
}

/** Local YYYY-MM-DD for "now minus N days" in tz. */
export function localDate(daysAgo = 0, tz: string = REPORTING_TZ): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
