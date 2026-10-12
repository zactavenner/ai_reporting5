import { describe, expect, it } from "vitest";
import { businessDayRange, rankAds, type ScoreAd } from "../../supabase/functions/ad-scoreboard/score";

function ad(partial: Partial<ScoreAd> & Pick<ScoreAd, "meta_ad_id">): ScoreAd {
  return {
    name: partial.meta_ad_id,
    spend: 0,
    attributed_leads: 0,
    attributed_calls: 0,
    attributed_showed: 0,
    attributed_funded: 0,
    ...partial,
  };
}

describe("rankAds", () => {
  it("ranks by cost per booked call, then cost per show", () => {
    const ranked = rankAds([
      ad({ meta_ad_id: "a", name: "A", spend: 100, attributed_calls: 2, attributed_showed: 1, attributed_leads: 10 }),
      ad({ meta_ad_id: "b", name: "B", spend: 100, attributed_calls: 4, attributed_showed: 2, attributed_leads: 5, attributed_funded: 1 }),
      ad({ meta_ad_id: "c", name: "C", spend: 100, attributed_calls: 2, attributed_showed: 2, attributed_leads: 5 }),
      ad({ meta_ad_id: "d", name: "D", spend: 80, attributed_calls: 0, attributed_showed: 0, attributed_leads: 1 }),
      ad({ meta_ad_id: "e", name: "E", spend: 0, attributed_calls: 1, attributed_showed: 1 }),
    ]);

    expect(ranked.map((row) => row.meta_ad_id)).toEqual(["b", "c", "a", "d"]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked[0]).toMatchObject({
      cost_per_booked_call: 25,
      cost_per_show: 50,
      booked_calls: 4,
      shows: 2,
      funded: 1,
    });
    expect(ranked[1].cost_per_booked_call).toBe(50);
    expect(ranked[1].cost_per_show).toBe(50);
    expect(ranked[2].cost_per_show).toBe(100);
    expect(ranked[3].cost_per_booked_call).toBeNull();
    expect(ranked[3].cost_per_show).toBeNull();
  });

  it("accepts numeric spend stored as a string", () => {
    const ranked = rankAds([
      ad({ meta_ad_id: "s", spend: "90.00", attributed_calls: 3, attributed_showed: 1 }),
    ]);
    expect(ranked[0].spend).toBe(90);
    expect(ranked[0].cost_per_booked_call).toBe(30);
    expect(ranked[0].cost_per_show).toBe(90);
  });
});

describe("businessDayRange", () => {
  it("uses the Pacific business day at the 06:00 UTC nightly run", () => {
    const range = businessDayRange(new Date("2026-10-12T06:00:00.000Z"));
    expect(range.day).toBe("2026-10-11");
    expect(range.start).toBe("2026-10-11T07:00:00.000Z");
    expect(range.end).toBe("2026-10-12T06:59:59.999Z");
  });

  it("uses PST after daylight saving time ends", () => {
    const range = businessDayRange(new Date("2026-11-02T14:00:00.000Z"));
    expect(range.day).toBe("2026-11-02");
    expect(range.start).toBe("2026-11-02T08:00:00.000Z");
    expect(range.end).toBe("2026-11-03T07:59:59.999Z");
  });
});
