/**
 * Master AI Video — the single shared contract.
 *
 * This module is deliberately pure TypeScript (no Deno, no browser, no imports)
 * because BOTH sides depend on it:
 *
 *  - the browser workflow (`src/lib/masterVideo.ts` re-exports it) to compute
 *    readiness, approval hashes and the video prompt it shows the operator;
 *  - the `master-video-generate` edge function, which re-computes the SAME
 *    hashes server-side before it is willing to spend money on a render.
 *
 * One implementation means a disabled button in the UI and the server's refusal
 * can never disagree. Every rule that guards spend lives here.
 */

export type PresenterMode = "avatar" | "none";
export type AspectRatio = "9:16" | "16:9";

export type FrameAsset = {
  id: string;
  url: string;
  version: number;
  prompt: string;
  imageModel: string | null;
  source: "generated" | "uploaded";
  createdAt: string;
};

export type OfferSnapshot = {
  id: string;
  name: string;
  audience: string;
  terms: string;
  proof: string;
  sources: string[];
};

export type MasterVideoDraft = {
  /* 1. Offer */
  offerId: string | null;
  offerSnapshot: OfferSnapshot | null;
  brief: string;
  claims: string;
  cta: string;
  sourceNotes: string;

  /* 2. Style */
  styleId: string | null;
  styleLabel: string | null;
  styleReferenceUrl: string | null;
  styleDirections: string;

  /* 3. Avatar */
  presenter: PresenterMode;
  avatarId: string | null;
  avatarName: string | null;
  avatarImageUrl: string | null;
  avatarDescription: string;
  wardrobe: string;
  location: string;
  motion: string;

  /* 4. First frame */
  frames: FrameAsset[];
  selectedFrameId: string | null;
  /** In-progress frame prompt/model — saved so a reload does not lose the edit. */
  framePrompt: string;
  framePromptTouched: boolean;
  frameImageModel: string | null;

  /* 5. Script + video prompt */
  script: string;
  videoPrompt: string;
  disclosure: string;
  /** Real version history for the words, kept the way frames are kept. */
  scriptVersions: ScriptVersion[];

  /* 6. Render settings */
  model: string;
  resolution: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  audio: boolean;
};

export type ScriptVersion = {
  id: string;
  version: number;
  script: string;
  videoPrompt: string;
  disclosure: string;
  createdAt: string;
  note: string;
};

export type ApprovalRecord = { hash: string; at: string; by: string | null };
export type MasterVideoApprovals = { frame?: ApprovalRecord; script?: ApprovalRecord };

export type MasterVideoModelSpec = {
  value: string;
  label: string;
  hint: string;
  resolutions: string[];
  durations: number[];
  aspectRatios: AspectRatio[];
  /**
   * OpenRouter per-second list price keyed by the resolution actually chosen.
   * Models billed by video tokens (the Seedance family) have no per-second list
   * price, so they carry an empty map and the estimate is honestly "unknown"
   * rather than a made-up number.
   */
  pricePerSecondByResolution: Record<string, number>;
  supportsFirstFrame: boolean;
};

/**
 * Mirrors the live OpenRouter `/v1/videos/models` record for each model
 * (resolutions, durations, aspect ratios, frame support and pricing SKUs),
 * verified 2026-09-16. Wan 3.0 serves 480p/720p/1080p and 2–30s — there is no
 * 2K tier, so it is never offered or labelled as one. MiniMax H3 serves 2K
 * only. Prices are per generated second per resolution, which is why a 30s
 * 1080p Wan clip estimates around $6.00 rather than a single blended rate.
 */
export const MASTER_VIDEO_MODELS: MasterVideoModelSpec[] = [
  {
    value: "alibaba/wan-3.0",
    label: "Wan 3.0",
    hint: "480p / 720p / 1080p · 2–30s in one clip · first frame · native audio",
    resolutions: ["480p", "720p", "1080p"],
    durations: [5, 10, 15, 20, 25, 30],
    aspectRatios: ["9:16", "16:9"],
    pricePerSecondByResolution: { "480p": 0.05, "720p": 0.1, "1080p": 0.2 },
    supportsFirstFrame: true,
  },
  {
    value: "bytedance/seedance-2.5",
    label: "Seedance 2.5",
    hint: "480p / 720p · 4–30s in one clip · first/last frame",
    resolutions: ["480p", "720p"],
    durations: [5, 10, 15, 20, 25, 30],
    aspectRatios: ["9:16", "16:9"],
    // Billed per video token, not per second — no honest per-second estimate.
    pricePerSecondByResolution: {},
    supportsFirstFrame: true,
  },
  {
    value: "bytedance/seedance-2.0",
    label: "Seedance",
    hint: "480p / 720p / 1080p · up to 15s · first/last frame + references",
    resolutions: ["480p", "720p", "1080p"],
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "16:9"],
    pricePerSecondByResolution: {},
    supportsFirstFrame: true,
  },
  {
    value: "minimax/hailuo-3",
    label: "MiniMax H3",
    hint: "native 2K only · up to 15s · first/last frame + reference identity",
    resolutions: ["2K"],
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "16:9"],
    pricePerSecondByResolution: { "2K": 0.13 },
    supportsFirstFrame: true,
  },
];

export const DEFAULT_MASTER_VIDEO_MODEL = "alibaba/wan-3.0";

export function modelSpec(model: string | null | undefined): MasterVideoModelSpec {
  return (
    MASTER_VIDEO_MODELS.find((m) => m.value === model) ||
    MASTER_VIDEO_MODELS.find((m) => m.value === DEFAULT_MASTER_VIDEO_MODEL)!
  );
}

export function createEmptyDraft(): MasterVideoDraft {
  const spec = modelSpec(DEFAULT_MASTER_VIDEO_MODEL);
  return {
    offerId: null,
    offerSnapshot: null,
    brief: "",
    claims: "",
    cta: "",
    sourceNotes: "",
    styleId: null,
    styleLabel: null,
    styleReferenceUrl: null,
    styleDirections: "",
    presenter: "avatar",
    avatarId: null,
    avatarName: null,
    avatarImageUrl: null,
    avatarDescription: "",
    wardrobe: "",
    location: "",
    motion: "",
    frames: [],
    selectedFrameId: null,
    framePrompt: "",
    framePromptTouched: false,
    frameImageModel: null,
    script: "",
    videoPrompt: "",
    disclosure: "",
    scriptVersions: [],
    model: DEFAULT_MASTER_VIDEO_MODEL,
    // Defaults: vertical, the highest resolution this model genuinely serves, ~30s.
    resolution: spec.resolutions[spec.resolutions.length - 1],
    aspectRatio: "9:16",
    durationSeconds: 30,
    audio: true,
  };
}

/** Coerces render settings onto values the selected model actually serves. */
export function clampRenderSettings(draft: MasterVideoDraft): MasterVideoDraft {
  const spec = modelSpec(draft.model);
  const resolution = spec.resolutions.includes(draft.resolution)
    ? draft.resolution
    : spec.resolutions[spec.resolutions.length - 1];
  const durations = spec.durations;
  const wanted = Number(draft.durationSeconds) || durations[durations.length - 1];
  const durationSeconds = durations.includes(wanted)
    ? wanted
    : durations.reduce((best, d) => (Math.abs(d - wanted) < Math.abs(best - wanted) ? d : best), durations[0]);
  return { ...draft, model: spec.value, resolution, durationSeconds };
}

export function selectedFrame(draft: MasterVideoDraft): FrameAsset | null {
  if (!draft.selectedFrameId) return null;
  return draft.frames.find((f) => f.id === draft.selectedFrameId) || null;
}

/* ---------------------------------------------------------------- hashing --- */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** FNV-1a, 64 bits as two 32-bit halves. Content addressing, not security. */
export function contentHash(value: unknown): string {
  const input = stableStringify(value);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = (a ^ c) >>> 0;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (b + Math.imul(c + i + 1, 0x85ebca6b)) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Everything the chosen opening frame depends on. Changing the avatar, the
 * style, the aspect ratio or picking a different frame version invalidates the
 * frame approval — and therefore the script approval that is built on it.
 */
export function frameApprovalHash(draft: MasterVideoDraft): string {
  const frame = selectedFrame(draft);
  return contentHash({
    frameId: frame?.id ?? null,
    frameUrl: frame?.url ?? null,
    frameVersion: frame?.version ?? null,
    framePrompt: norm(frame?.prompt),
    presenter: draft.presenter,
    avatarId: draft.avatarId,
    avatarImageUrl: draft.avatarImageUrl,
    avatarDescription: norm(draft.avatarDescription),
    styleId: draft.styleId,
    styleReferenceUrl: draft.styleReferenceUrl,
    styleDirections: norm(draft.styleDirections),
    aspectRatio: draft.aspectRatio,
    // The frame shows the person, the clothes, the place and the movement, so
    // editing any of those has to invalidate the approved frame.
    wardrobe: norm(draft.wardrobe),
    location: norm(draft.location),
    motion: norm(draft.motion),
    // The offer that is being sold shapes the frame brief too.
    offerId: draft.offerId,
    offerSnapshot: draft.offerSnapshot
      ? {
          id: draft.offerSnapshot.id,
          name: norm(draft.offerSnapshot.name),
          audience: norm(draft.offerSnapshot.audience),
          terms: norm(draft.offerSnapshot.terms),
          proof: norm(draft.offerSnapshot.proof),
          sources: (draft.offerSnapshot.sources || []).map(norm),
        }
      : null,
    brief: norm(draft.brief),
  });
}

/**
 * The render contract: the exact frame, the exact spoken words, the exact
 * directions and the exact paid render settings. Any edit upstream changes this
 * hash, which is what makes a stale approval detectable instead of silent.
 */
export function scriptApprovalHash(draft: MasterVideoDraft): string {
  return contentHash({
    frame: frameApprovalHash(draft),
    script: norm(draft.script),
    videoPrompt: norm(draft.videoPrompt),
    disclosure: norm(draft.disclosure),
    cta: norm(draft.cta),
    claims: norm(draft.claims),
    offerId: draft.offerId,
    brief: norm(draft.brief),
    sourceNotes: norm(draft.sourceNotes),
    styleId: draft.styleId,
    styleDirections: norm(draft.styleDirections),
    presenter: draft.presenter,
    avatarId: draft.avatarId,
    model: draft.model,
    resolution: draft.resolution,
    aspectRatio: draft.aspectRatio,
    durationSeconds: draft.durationSeconds,
    audio: draft.audio,
  });
}

/* ----------------------------------------------------- stored draft repair --- */

/**
 * Rows written before a field existed, or hand-edited JSON, must never crash the
 * screen or quietly change a hash. Every field falls back to the empty default.
 */
export function normalizeStoredDraft(raw: unknown): MasterVideoDraft {
  const base = createEmptyDraft();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Record<string, unknown>;
  const str = (k: keyof MasterVideoDraft) => (typeof d[k] === "string" ? (d[k] as string) : (base[k] as string));
  const out: MasterVideoDraft = {
    ...base,
    ...(d as Partial<MasterVideoDraft>),
    brief: str("brief"),
    claims: str("claims"),
    cta: str("cta"),
    sourceNotes: str("sourceNotes"),
    styleDirections: str("styleDirections"),
    avatarDescription: str("avatarDescription"),
    wardrobe: str("wardrobe"),
    location: str("location"),
    motion: str("motion"),
    framePrompt: str("framePrompt"),
    framePromptTouched: d.framePromptTouched === true,
    frameImageModel: typeof d.frameImageModel === "string" ? d.frameImageModel : null,
    script: str("script"),
    videoPrompt: str("videoPrompt"),
    disclosure: str("disclosure"),
    frames: Array.isArray(d.frames) ? (d.frames as FrameAsset[]) : [],
    scriptVersions: Array.isArray(d.scriptVersions) ? (d.scriptVersions as ScriptVersion[]) : [],
    audio: d.audio !== false,
  };
  return clampRenderSettings(out);
}

/** Appends the current words to history without ever dropping an older take. */
export function pushScriptVersion(draft: MasterVideoDraft, note: string): MasterVideoDraft {
  const last = draft.scriptVersions[draft.scriptVersions.length - 1];
  if (
    last &&
    norm(last.script) === norm(draft.script) &&
    norm(last.videoPrompt) === norm(draft.videoPrompt) &&
    norm(last.disclosure) === norm(draft.disclosure)
  ) {
    return draft;
  }
  if (!norm(draft.script) && !norm(draft.videoPrompt)) return draft;
  const version = (last?.version ?? 0) + 1;
  return {
    ...draft,
    scriptVersions: [
      ...draft.scriptVersions,
      {
        id: `sv-${version}-${contentHash({ s: draft.script, p: draft.videoPrompt, d: draft.disclosure })}`,
        version,
        script: draft.script,
        videoPrompt: draft.videoPrompt,
        disclosure: draft.disclosure,
        createdAt: new Date().toISOString(),
        note,
      },
    ],
  };
}

export function frameApproved(draft: MasterVideoDraft, approvals: MasterVideoApprovals): boolean {
  return !!approvals.frame && approvals.frame.hash === frameApprovalHash(draft);
}

export function scriptApproved(draft: MasterVideoDraft, approvals: MasterVideoApprovals): boolean {
  return !!approvals.script && approvals.script.hash === scriptApprovalHash(draft);
}

/** True when an approval exists but no longer matches the current content. */
export function frameApprovalStale(draft: MasterVideoDraft, approvals: MasterVideoApprovals): boolean {
  return !!approvals.frame && approvals.frame.hash !== frameApprovalHash(draft);
}

export function scriptApprovalStale(draft: MasterVideoDraft, approvals: MasterVideoApprovals): boolean {
  return !!approvals.script && approvals.script.hash !== scriptApprovalHash(draft);
}

/* -------------------------------------------------------------- readiness --- */

export type StepKey = "offer" | "style" | "avatar" | "frame" | "script" | "generate";

export const MASTER_VIDEO_STEPS: Array<{ key: StepKey; label: string; blurb: string }> = [
  { key: "offer", label: "Offer", blurb: "What we're selling and the one call to action" },
  { key: "style", label: "Style", blurb: "Look and feel of the ad" },
  { key: "avatar", label: "Presenter", blurb: "Who is on camera, or nobody" },
  { key: "frame", label: "First frame", blurb: "Approve the exact opening image" },
  { key: "script", label: "Script & directions", blurb: "Exact words plus camera and audio" },
  { key: "generate", label: "Generate", blurb: "Review everything, then make the video" },
];

export type StepStatus = { key: StepKey; complete: boolean; reason: string | null };

export function stepStatuses(draft: MasterVideoDraft, approvals: MasterVideoApprovals): StepStatus[] {
  const frame = selectedFrame(draft);
  const out: StepStatus[] = [];

  out.push({
    key: "offer",
    complete: !!draft.offerId && norm(draft.cta).length > 0,
    reason: !draft.offerId ? "Pick the offer this ad sells" : norm(draft.cta) ? null : "Add one call to action",
  });

  out.push({
    key: "style",
    complete: !!draft.styleId || !!draft.styleReferenceUrl,
    reason: !draft.styleId && !draft.styleReferenceUrl ? "Choose a style or upload a reference" : null,
  });

  const avatarOk = draft.presenter === "none" || (!!draft.avatarId && !!draft.avatarImageUrl);
  out.push({
    key: "avatar",
    complete: avatarOk,
    reason: avatarOk ? null : "Pick or upload a presenter, or choose no presenter",
  });

  out.push({
    key: "frame",
    complete: !!frame && frameApproved(draft, approvals),
    reason: !frame
      ? "Create or upload the opening frame"
      : frameApprovalStale(draft, approvals)
        ? "Something changed since you approved this frame — approve it again"
        : frameApproved(draft, approvals)
          ? null
          : "Approve the frame you picked",
  });

  const hasScript = norm(draft.script).length > 0;
  const hasPrompt = norm(draft.videoPrompt).length > 0;
  out.push({
    key: "script",
    complete: hasScript && hasPrompt && scriptApproved(draft, approvals),
    reason: !hasScript
      ? "Write or draft the spoken script"
      : !hasPrompt
        ? "Add the camera, motion and audio directions"
        : scriptApprovalStale(draft, approvals)
          ? "The script, frame or render settings changed — approve again"
          : scriptApproved(draft, approvals)
            ? null
            : "Approve the script and directions",
  });

  const ready = out.every((s) => s.complete);
  out.push({
    key: "generate",
    complete: ready,
    reason: ready ? null : "Finish and approve the earlier steps first",
  });
  return out;
}

export type GenerationGate = { ok: boolean; reasons: string[] };

/** The one place that decides whether a paid render may be granted. */
export function generationGate(draft: MasterVideoDraft, approvals: MasterVideoApprovals): GenerationGate {
  const reasons: string[] = [];
  for (const s of stepStatuses(draft, approvals)) {
    if (s.key === "generate") continue;
    if (!s.complete && s.reason) reasons.push(s.reason);
  }
  const frame = selectedFrame(draft);
  if (frame && !/^https?:\/\//.test(frame.url)) {
    reasons.push("The opening frame must be a saved image, not a temporary preview");
  }
  const spec = modelSpec(draft.model);
  if (!spec.resolutions.includes(draft.resolution)) {
    reasons.push(`${spec.label} does not serve ${draft.resolution}`);
  }
  if (!spec.durations.includes(draft.durationSeconds)) {
    reasons.push(`${spec.label} does not serve ${draft.durationSeconds}s in one clip`);
  }
  return { ok: reasons.length === 0, reasons };
}

/* --------------------------------------------------- spoken words only ----- */

/** Labels whose text IS spoken. */
const SPOKEN_LABELS =
  /^(vo|v\.o\.|voice[- ]?over|voiceover|narration|narrator|dialogue|dialog|line|script|spoken|presenter|speaker|host|talent|hook|cta|audio)\b\s*:?/i;
/** ALL-CAPS labels that are direction, never spoken (FRAMING:, B-ROLL:, SHOT:). */
const DIRECTION_LABEL = /^[A-Z][A-Z0-9 .\/&'\u2013\u2014-]{1,40}:/;
/** `[0-3s]`, `[00:03]` style markers. */
const TIMECODE = /[[(]\s*\d{1,2}(?::\d{2}|\s*-\s*\d{1,2})?\s*s?\.?\s*[\])]/gi;

/**
 * Pull only the spoken words out of a storyboard. A draft that mixes camera and
 * visual direction with the voiceover would otherwise read as ~370 words when
 * the actual read is ~100, and the suggested clip length would be far too long.
 */
export function extractSpokenScript(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/```[\s\S]*?```/g, " ").replace(/\*\*|__/g, "");
  const kept: string[] = [];
  for (const rawLine of cleaned.split(/\r?\n/)) {
    let line = rawLine.replace(/^\s*(?:[-*#>]+|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    // A line that OPENS with a bracket or timecode marker is a direction beat.
    if (/^[[(]/.test(line)) continue;
    const spoken = line.match(SPOKEN_LABELS);
    if (spoken) {
      line = line.slice(spoken[0].length).trim();
    } else if (DIRECTION_LABEL.test(line)) {
      continue;
    } else if (/^[[(].*[\])]$/.test(line)) {
      continue;
    }
    line = line
      .replace(TIMECODE, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (line) kept.push(line);
  }
  return kept.join(" ").trim();
}

/* ------------------------------------------------------- prompt + summary --- */

export function estimatedReadSeconds(script: string, wordsPerMinute = 150): number {
  return Math.round((scriptWordCount(script) / wordsPerMinute) * 60);
}

/** Spoken words only — direction lines never count towards the read length. */
export function scriptWordCount(script: string): number {
  return norm(extractSpokenScript(script)).split(/\s+/).filter((w) => /[a-z0-9']/i.test(w)).length;
}

/**
 * Builds the directions half of the render prompt. The exact approved dialogue
 * is appended verbatim and everything else is forbidden, so the provider cannot
 * invent extra speech, subtitles, titles, logos or disclaimer text.
 */
export function buildVideoPrompt(draft: MasterVideoDraft): string {
  const parts: string[] = [];
  if (norm(draft.styleDirections)) parts.push(norm(draft.styleDirections));
  if (draft.presenter === "avatar" && norm(draft.avatarDescription)) {
    parts.push(`Presenter: ${norm(draft.avatarDescription)}. Keep this person's face, hair and identity unchanged.`);
  }
  if (norm(draft.wardrobe)) parts.push(`Wardrobe: ${norm(draft.wardrobe)}.`);
  if (norm(draft.location)) parts.push(`Location: ${norm(draft.location)}.`);
  if (norm(draft.motion)) parts.push(`Camera and motion: ${norm(draft.motion)}.`);
  parts.push("Single continuous shot, no scene cuts.");
  if (draft.presenter === "avatar") {
    parts.push("The presenter speaks straight to camera, holding natural eye contact.");
  }
  return parts.join(" ");
}

/** The full wire prompt: directions, then the exact words, then prohibitions. */
export function composeRenderPrompt(draft: MasterVideoDraft): string {
  const directions = norm(draft.videoPrompt) || buildVideoPrompt(draft);
  const spoken = norm(draft.script);
  const lines = [directions];
  if (spoken) {
    lines.push(
      draft.presenter === "avatar"
        ? `The presenter says exactly this and nothing else: ${spoken}`
        : `Voiceover, exactly this and nothing else: ${spoken}`,
    );
  }
  lines.push(
    "Do not add any other speech, dialogue or narration. No subtitles, no captions, no on-screen text, no titles, no logos, no watermarks, no disclaimer text.",
  );
  return lines.join("\n\n");
}

export type CostEstimate = { known: boolean; usd: number | null; note: string };

/**
 * Price the exact resolution the operator picked. A model billed by video
 * tokens has no per-second list price, so the estimate says so instead of
 * inventing a blended rate that understates the real charge.
 */
export function costEstimate(draft: MasterVideoDraft): CostEstimate {
  const spec = modelSpec(draft.model);
  const perSecond = spec.pricePerSecondByResolution[draft.resolution];
  if (!perSecond) {
    return {
      known: false,
      usd: null,
      note: `${spec.label} at ${draft.resolution} is not billed at a published per-second rate — the cost is unknown until the render is billed.`,
    };
  }
  return {
    known: true,
    usd: Math.round(perSecond * draft.durationSeconds * 100) / 100,
    note: `List price estimate: ${draft.durationSeconds}s × $${perSecond.toFixed(2)}/s at ${draft.resolution} on ${spec.label}. Actual provider billing may differ.`,
  };
}

export type ReviewSummary = Array<{ label: string; value: string }>;

export function reviewSummary(
  draft: MasterVideoDraft,
  extras: { clientName?: string | null; offerName?: string | null } = {},
): ReviewSummary {
  const spec = modelSpec(draft.model);
  const frame = selectedFrame(draft);
  const cost = costEstimate(draft);
  return [
    { label: "Client", value: extras.clientName || "Not set" },
    { label: "Offer", value: extras.offerName || draft.offerSnapshot?.name || "Not set" },
    { label: "Style", value: draft.styleLabel || (draft.styleReferenceUrl ? "Uploaded reference" : "Not set") },
    {
      label: "Presenter",
      value: draft.presenter === "none" ? "No presenter" : draft.avatarName || "Selected presenter",
    },
    { label: "First frame", value: frame ? `v${frame.version} (${frame.source})` : "Not set" },
    { label: "Spoken script", value: `${scriptWordCount(draft.script)} words · about ${estimatedReadSeconds(draft.script)}s to read` },
    { label: "Call to action", value: norm(draft.cta) || "Not set" },
    {
      label: "Render",
      value: `${spec.label} · ${draft.aspectRatio} · ${draft.resolution} · ${draft.durationSeconds}s · audio ${draft.audio ? "on" : "off"}`,
    },
    { label: "Clips", value: "1 render per Generate click" },
    { label: "Estimated cost", value: cost.known ? `about $${cost.usd?.toFixed(2)}` : "Unknown" },
  ];
}

/**
 * The idempotency key for a paid render. Two clicks on identical approved
 * content produce the same key, and the unique index on the render ledger turns
 * the second one into a no-op instead of a second charge.
 */
export function generationIdempotencyKey(projectId: string, draft: MasterVideoDraft): string {
  return `${projectId}:${scriptApprovalHash(draft)}`;
}

/* ------------------------------------------------------ server enforcement --- */

export type ServerGateResult =
  | { ok: true; idempotencyKey: string; prompt: string; frameUrl: string }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Server-side authority. The stored draft and approvals are the truth; the
 * client's echoed hash only has to agree with them. A disabled button is a
 * courtesy — this is the check that actually protects spend.
 */
export function authorizeGeneration(
  projectId: string,
  storedDraft: MasterVideoDraft,
  storedApprovals: MasterVideoApprovals,
  clientEchoedScriptHash?: string | null,
): ServerGateResult {
  const gate = generationGate(storedDraft, storedApprovals);
  if (!gate.ok) {
    return { ok: false, status: 409, error: `This video is not approved to render: ${gate.reasons.join("; ")}` };
  }
  const hash = scriptApprovalHash(storedDraft);
  if (clientEchoedScriptHash && clientEchoedScriptHash !== hash) {
    return {
      ok: false,
      status: 409,
      error: "The saved video changed since this screen was loaded. Reload and approve the current version.",
    };
  }
  const frame = selectedFrame(storedDraft);
  if (!frame || !/^https?:\/\//.test(frame.url)) {
    return { ok: false, status: 400, error: "The approved opening frame is missing a stored image." };
  }
  return {
    ok: true,
    idempotencyKey: `${projectId}:${hash}`,
    prompt: composeRenderPrompt(storedDraft),
    frameUrl: frame.url,
  };
}

/* -------------------------------------------------- provider request body --- */

/** The provider's own prompt ceiling. Over it we refuse rather than trim. */
export const PROVIDER_PROMPT_CHAR_LIMIT = 6000;

export type ProviderBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Builds the exact request sent to OpenRouter. Nothing is silently corrected
 * here: an unknown model, an aspect ratio the model does not serve, a duration
 * or resolution outside its live capability, or a prompt over the provider's
 * character ceiling all stop the request before any money is spent. Trimming an
 * approved prompt would mean rendering words nobody approved.
 */
export function buildProviderBody(
  draft: MasterVideoDraft,
  prompt: string,
  frameUrl: string,
): ProviderBodyResult {
  const spec = MASTER_VIDEO_MODELS.find((m) => m.value === draft.model);
  if (!spec) return { ok: false, error: `This video asks for a renderer we do not support (${draft.model}).` };
  if (!spec.aspectRatios.includes(draft.aspectRatio)) {
    return { ok: false, error: `${spec.label} cannot render ${draft.aspectRatio}. Pick a supported format.` };
  }
  if (!spec.resolutions.includes(draft.resolution)) {
    return { ok: false, error: `${spec.label} cannot render ${draft.resolution}. Pick ${spec.resolutions.join(" or ")}.` };
  }
  if (!spec.durations.includes(draft.durationSeconds)) {
    return {
      ok: false,
      error: `${spec.label} cannot render ${draft.durationSeconds}s. Pick ${spec.durations.join(", ")}s.`,
    };
  }
  if (!spec.supportsFirstFrame) {
    return { ok: false, error: `${spec.label} cannot start from your approved opening frame.` };
  }
  if (!/^https?:\/\//.test(frameUrl)) {
    return { ok: false, error: "The approved opening frame is missing a stored image." };
  }
  if (prompt.length > PROVIDER_PROMPT_CHAR_LIMIT) {
    return {
      ok: false,
      error: `The approved script and directions are ${prompt.length} characters, over the ${PROVIDER_PROMPT_CHAR_LIMIT} the renderer accepts. Shorten them and approve again — nothing was sent.`,
    };
  }
  return {
    ok: true,
    body: {
      model: spec.value,
      prompt,
      aspect_ratio: draft.aspectRatio,
      duration: draft.durationSeconds,
      generate_audio: draft.audio !== false,
      resolution: draft.resolution,
      frame_images: [{ type: "image_url", image_url: { url: frameUrl }, frame_type: "first_frame" }],
    },
  };
}

/* ------------------------------------------------------- submit outcomes --- */

/**
 * `rejected` = the provider answered and refused, so nothing is running and a
 * fresh paid attempt is safe. `unknown` = we never learned the outcome (network
 * drop, timeout, unreadable 2xx), so a render may already be running and paid
 * for; the claim must be kept so no second charge can be authorised until a
 * person confirms.
 */
export type SubmitOutcome = "rejected" | "unknown";

export function classifySubmitFailure(input: {
  responseStatus?: number | null;
  responseBodyReadable?: boolean;
  networkError?: boolean;
  timedOut?: boolean;
}): { outcome: SubmitOutcome; status: string; message: string } {
  const { responseStatus, responseBodyReadable, networkError, timedOut } = input;
  if (networkError || timedOut || !responseStatus) {
    return {
      outcome: "unknown",
      status: "submission_unknown",
      message:
        "We lost contact with the renderer after sending this video, so we cannot tell whether it started. It is being held for review — no new render will be charged until that is settled.",
    };
  }
  if (responseStatus >= 200 && responseStatus < 300 && responseBodyReadable === false) {
    return {
      outcome: "unknown",
      status: "submission_unknown",
      message:
        "The renderer accepted this video but its reply could not be read, so it may already be running. It is being held for review — no new render will be charged until that is settled.",
    };
  }
  return {
    outcome: "rejected",
    status: "failed",
    message: `The renderer refused this video (${responseStatus}). Nothing was charged — you can try again.`,
  };
}

/** Statuses that must never be auto-resubmitted or auto-retried. */
export function isTerminalFailure(status: string | null | undefined): boolean {
  return status === "failed";
}
export function needsReconciliation(status: string | null | undefined): boolean {
  return status === "submission_unknown";
}
