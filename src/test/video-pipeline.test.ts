import { describe, it, expect } from "vitest";
import {
  createEmptyDraft,
  suggestDurationForScript,
  costEstimate,
  modelSpec,
  type MasterVideoDraft,
} from "@/lib/masterVideo";

describe("video pipeline render defaults", () => {
  it("defaults to 720p on models that serve it", () => {
    const draft = createEmptyDraft();
    expect(draft.resolution).toBe("720p");
    expect(draft.model).toBe("alibaba/wan-3.0");
  });

  it("keeps 1080p available as an explicit upgrade on Wan 3.0", () => {
    const spec = modelSpec("alibaba/wan-3.0");
    expect(spec.resolutions).toContain("720p");
    expect(spec.resolutions).toContain("1080p");
  });
});

describe("suggestDurationForScript", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

  it("returns the smallest served duration that fits the read time", () => {
    // 40 words at 150wpm ≈ 16s → 20s slot
    expect(suggestDurationForScript(words(40), "alibaba/wan-3.0")).toBe(20);
  });

  it("aims at the 30s ad ceiling when no script exists yet", () => {
    expect(suggestDurationForScript("", "alibaba/wan-3.0")).toBe(30);
    expect(suggestDurationForScript("", "minimax/hailuo-3")).toBe(15);
  });

  it("caps at 30 seconds even when the script reads longer", () => {
    // 150 words ≈ 60s — ads never render past 30s
    expect(suggestDurationForScript(words(150), "alibaba/wan-3.0")).toBe(30);
    expect(suggestDurationForScript(words(150), "bytedance/seedance-2.5")).toBe(30);
  });

  it("never exceeds the model's own maximum", () => {
    // MiniMax H3 serves at most 15s
    expect(suggestDurationForScript(words(150), "minimax/hailuo-3")).toBe(15);
  });
});

describe("costEstimate", () => {
  const draftWith = (over: Partial<MasterVideoDraft>) =>
    ({ ...createEmptyDraft(), ...over }) as MasterVideoDraft;

  it("prices 720p Wan 3.0 at the 720p per-second rate", () => {
    const est = costEstimate(draftWith({ resolution: "720p", durationSeconds: 20 }));
    expect(est.known).toBe(true);
    expect(est.usd).toBeCloseTo(20 * 0.1, 2);
  });

  it("prices 1080p higher than 720p for the same duration", () => {
    const hd = costEstimate(draftWith({ resolution: "1080p", durationSeconds: 20 }));
    const sd = costEstimate(draftWith({ resolution: "720p", durationSeconds: 20 }));
    expect(hd.usd!).toBeGreaterThan(sd.usd!);
  });

  it("is honestly unknown for token-billed models like Seedance 2.5", () => {
    const est = costEstimate(draftWith({ model: "bytedance/seedance-2.5", resolution: "720p", durationSeconds: 20 }));
    expect(est.known).toBe(false);
    expect(est.usd).toBeNull();
  });
});
