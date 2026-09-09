import { useMemo, useState } from "react";
import { Clapperboard, ImageIcon, Loader2, Check, RefreshCw, Sparkles, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { dashboardAuthHeaders } from "@/lib/dashboardAuthHeaders";
import { toast } from "sonner";

export type ScriptRenderAvatar = { id: string; name: string; image_url?: string | null };

export type ScriptRenderRequest = {
  title: string;
  script: string;
  model: string;
  resolution: string;
  aspect: "9:16" | "16:9";
  duration: number;
  firstFrameUrl?: string;
  avatarId?: string | null;
};

type ModelOption = { value: string; label: string; hint?: string };

const IMAGE_MODELS = [
  { value: "openai/gpt-image-2", label: "GPT Image 2" },
  { value: "google/gemini-3.1-flash-image-preview", label: "Nano Banana Pro 2" },
] as const;

interface Props {
  title: string;
  script: string;
  index: number;
  total: number;
  models: ModelOption[];
  resolutionsFor: (model: string) => string[];
  maxSecondsFor: (model: string) => number;
  minSecondsFor: (model: string) => number;
  defaultModel: string;
  defaultResolution: string;
  defaultAspect: "9:16" | "16:9";
  wordsPerMinute: number;
  avatars: ScriptRenderAvatar[];
  defaultAvatarId?: string | null;
  clientId?: string;
  offerDescription?: string;
  busy?: boolean;
  onGenerate: (req: ScriptRenderRequest) => void;
}

function buildFramePrompt(script: string, avatarName?: string | null, offer?: string) {
  const lines = script
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*#>]+|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 25);
  const hook = lines.slice(0, 2).join(" ");

  const identity = avatarName
    ? [
        "SUBJECT: use the EXACT person in the reference image as the on-camera presenter.",
        "Clone their identity pixel-faithfully: face shape, bone structure, eye colour and spacing, eyebrows, nose, lips, jawline, skin tone and undertone, freckles/moles, hairline, hair colour, texture and cut, facial hair, and wardrobe.",
        "Do not beautify, slim, age, de-age or restyle them. Same person, new photograph.",
      ].join(" ")
    : [
        "SUBJECT: cast one brand-new, completely believable real human presenter — a credible investor-facing professional, not a model and not a stock-photo type.",
        "Give them specific, imperfect real features: natural asymmetry, real skin texture, subtle under-eye shadow, individual stray hairs.",
      ].join(" ");

  return [
    "PHOTOREAL PORTRAIT-GRADE OPENING FRAME for a short-form direct-response video ad. It must be indistinguishable from a real photograph taken on set — not an illustration, not a render, not AI-looking.",
    identity,
    "FRAMING: mid-shot / chest-up, presenter centred, direct eye contact into the lens, mouth slightly open mid-word as they deliver the first line, alive and mid-thought — never a stiff posed smile.",
    hook ? `MOMENT: the expression and energy match this opening line — "${hook.slice(0, 260)}".` : "",
    offer ? `CONTEXT (dress, setting and tone must fit this business): ${offer.slice(0, 400)}.` : "",
    "WARDROBE + SETTING: authentic to that context and to the presenter — real fabric with wrinkles and drape, believable environment with depth (not a flat backdrop), practical lights visible in the background bokeh.",
    "CAMERA: full-frame mirrorless, 85mm f/1.8, ISO 200, 1/250s, shallow depth of field with creamy natural bokeh, soft key light plus gentle rim light, colour-graded like a premium commercial.",
    "SKIN + DETAIL: visible pores, fine peach fuzz, real specular highlights, catchlights in both eyes, natural sub-surface scattering, individual eyelashes and hair strands, micro-imperfections kept.",
    "HARD NEGATIVES: no plastic or waxy skin, no airbrushed uncanny faces, no symmetrical CGI look, no dead or glassy eyes, no extra or malformed fingers, no warped ears or teeth, no duplicated features, no on-image text, captions, logos, watermarks, UI overlays, borders or collage, no cartoon, anime, 3D render or painting.",
  ]
    .filter(Boolean)
    .join(" ");
}


/**
 * One script = one production box: pick renderer/format/length, build an opening
 * frame with (or without) an avatar, then render just that script.
 */
export function ScriptRenderCard(props: Props) {
  const {
    title, script, index, total, models, resolutionsFor, maxSecondsFor, minSecondsFor,
    defaultModel, defaultResolution, defaultAspect, wordsPerMinute, avatars,
    defaultAvatarId, clientId, offerDescription, busy, onGenerate,
  } = props;

  const [model, setModel] = useState(defaultModel || models[0]?.value || "");
  const [aspect, setAspect] = useState<"9:16" | "16:9">(defaultAspect);
  const resList = resolutionsFor(model);
  const [resolution, setResolution] = useState(resList.includes(defaultResolution) ? defaultResolution : resList[resList.length - 1]);
  const selectableAvatars = useMemo(
    () => avatars.filter((a) => typeof a.image_url === "string" && a.image_url.trim().length > 0),
    [avatars],
  );
  const [avatarId, setAvatarId] = useState<string | null>(
    defaultAvatarId && avatars.some((a) => a.id === defaultAvatarId && a.image_url) ? defaultAvatarId : null,
  );
  const avatar = selectableAvatars.find((a) => a.id === avatarId) || null;


  const cap = maxSecondsFor(model);
  const min = minSecondsFor(model);
  const choices = [5, 8, 10, 15, 20, 25, 30].filter((s) => s >= min && s <= cap);
  const words = useMemo(
    () =>
      script
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/^\s*(?:[-*#>]+|\d+[.)])\s*/gm, " ")
        .replace(/\*\*/g, "")
        .split(/\s+/)
        .filter((w) => /[a-z0-9']/i.test(w)).length,
    [script],
  );
  const rawAuto = Math.round((words / wordsPerMinute) * 60);
  const autoSeconds = choices.length
    ? choices.reduce((best, s) => (Math.abs(s - rawAuto) < Math.abs(best - rawAuto) ? s : best), choices[0])
    : Math.min(cap, Math.max(min, rawAuto));
  const [duration, setDuration] = useState<number>(autoSeconds);

  const [frameOpen, setFrameOpen] = useState(false);
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODELS[0].value);
  const [prompt, setPrompt] = useState("");
  const [autoPrompt, setAutoPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [genImg, setGenImg] = useState(false);

  const openFrame = () => {
    setFrameOpen((o) => {
      if (!o && !prompt.trim()) {
        const auto = buildFramePrompt(script, avatar?.name, offerDescription);
        setPrompt(auto);
        setAutoPrompt(auto);
      }
      return !o;
    });
  };

  const pickModel = (v: string) => {
    setModel(v);
    const rs = resolutionsFor(v);
    if (!rs.includes(resolution)) setResolution(rs[rs.length - 1]);
    const c = maxSecondsFor(v);
    const m = minSecondsFor(v);
    if (duration > c) setDuration(c);
    if (duration < m) setDuration(m);
  };

  const generateImage = async () => {
    if (!prompt.trim()) { toast.error("Add an image prompt first"); return; }
    setGenImg(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-static-ad", {
        headers: dashboardAuthHeaders(),
        body: {
          prompt: prompt.trim(),
          imageModel,
          aspectRatio: aspect,
          projectId: "ai-studio-first-frame",
          clientId: clientId || "default",
          productDescription: offerDescription,
          characterImageUrl: avatar?.image_url || undefined,
          referenceImages: avatar?.image_url ? [avatar.image_url] : [],
        },
      });
      if (error) throw error;
      const url: string | undefined = data?.imageUrl;
      if (!url) throw new Error("no image");
      setImages((prev) => [url, ...prev]);
      setChosen(url);
    } catch {
      toast.error("Could not create that opening frame — try adjusting the prompt");
    } finally {
      setGenImg(false);
    }
  };

  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-full border text-[10px] transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="ml-1 rounded-2xl border border-border/60 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 h-5 w-5 grid place-items-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
            {index + 1}
          </span>
          <span className="text-xs font-medium truncate">{title}</span>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Script {index + 1} of {total} · {words} words
        </span>
      </div>

      {/* Model */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Model</span>
        {models.map((vm) => (
          <button key={vm.value} type="button" title={vm.hint} onClick={() => pickModel(vm.value)} className={pill(model === vm.value)}>
            {vm.label}
          </button>
        ))}
      </div>

      {/* Format + resolution */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Format</span>
        {(["9:16", "16:9"] as const).map((a) => (
          <button key={a} type="button" onClick={() => setAspect(a)} className={pill(aspect === a)}>
            {a}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-border/70" />
        {resList.map((r) => (
          <button key={r} type="button" onClick={() => setResolution(r)} className={`${pill(resolution === r)} uppercase`}>
            {r}
          </button>
        ))}
      </div>

      {/* Length */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Length</span>
        <button
          type="button"
          onClick={() => setDuration(autoSeconds)}
          title={`${words} spoken words ≈ ${rawAuto}s`}
          className={`${pill(duration === autoSeconds)} tabular-nums`}
        >
          Auto {autoSeconds}s
        </button>
        <span className="mx-1 h-3 w-px bg-border/70" />
        {choices.map((s) => (
          <button key={s} type="button" onClick={() => setDuration(s)} className={`${pill(duration === s)} tabular-nums`}>
            {s}s
          </button>
        ))}
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Avatar</span>
        <div className="relative flex-1 min-w-0">
          {avatar?.image_url ? (
            <img src={avatar.image_url} alt="" className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full object-cover" />
          ) : null}
          <select
            value={avatarId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setAvatarId(id);
              const nextName = selectableAvatars.find((a) => a.id === id)?.name;
              const auto = buildFramePrompt(script, nextName, offerDescription);
              setPrompt((p) => (!p.trim() || p === autoPrompt ? auto : p));
              setAutoPrompt(auto);
            }}
            className={`h-7 w-full appearance-none rounded-full border border-border/60 bg-background/70 ${avatar?.image_url ? "pl-8" : "pl-3"} pr-7 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40`}
          >
            <option value="">No avatar (new presenter)</option>
            {selectableAvatars.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>


      {/* Opening frame */}
      <div className="rounded-xl border border-border/50 bg-background/60 p-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={openFrame} className="inline-flex items-center gap-1.5 text-[11px] font-medium">
            <ImageIcon className="h-3.5 w-3.5 text-primary" />
            Opening frame {chosen ? "· selected" : images.length ? `· ${images.length} option${images.length === 1 ? "" : "s"}` : "· optional"}
            <ChevronDown className={`h-3 w-3 transition ${frameOpen ? "rotate-180" : ""}`} />
          </button>
          {chosen && <img src={chosen} alt="Chosen opening frame" className="h-8 w-8 rounded object-cover border border-primary" />}
        </div>

        {frameOpen && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {avatar ? `Uses avatar "${avatar.name}" as the presenter` : "New presenter from the prompt"}
              </span>
              <button
                type="button"
                onClick={() => { setPrompt(buildFramePrompt(script, avatar?.name, offerDescription)); toast.success("Prompt rebuilt from this script"); }}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Rebuild from script
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Image</span>
              <div className="relative flex-1 min-w-0">
                <select
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  className="h-7 w-full appearance-none rounded-full border border-border/60 bg-background/70 pl-3 pr-7 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {IMAGE_MODELS.map((im) => (
                    <option key={im.value} value={im.value}>{im.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="text-xs" />
            <button
              type="button"
              onClick={generateImage}
              disabled={genImg}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 hover:bg-muted disabled:opacity-40 px-3 py-1.5 text-[11px] transition"
            >
              {genImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {genImg ? "Generating…" : images.length ? "Generate another option" : "Generate opening frame"}
            </button>
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {images.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setChosen(chosen === url ? undefined : url)}
                    className={`relative rounded-lg overflow-hidden border-2 transition ${chosen === url ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
                  >
                    <img src={url} alt="Opening frame option" className="w-full aspect-square object-cover" />
                    {chosen === url && (
                      <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary grid place-items-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Render */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={!model || !!busy}
          onClick={() =>
            onGenerate({ title, script, model, resolution, aspect, duration, firstFrameUrl: chosen, avatarId })
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed text-primary px-3 py-1.5 text-[11px] font-medium transition"
        >
          <Clapperboard className="h-3.5 w-3.5" />
          Generate this video
        </button>
        <span className="text-[10px] text-muted-foreground">
          {models.find((m) => m.value === model)?.label || model} · {resolution} · {duration}s · {aspect}
          {chosen ? " · from your opening frame" : ""}
          {avatar ? ` · ${avatar.name}` : ""}
        </span>
      </div>
    </div>
  );
}
