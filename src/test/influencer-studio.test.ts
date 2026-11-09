import { describe, expect, it } from "vitest";
import {
  buildRenderInput,
  clipProblem,
  isScriptLockValid,
  renderBlockers,
  renderDuration,
  scriptLockHash,
  stageStates,
  wordBudget,
  type StudioCharacter,
  type StudioProject,
} from "@/lib/influencerStudio";
import { buildExactVideoRequest } from "../../supabase/functions/_shared/exactModel";

const SCRIPT = "I almost skipped this. Then I saw how the fund actually works.";

const character: StudioCharacter = {
  id: "c1",
  name: "Sarah",
  portrait_url: "https://x.test/portrait.png",
  sheet_url: "https://x.test/sheet.png",
};

const ready = (over: Partial<StudioProject> = {}): StudioProject => ({
  clip_url: "https://x.test/clip.mp4",
  clip_start_s: 0,
  clip_end_s: 10,
  pacing: {},
  character_id: "c1",
  script: SCRIPT,
  script_locked: true,
  script_lock_hash: scriptLockHash(SCRIPT),
  render_mode: "motion_swap",
  status: "draft",
  ...over,
});

const opts = { model: "bytedance/seedance-2.0", resolution: "720p", aspectRatio: "9:16" };

describe("reference clip", () => {
  it("accepts 2–15 second clips only", () => {
    expect(clipProblem(0, 10)).toBeNull();
    expect(clipProblem(0, 1.5)).toMatch(/at least 2s/);
    expect(clipProblem(3, 19)).toMatch(/at most 15s/);
  });
  it("budgets spoken words from the clip length and pace", () => {
    expect(wordBudget(10)).toBe(26); // 160 wpm default
    expect(wordBudget(10, 120)).toBe(20);
  });
});

describe("word-for-word lock", () => {
  it("is valid only while the words match what was locked", () => {
    expect(isScriptLockValid(ready())).toBe(true);
    expect(isScriptLockValid(ready({ script: SCRIPT + " Today." }))).toBe(false);
    expect(isScriptLockValid(ready({ script_locked: false }))).toBe(false);
  });
  it("ignores whitespace-only differences", () => {
    expect(scriptLockHash("a  b\n c")).toBe(scriptLockHash("a b c"));
  });
});

describe("render gate", () => {
  it("is clear when every stage is done", () => {
    expect(renderBlockers(ready(), character, opts)).toEqual([]);
  });
  it("blocks an unlocked script", () => {
    expect(renderBlockers(ready({ script_locked: false }), character, opts).join(" ")).toMatch(/Lock the script/);
  });
  it("blocks motion swap without a cut clip or turnaround sheet", () => {
    expect(renderBlockers(ready({ clip_url: null }), character, opts).join(" ")).toMatch(/Cut the reference clip/);
    expect(renderBlockers(ready(), { ...character, sheet_url: null }, opts).join(" ")).toMatch(/turnaround/);
  });
  it("refuses Wan 3.0 for motion swap but allows it character-only", () => {
    const wan = { ...opts, model: "alibaba/wan-3.0" };
    expect(renderBlockers(ready(), character, wan).join(" ")).toMatch(/cannot copy motion/);
    expect(renderBlockers(ready({ render_mode: "character_only", clip_url: null }), { ...character, sheet_url: null }, wan)).toEqual([]);
  });
  it("blocks a script longer than the clip can hold", () => {
    const long = Array.from({ length: 60 }, () => "word").join(" ");
    const p = ready({ script: long, script_lock_hash: scriptLockHash(long) });
    expect(stageStates(p, character).find((s) => s.key === "script")!.done).toBe(false);
  });
  it("blocks a second render while one is running", () => {
    expect(renderBlockers(ready({ status: "rendering" }), character, opts).join(" ")).toMatch(/already in progress/);
  });
});

describe("provider request", () => {
  it("motion swap sends the clip as a video reference plus the character images, no frames", () => {
    const body = buildExactVideoRequest(buildRenderInput(ready(), character, opts));
    expect(body.model).toBe("bytedance/seedance-2.0");
    expect(body.frame_images).toBeUndefined();
    expect(body.input_references).toEqual([
      { type: "video_url", video_url: { url: "https://x.test/clip.mp4" } },
      { type: "image_url", image_url: { url: "https://x.test/sheet.png" } },
      { type: "image_url", image_url: { url: "https://x.test/portrait.png" } },
    ]);
    expect(body.duration).toBe(10);
    expect(String(body.prompt)).toContain(`"${SCRIPT}"`);
  });
  it("character-only starts from the portrait as first frame", () => {
    const body = buildExactVideoRequest(
      buildRenderInput(ready({ render_mode: "character_only" }), character, { ...opts, model: "alibaba/wan-3.0" }),
    );
    expect(body.input_references).toBeUndefined();
    expect(body.frame_images).toEqual([
      { type: "image_url", image_url: { url: "https://x.test/portrait.png" }, frame_type: "first_frame" },
    ]);
  });
  it("rounds clip length up to a duration the model serves", () => {
    expect(renderDuration("bytedance/seedance-2.0", 7.4)).toBe(10);
    expect(renderDuration("bytedance/seedance-2.0", 14)).toBe(15);
  });
  it("refuses frames and references together", () => {
    expect(() =>
      buildExactVideoRequest({
        exactModel: "m", prompt: "p", firstFrameUrl: "https://a", inputReferences: [{ kind: "video", url: "https://b" }],
      }),
    ).toThrow();
  });
});
