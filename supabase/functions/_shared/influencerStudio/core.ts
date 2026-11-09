/**
 * AI Influencer Studio — the pure contract shared by the browser and the
 * `influencer-studio` edge function.
 *
 * Four stages: Reference clip → Character (raw iPhone portrait + 6-view
 * turnaround) → Script (word-for-word lock) → Render (motion swap or
 * character-only). The UI shows the same readiness the server enforces, so a
 * render can never be submitted from a state the screen called "not ready".
 *
 * No I/O here: everything is deterministic so tests can pin it.
 */
import { modelSpec, estimatedReadSeconds, scriptWordCount } from "../masterVideoContract.ts";

export const CLIP_MIN_S = 2;
/** Reference videos are honoured up to 15s by the Seedance family. */
export const CLIP_MAX_S = 15;
export const CLIP_DEFAULT_S = 10;

export type RenderMode = "motion_swap" | "character_only";

export type SwapModel = {
  value: string;
  label: string;
  /** Modes this model can actually run. */
  modes: RenderMode[];
  note: string;
};

/**
 * Only Seedance 2.0+ honours a VIDEO reference (OpenRouter `input_references`),
 * so only those models can copy motion/pacing from the clip. Wan 3.0 starts
 * from the character portrait as the first frame instead.
 */
export const SWAP_MODELS: SwapModel[] = [
  {
    value: "bytedance/seedance-2.5",
    label: "Seedance 2.5",
    modes: ["motion_swap", "character_only"],
    note: "Copies motion and pacing from the reference clip",
  },
  {
    value: "bytedance/seedance-2.0",
    label: "Seedance 2.0",
    modes: ["motion_swap", "character_only"],
    note: "Copies motion and pacing from the reference clip · up to 15s",
  },
  {
    value: "alibaba/wan-3.0",
    label: "Wan 3.0",
    modes: ["character_only"],
    note: "Starts from the character portrait · cannot copy motion from a video",
  },
];

export function swapModel(value: string | null | undefined): SwapModel | null {
  return SWAP_MODELS.find((m) => m.value === value) ?? null;
}

export function modelsForMode(mode: RenderMode): SwapModel[] {
  return SWAP_MODELS.filter((m) => m.modes.includes(mode));
}

export function defaultModelForMode(mode: RenderMode): string {
  return mode === "motion_swap" ? "bytedance/seedance-2.0" : "alibaba/wan-3.0";
}

/* ─────────────────────────────────────────────────────────── Stage 1 ─── */

export type PacingProfile = {
  energy?: "calm" | "conversational" | "high";
  camera?: string;
  gestures?: string;
  setting?: string;
  audio?: string;
  hookStyle?: string;
  wordsPerMinute?: number;
};

export const DEFAULT_WPM = 160;

export function clipLength(start: number, end: number): number {
  const s = Math.max(0, Number(start) || 0);
  const e = Math.max(0, Number(end) || 0);
  return Math.round(Math.max(0, e - s) * 10) / 10;
}

export function clipProblem(start: number, end: number): string | null {
  const len = clipLength(start, end);
  if (len < CLIP_MIN_S) return `The clip must be at least ${CLIP_MIN_S}s long.`;
  if (len > CLIP_MAX_S) return `The clip can be at most ${CLIP_MAX_S}s long — models ignore anything longer.`;
  return null;
}

/** Spoken-word budget for a clip at the profile's pace. */
export function wordBudget(seconds: number, wpm?: number): number {
  const pace = wpm && wpm > 60 && wpm < 260 ? wpm : DEFAULT_WPM;
  return Math.max(1, Math.floor((Math.max(0, seconds) / 60) * pace));
}

/* ─────────────────────────────────────────────────────────── Stage 2 ─── */

export type CharacterBuilder = {
  name?: string;
  age?: string;
  gender?: string;
  ethnicity?: string;
  look?: string;
  wardrobe?: string;
  setting?: string;
  lighting?: string;
  vibe?: string;
};

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Raw, unfiltered front-camera selfie — the opposite of an "AI commercial" look. */
export function buildRawIphonePrompt(c: CharacterBuilder): string {
  const who = [
    clean(c.age) ? `${clean(c.age)}-year-old` : "",
    clean(c.ethnicity),
    clean(c.gender) || "person",
  ].filter(Boolean).join(" ");
  const parts = [
    "Raw, unedited iPhone front-camera selfie photo, vertical 3:4, phone held at arm's length.",
    `A ${who}${clean(c.look) ? `, ${clean(c.look)}` : ""}.`,
    clean(c.vibe) ? `They come across as ${clean(c.vibe)}.` : "",
    clean(c.wardrobe) ? `Wearing ${clean(c.wardrobe)}.` : "",
    `Setting: ${clean(c.setting) || "a lived-in bedroom"}, ${clean(c.lighting) || "dim warm lamp light mixed with window light"}.`,
    "Natural skin texture with visible pores, fine flyaway hairs, slight under-eye shadows, natural facial asymmetry.",
    "Slight wide-angle lens distortion, mild noise in the shadows, imperfect casual framing.",
    "Looking straight into the lens mid-sentence with a relaxed, natural expression.",
    "No beauty retouching, no AI glow, no plastic skin, no studio lighting, no portrait-mode bokeh, no text, no watermark.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Six-view identity lock built from the approved portrait (sent as a reference image). */
export function buildTurnaroundPrompt(c: CharacterBuilder): string {
  return [
    "Character reference turnaround sheet of the EXACT same person as in the attached photo.",
    "Six photorealistic panels in a 3x2 grid on a plain light-grey background:",
    "(1) full body front, (2) full body left side, (3) full body back,",
    "(4) face close-up front, (5) face close-up three-quarter, (6) face close-up profile.",
    "Identical face structure, eye shape, skin tone, marks and freckles, hairline and hair roots, hairstyle and body proportions in every panel.",
    clean(c.wardrobe) ? `Same wardrobe in every panel: ${clean(c.wardrobe)}.` : "Same wardrobe as the photo in every panel.",
    "Even soft lighting, sharp detail. No text, no labels, no numbers, no watermark.",
  ].join(" ");
}

/* ─────────────────────────────────────────────────────────── Stage 3 ─── */

const normScript = (s: unknown) => clean(s);

/** FNV-1a over the normalised spoken words — the lock fingerprint. */
export function scriptLockHash(script: string): string {
  const text = normScript(script);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `s1-${text.length}-${h.toString(16).padStart(8, "0")}`;
}

export function isScriptLockValid(p: { script: string; script_locked: boolean; script_lock_hash: string | null }): boolean {
  return !!p.script_locked && !!p.script_lock_hash && p.script_lock_hash === scriptLockHash(p.script);
}

export function scriptStats(script: string, seconds: number, wpm?: number) {
  const words = scriptWordCount(script);
  const budget = wordBudget(seconds, wpm);
  const readSeconds = estimatedReadSeconds(script, wpm && wpm > 60 ? wpm : DEFAULT_WPM);
  return { words, budget, readSeconds, over: words > budget };
}

/* ─────────────────────────────────────────────────────────── Stage 4 ─── */

export type StudioProject = {
  clip_url: string | null;
  clip_start_s: number;
  clip_end_s: number;
  pacing: PacingProfile;
  character_id: string | null;
  script: string;
  script_locked: boolean;
  script_lock_hash: string | null;
  render_mode: RenderMode;
  status?: string;
};

export type StudioCharacter = {
  id: string;
  name: string;
  portrait_url: string | null;
  sheet_url: string | null;
  builder?: CharacterBuilder;
};

/** Smallest duration the model serves that covers the target, capped at its max. */
export function renderDuration(model: string, targetSeconds: number): number {
  const spec = modelSpec(model);
  const want = Math.max(1, Math.ceil(targetSeconds));
  const fit = spec.durations.filter((d) => d >= want);
  return fit.length ? fit[0] : spec.durations[spec.durations.length - 1];
}

export function targetSeconds(p: StudioProject): number {
  if (p.render_mode === "motion_swap") return clipLength(p.clip_start_s, p.clip_end_s);
  const read = estimatedReadSeconds(p.script, p.pacing?.wordsPerMinute || DEFAULT_WPM);
  return Math.min(30, Math.max(5, read));
}

export type StageKey = "reference" | "character" | "script" | "render";
export type StageState = { key: StageKey; label: string; done: boolean; missing: string[] };

export function stageStates(p: StudioProject, character: StudioCharacter | null): StageState[] {
  const refMissing: string[] = [];
  if (p.render_mode === "motion_swap") {
    if (!p.clip_url) refMissing.push("Cut the reference clip");
    const problem = clipProblem(p.clip_start_s, p.clip_end_s);
    if (problem) refMissing.push(problem);
  }
  const charMissing: string[] = [];
  if (!p.character_id || !character) charMissing.push("Pick or create a character");
  else {
    if (!character.portrait_url) charMissing.push("Generate the character portrait");
    if (p.render_mode === "motion_swap" && !character.sheet_url) charMissing.push("Generate the 6-view turnaround");
  }
  const scriptMissing: string[] = [];
  if (!normScript(p.script)) scriptMissing.push("Write the spoken script");
  else if (!isScriptLockValid(p)) scriptMissing.push("Lock the script word-for-word");
  const seconds = targetSeconds(p);
  if (normScript(p.script) && p.render_mode === "motion_swap") {
    const s = scriptStats(p.script, seconds, p.pacing?.wordsPerMinute);
    if (s.over) scriptMissing.push(`Script is ${s.words} words — the ${seconds}s clip fits about ${s.budget}`);
  }
  return [
    { key: "reference", label: "Reference", done: refMissing.length === 0, missing: refMissing },
    { key: "character", label: "Character", done: charMissing.length === 0, missing: charMissing },
    { key: "script", label: "Script & audio", done: scriptMissing.length === 0, missing: scriptMissing },
    { key: "render", label: "Render", done: p.status === "ready", missing: [] },
  ];
}

/** Every reason a render must not be submitted. Empty = clear to render. */
export function renderBlockers(
  p: StudioProject,
  character: StudioCharacter | null,
  opts: { model: string; resolution: string; aspectRatio: string },
): string[] {
  const out: string[] = [];
  for (const s of stageStates(p, character)) if (s.key !== "render") out.push(...s.missing);
  const m = swapModel(opts.model);
  if (!m) out.push(`${opts.model || "No model"} is not a Studio model`);
  else if (!m.modes.includes(p.render_mode)) {
    out.push(`${m.label} cannot copy motion from a reference video — pick Seedance or switch to character-only`);
  }
  const spec = modelSpec(opts.model);
  if (!spec.resolutions.includes(opts.resolution)) out.push(`${spec.label} does not render ${opts.resolution}`);
  if (!["9:16", "16:9"].includes(opts.aspectRatio)) out.push("Aspect must be 9:16 or 16:9");
  if (p.status === "rendering") out.push("A render is already in progress");
  return out;
}

/** Wire prompt for the render. The locked words are quoted verbatim. */
export function buildRenderPrompt(p: StudioProject, character: StudioCharacter): string {
  const pace = p.pacing || {};
  const spoken = normScript(p.script);
  const energy = pace.energy === "high" ? "high-energy, fast" : pace.energy === "calm" ? "calm, measured" : "natural conversational";
  const lines: string[] = [];
  if (p.render_mode === "motion_swap") {
    lines.push(
      "Replace the person in the reference video with the character shown in the reference images.",
      "Keep the reference video's camera movement, framing, timing, head movement, hand gestures and pacing exactly.",
      `The character keeps the exact face, hair, skin and wardrobe of ${clean(character.name) || "the character"} from the character sheet in every frame.`,
    );
  } else {
    lines.push(
      "Raw iPhone selfie-style video. The person in the first frame talks straight to camera in a single continuous shot.",
      clean(pace.camera) ? `Camera: ${clean(pace.camera)}.` : "Camera: handheld phone at arm's length with subtle natural shake.",
      clean(pace.gestures) ? `Gestures: ${clean(pace.gestures)}.` : "Natural small hand gestures and head movement.",
      "Keep the face, hair and wardrobe identical to the first frame.",
    );
  }
  if (clean(pace.setting)) lines.push(`Setting: ${clean(pace.setting)}.`);
  lines.push(`Delivery: ${energy}, authentic, like a real creator talking to their phone.`);
  if (spoken) lines.push(`They say exactly this, with accurate lip sync, and nothing else: "${spoken}"`);
  lines.push("No other speech. No subtitles, captions, on-screen text, titles, logos or watermarks.");
  return lines.join("\n");
}

/** Inputs for `buildExactVideoRequest` — frames XOR references, never both. */
export function buildRenderInput(
  p: StudioProject,
  character: StudioCharacter,
  opts: { model: string; resolution: string; aspectRatio: string },
) {
  const duration = renderDuration(opts.model, targetSeconds(p));
  const base = {
    exactModel: opts.model,
    prompt: buildRenderPrompt(p, character),
    aspectRatio: opts.aspectRatio,
    durationSeconds: duration,
    resolution: opts.resolution,
    generateAudio: true,
  };
  if (p.render_mode === "motion_swap") {
    const refs: Array<{ kind: "image" | "video"; url: string }> = [{ kind: "video", url: p.clip_url! }];
    if (character.sheet_url) refs.push({ kind: "image", url: character.sheet_url });
    if (character.portrait_url) refs.push({ kind: "image", url: character.portrait_url });
    return { ...base, inputReferences: refs };
  }
  return { ...base, firstFrameUrl: character.portrait_url };
}

/** Published per-second estimate when one exists; Seedance is token-billed. */
export function studioCostEstimate(model: string, resolution: string, seconds: number): { known: boolean; usd: number | null } {
  const per = modelSpec(model).pricePerSecondByResolution[resolution];
  if (!per) return { known: false, usd: null };
  return { known: true, usd: Math.round(per * seconds * 100) / 100 };
}
