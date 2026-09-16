import { describe, it, expect } from "vitest";
import {
  authorizeGeneration,
  clampRenderSettings,
  composeRenderPrompt,
  costEstimate,
  createEmptyDraft,
  frameApprovalHash,
  frameApproved,
  generationGate,
  generationIdempotencyKey,
  modelSpec,
  scriptApprovalHash,
  scriptApprovalStale,
  stepStatuses,
  type FrameAsset,
  type MasterVideoApprovals,
  type MasterVideoDraft,
} from "@/lib/masterVideo";

const frame = (over: Partial<FrameAsset> = {}): FrameAsset => ({
  id: "frame-1",
  url: "https://cdn.example.com/frame-1.png",
  version: 1,
  prompt: "Presenter in a sunlit office, looking into the lens",
  imageModel: "openai",
  source: "generated",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

/** A draft that is complete and approved end to end. */
function approvedProject(): { draft: MasterVideoDraft; approvals: MasterVideoApprovals } {
  const draft: MasterVideoDraft = {
    ...createEmptyDraft(),
    offerId: "offer-1",
    offerSnapshot: { id: "offer-1", name: "Fund III", audience: "accredited", terms: "targeted returns", proof: "", sources: [] },
    cta: "Book a call",
    styleId: "lakeside",
    styleLabel: "Lakeside",
    presenter: "avatar",
    avatarId: "avatar-1",
    avatarName: "Dana",
    avatarImageUrl: "https://cdn.example.com/dana.png",
    avatarDescription: "Credible advisor in her 40s",
    frames: [frame()],
    selectedFrameId: "frame-1",
    script: "Most investors never see this. Here is how the fund works. Book a call.",
    videoPrompt: "Handheld medium shot, slow push in, room tone.",
  };
  const approvals: MasterVideoApprovals = {
    frame: { hash: frameApprovalHash(draft), at: "2026-01-01T00:00:00.000Z", by: "user-1" },
    script: { hash: scriptApprovalHash(draft), at: "2026-01-01T00:00:00.000Z", by: "user-1" },
  };
  return { draft, approvals };
}

describe("master video defaults and model capabilities", () => {
  it("defaults to vertical, ~30s, and the top resolution Wan genuinely serves", () => {
    const d = createEmptyDraft();
    expect(d.model).toBe("alibaba/wan-3.0");
    expect(d.aspectRatio).toBe("9:16");
    expect(d.durationSeconds).toBe(30);
    expect(d.resolution).toBe("1080p");
  });

  it("never offers a 2K tier for Wan, because Wan does not serve one", () => {
    expect(modelSpec("alibaba/wan-3.0").resolutions).toEqual(["480p", "720p", "1080p"]);
    expect(modelSpec("alibaba/wan-3.0").resolutions).not.toContain("2k");
  });

  it("clamps settings onto what the chosen model supports", () => {
    const d = clampRenderSettings({ ...createEmptyDraft(), model: "bytedance/seedance-2.0", resolution: "1080p", durationSeconds: 30 });
    expect(d.resolution).toBe("720p");
    expect(d.durationSeconds).toBe(15);
  });

  it("estimates cost from the model's per-second list price", () => {
    const c = costEstimate({ ...createEmptyDraft(), model: "alibaba/wan-3.0", durationSeconds: 30 });
    expect(c.known).toBe(true);
    expect(c.usd).toBeCloseTo(1.02, 2);
  });
});

describe("approval invalidation after upstream edits", () => {
  it("approves cleanly when nothing changed", () => {
    const { draft, approvals } = approvedProject();
    expect(frameApproved(draft, approvals)).toBe(true);
    expect(generationGate(draft, approvals).ok).toBe(true);
  });

  it("invalidates the frame approval when the presenter changes", () => {
    const { draft, approvals } = approvedProject();
    const edited = { ...draft, avatarId: "avatar-2", avatarImageUrl: "https://cdn.example.com/other.png" };
    expect(frameApproved(edited, approvals)).toBe(false);
    expect(generationGate(edited, approvals).ok).toBe(false);
  });

  it("invalidates the frame approval when a different frame version is picked", () => {
    const { draft, approvals } = approvedProject();
    const edited = { ...draft, frames: [...draft.frames, frame({ id: "frame-2", version: 2 })], selectedFrameId: "frame-2" };
    expect(frameApproved(edited, approvals)).toBe(false);
  });

  it("invalidates the script approval when the spoken words change", () => {
    const { draft, approvals } = approvedProject();
    const edited = { ...draft, script: draft.script + " Limited spots." };
    expect(scriptApprovalStale(edited, approvals)).toBe(true);
    expect(generationGate(edited, approvals).ok).toBe(false);
  });

  it("invalidates the script approval when paid render settings change", () => {
    const { draft, approvals } = approvedProject();
    for (const edit of [{ durationSeconds: 10 }, { resolution: "720p" }, { model: "bytedance/seedance-2.5" }, { aspectRatio: "16:9" as const }]) {
      expect(scriptApprovalStale({ ...draft, ...edit }, approvals)).toBe(true);
    }
  });

  it("ignores pure whitespace reformatting so approvals are not lost needlessly", () => {
    const { draft, approvals } = approvedProject();
    expect(scriptApprovalStale({ ...draft, script: `  ${draft.script}\n` }, approvals)).toBe(false);
  });
});

describe("step readiness", () => {
  it("blocks every step with an actionable reason on an empty draft", () => {
    const statuses = stepStatuses(createEmptyDraft(), {});
    expect(statuses.every((s) => !s.complete)).toBe(true);
    for (const s of statuses) expect(s.reason).toBeTruthy();
  });

  it("treats 'no presenter' as a complete presenter step", () => {
    const d = { ...createEmptyDraft(), presenter: "none" as const };
    expect(stepStatuses(d, {}).find((s) => s.key === "avatar")!.complete).toBe(true);
  });

  it("does not mark a later step done just because it comes later", () => {
    const { draft } = approvedProject();
    const statuses = stepStatuses({ ...draft, script: "" }, {});
    expect(statuses.find((s) => s.key === "generate")!.complete).toBe(false);
  });
});

describe("render prompt", () => {
  it("carries the exact approved dialogue and forbids extra speech and on-screen text", () => {
    const { draft } = approvedProject();
    const prompt = composeRenderPrompt(draft);
    expect(prompt).toContain(draft.script);
    expect(prompt).toContain("Do not add any other speech");
    expect(prompt).toMatch(/no captions/i);
    expect(prompt).toMatch(/no logos/i);
  });

  it("never leaks the visual-only disclosure into the spoken words", () => {
    const { draft } = approvedProject();
    const prompt = composeRenderPrompt({ ...draft, disclosure: "Returns are not guaranteed" });
    expect(prompt).not.toContain("Returns are not guaranteed");
  });
});

describe("server side generation authority", () => {
  it("refuses when the stored approvals are missing", () => {
    const { draft } = approvedProject();
    const res = authorizeGeneration("p1", draft, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it("refuses when the stored content changed after approval", () => {
    const { draft, approvals } = approvedProject();
    const res = authorizeGeneration("p1", { ...draft, script: "different words" }, approvals);
    expect(res.ok).toBe(false);
  });

  it("refuses when the browser echoes a stale hash", () => {
    const { draft, approvals } = approvedProject();
    const res = authorizeGeneration("p1", draft, approvals, "deadbeefdeadbeef");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reload/i);
  });

  it("refuses a frame that is only a temporary browser preview", () => {
    const draftWithBlob = { ...approvedProject().draft, frames: [frame({ url: "blob:http://localhost/abc" })] };
    const approvals: MasterVideoApprovals = {
      frame: { hash: frameApprovalHash(draftWithBlob), at: "", by: null },
      script: { hash: scriptApprovalHash(draftWithBlob), at: "", by: null },
    };
    const res = authorizeGeneration("p1", draftWithBlob, approvals);
    expect(res.ok).toBe(false);
  });

  it("passes the exact approved frame and script through to the provider", () => {
    const { draft, approvals } = approvedProject();
    const res = authorizeGeneration("p1", draft, approvals, scriptApprovalHash(draft));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.frameUrl).toBe("https://cdn.example.com/frame-1.png");
      expect(res.prompt).toContain(draft.script);
    }
  });

  it("gives the same idempotency key for the same approved version and a different one after an edit", () => {
    const { draft, approvals } = approvedProject();
    const a = authorizeGeneration("p1", draft, approvals);
    const b = authorizeGeneration("p1", draft, approvals);
    expect(a.ok && b.ok && a.idempotencyKey === b.idempotencyKey).toBe(true);
    expect(generationIdempotencyKey("p1", draft)).toBe(generationIdempotencyKey("p1", draft));
    expect(generationIdempotencyKey("p1", draft)).not.toBe(generationIdempotencyKey("p2", draft));
    const edited = { ...draft, durationSeconds: 10 };
    expect(generationIdempotencyKey("p1", edited)).not.toBe(generationIdempotencyKey("p1", draft));
  });

  it("refuses a resolution or duration the chosen model does not serve", () => {
    const { draft } = approvedProject();
    const bad = { ...draft, model: "bytedance/seedance-2.0", resolution: "1080p", durationSeconds: 30 };
    const approvals: MasterVideoApprovals = {
      frame: { hash: frameApprovalHash(bad), at: "", by: null },
      script: { hash: scriptApprovalHash(bad), at: "", by: null },
    };
    const res = authorizeGeneration("p1", bad, approvals);
    expect(res.ok).toBe(false);
  });
});
