import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dashboardAuthHeaders } from "@/lib/dashboardAuthHeaders";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useMasterVideoProject } from "@/hooks/useMasterVideoProject";
import { useClientOffers } from "@/hooks/useClientOffers";
import { useAvatars } from "@/hooks/useAvatars";
import { VIDEO_STYLE_PRESETS } from "@/lib/videoStylePresets";
import {
  FRAME_IMAGE_MODELS,
  MASTER_VIDEO_MODELS,
  MASTER_VIDEO_STEPS,
  buildFirstFramePrompt,
  buildVideoPrompt,
  composeRenderPrompt,
  costEstimate,
  estimatedReadSeconds,
  generationGate,
  modelSpec,
  reviewSummary,
  scriptApprovalHash,
  scriptApprovalStale,
  scriptWordCount,
  selectedFrame,
  stepStatuses,
  type FrameAsset,
  type StepKey,
} from "@/lib/masterVideo";

type Props = {
  clientId: string | null;
  clientName?: string | null;
  conversationId: string | null;
};

const cardCls = "rounded-2xl border border-border/60 bg-card/60 p-4";
const labelCls = "text-[11px] uppercase tracking-wide text-muted-foreground";

function pill(active: boolean) {
  return `px-2.5 py-1 rounded-full border text-[11px] transition ${
    active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-muted"
  }`;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Uploads under the client's own folder and refuses anything that is not the
 * expected kind or is over 50MB, so a wrong file never becomes an approved
 * asset — and one client's files never land in another client's folder.
 */
async function uploadAsset(
  file: File,
  folder: string,
  kind: "image" | "video" | "document",
  clientId: string | null,
): Promise<string> {
  const type = file.type || "";
  const okType =
    kind === "image" ? type.startsWith("image/") : kind === "video" ? type.startsWith("video/") : !!type;
  if (!okType) throw new Error(`That file is not ${kind === "image" ? "an image" : `a ${kind}`}.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That file is over the 50MB limit.");
  const ext = (file.name.split(".").pop() || (kind === "image" ? "png" : "bin")).toLowerCase().slice(0, 8);
  const path = `master-video/${clientId || "shared"}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("creatives").upload(path, file, {
    contentType: type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("creatives").getPublicUrl(path).data.publicUrl;
}

/** Plain-language label for a render's state, including the held-for-review one. */
function renderStatusLabel(status: string): string {
  if (status === "queued") return "Waiting to start";
  if (status === "running") return "Rendering";
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "submission_unknown") return "Held for review";
  return status;
}

/**
 * The six-step Master AI Video workflow: Offer, Style, Presenter, First frame,
 * Script & directions, Generate.
 *
 * Everything is one saved project (see `useMasterVideoProject`) so a reload or a
 * thread switch resumes exactly where the operator left off. Approvals are bound
 * to a content hash, so editing anything upstream visibly invalidates the
 * approval below it instead of quietly rendering stale inputs.
 */
export default function MasterVideoWorkflow({ clientId, clientName, conversationId }: Props) {
  const project = useMasterVideoProject(clientId, conversationId);
  const { draft, approvals, update } = project;
  const { data: offers = [] } = useClientOffers(clientId || undefined);
  const { data: avatars = [] } = useAvatars(clientId);

  const [step, setStep] = useState<StepKey>("offer");
  const [busy, setBusy] = useState<null | "frame" | "frame-edit" | "script" | "generate">(null);
  const frameFile = useRef<HTMLInputElement>(null);
  const avatarFile = useRef<HTMLInputElement>(null);
  const styleFile = useRef<HTMLInputElement>(null);
  const offerFile = useRef<HTMLInputElement>(null);
  const scriptFile = useRef<HTMLInputElement>(null);
  /** The scope this screen is currently showing, so async work that finishes
   * after a client or thread switch is thrown away instead of written. */
  const scopeRef = useRef(`${clientId ?? ""}|${conversationId ?? ""}`);
  scopeRef.current = `${clientId ?? ""}|${conversationId ?? ""}`;
  const sameScope = (at: string) => scopeRef.current === at;

  const statuses = stepStatuses(draft, approvals);
  const statusOf = (key: StepKey) => statuses.find((s) => s.key === key)!;
  const gate = generationGate(draft, approvals);
  const frame = selectedFrame(draft);
  const spec = modelSpec(draft.model);
  const offer = offers.find((o) => o.id === draft.offerId) || null;
  const usableAvatars = useMemo(
    () => avatars.filter((a: any) => typeof a.image_url === "string" && a.image_url.trim()),
    [avatars],
  );

  // The frame prompt and image model live in the saved project, so a reload does
  // not lose an edit in progress.
  const framePrompt = draft.framePrompt;
  const frameModel = draft.frameImageModel || FRAME_IMAGE_MODELS[0].value;
  const setFramePrompt = (value: string) => update({ framePrompt: value, framePromptTouched: true });
  const setFrameModel = (value: string) => update({ frameImageModel: value });

  // Auto-seed the frame prompt from the choices already made, and keep it in step
  // with them until the operator edits it by hand.
  const seeded = buildFirstFramePrompt(draft, clientName);
  useEffect(() => {
    if (project.loading) return;
    if (draft.framePromptTouched) return;
    if (draft.framePrompt === seeded) return;
    update({ framePrompt: seeded });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.loading, seeded, draft.framePromptTouched]);

  // Reset the local step when the scope changes so no draft state leaks across
  // clients or threads.
  useEffect(() => {
    setStep("offer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, conversationId]);

  /* ---------------------------------------------------------- frame ------- */

  const addFrame = (url: string, source: FrameAsset["source"], prompt: string, model: string | null) => {
    const asset: FrameAsset = {
      id: crypto.randomUUID(),
      url,
      version: draft.frames.length + 1,
      prompt,
      imageModel: model,
      source,
      createdAt: new Date().toISOString(),
    };
    // Older versions are kept — choosing a new one never deletes what came before.
    update({ frames: [...draft.frames, asset], selectedFrameId: asset.id });
  };

  /**
   * One image call for both "create a frame" and "edit the frame I chose". The
   * edit passes the chosen image itself as the reference, so the person, clothes
   * and place carry over instead of being re-imagined.
   */
  const runFrameImage = async (mode: "create" | "edit") => {
    if (!framePrompt.trim()) {
      toast.error("Add a prompt for the opening frame first");
      return;
    }
    if (mode === "edit" && !frame) {
      toast.error("Choose a frame to edit first");
      return;
    }
    const at = scopeRef.current;
    setBusy(mode === "edit" ? "frame-edit" : "frame");
    try {
      const references = [
        mode === "edit" && frame ? frame.url : null,
        draft.presenter === "avatar" ? draft.avatarImageUrl : null,
      ].filter((u): u is string => !!u);
      const { data, error } = await supabase.functions.invoke("generate-static-ad", {
        headers: dashboardAuthHeaders(),
        body: {
          prompt: framePrompt.trim(),
          imageModel: frameModel,
          aspectRatio: draft.aspectRatio,
          projectId: "master-video-first-frame",
          clientId: clientId || "default",
          productDescription: draft.brief || offer?.description || undefined,
          // Keeps the presenter's identity intact while the frame is re-generated.
          characterImageUrl: references[0] || undefined,
          referenceImages: references,
        },
      });
      if (error) throw error;
      const url: string | undefined = data?.imageUrl;
      if (!url) throw new Error("No image came back");
      if (!sameScope(at)) return; // a different client is on screen now
      addFrame(url, "generated", framePrompt.trim(), frameModel);
      toast.success(mode === "edit" ? "Edited frame added as a new version" : "New opening frame ready");
    } catch {
      toast.error("Could not create that opening frame — try adjusting the prompt");
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------------------------------------- script ------- */

  const draftScript = async () => {
    setBusy("script");
    try {
      const style = VIDEO_STYLE_PRESETS.find((p) => p.id === draft.styleId);
      const prompt = [
        "You write direct-response video ad scripts. Reply with JSON only:",
        '{"script": "the exact spoken words", "videoPrompt": "camera, motion, wardrobe, location and audio directions only"}',
        "",
        `Target length: about ${draft.durationSeconds} seconds spoken (roughly ${Math.round((draft.durationSeconds / 60) * 150)} words).`,
        `Offer: ${offer?.title || "(not set)"}${offer?.description ? ` — ${offer.description}` : ""}`,
        draft.brief ? `Production brief: ${draft.brief}` : "",
        draft.claims ? `Only these claims and proof points may be used: ${draft.claims}` : "",
        `The single call to action: ${draft.cta || "(not set)"}`,
        style ? `Style reference: ${style.promptHint}` : "",
        draft.styleDirections ? `Extra style directions: ${draft.styleDirections}` : "",
        draft.presenter === "avatar"
          ? `Spoken by a presenter on camera${draft.avatarDescription ? `: ${draft.avatarDescription}` : ""}.`
          : "No presenter — voiceover over visuals.",
        "",
        "Structure: hook, the mechanism, supported proof, one call to action.",
        "Rules: never invent returns, guarantees, numbers or proof that were not given.",
        "The script is spoken words ONLY — no scene headings, no stage directions, no captions, no emoji.",
      ]
        .filter(Boolean)
        .join("\n");

      const { data, error } = await supabase.functions.invoke("generate-ad-script", { body: { prompt } });
      if (error) throw error;
      const script = String(data?.script || "").trim();
      const videoPrompt = String(data?.videoPrompt || "").trim();
      if (!script) throw new Error("empty");
      update({ script, videoPrompt: videoPrompt || buildVideoPrompt(draft) });
      toast.success("Draft written — edit anything you want before approving");
    } catch {
      toast.error("Could not draft the script — write it yourself or try again");
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------- generate ------- */

  const generate = async (retryOfGenerationId?: string) => {
    if (!retryOfGenerationId && !gate.ok) {
      toast.error(gate.reasons[0]);
      return;
    }
    setBusy("generate");
    try {
      // Flush the draft so the server reads exactly what is on screen. If the save
      // fails we stop — never pay to render something we could not store.
      const saved = await project.saveNow();
      if (!saved.ok) throw new Error(saved.error || "Your changes could not be saved, so nothing was sent.");
      const { data, error } = await supabase.functions.invoke("master-video-generate", {
        headers: dashboardAuthHeaders(),
        body: {
          projectId: saved.projectId || project.projectId,
          scriptHash: scriptApprovalHash(draft),
          retryOfGenerationId: retryOfGenerationId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.duplicate
          ? "This exact version is already rendering — nothing was charged twice"
          : "Video queued — it keeps rendering even if you close this",
      );
      await project.refreshGenerations();
    } catch (e: any) {
      toast.error(e?.message || "Could not start the video");
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------------- rail ---- */

  const idx = MASTER_VIDEO_STEPS.findIndex((s) => s.key === step);
  const go = (dir: -1 | 1) => {
    const next = MASTER_VIDEO_STEPS[idx + dir];
    if (next) setStep(next.key);
  };

  // A problem must be visible and actionable — never an endless spinner.
  if (project.loadError && !project.projectId) {
    return (
      <div className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="font-medium">Master video could not open</div>
        <div className="text-muted-foreground">{project.loadError}</div>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Reload and try again
        </Button>
      </div>
    );
  }

  if (project.loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your video project…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {project.loadError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {project.loadError}
        </div>
      )}
      {/* Compact stage rail */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-muted/20 p-1.5">
        {MASTER_VIDEO_STEPS.map((s, i) => {
          const st = statusOf(s.key);
          const active = s.key === step;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(s.key)}
              title={st.reason || s.blurb}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition ${
                active ? "bg-background shadow-sm" : "hover:bg-background/60"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                  st.complete
                    ? "bg-emerald-500/15 text-emerald-600"
                    : active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {st.complete ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            </button>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center gap-2 pr-1 text-[10px] text-muted-foreground">
          {project.saving ? "Saving…" : "Saved"}
        </div>
      </div>

      {/* ------------------------------------------------------- 1. Offer */}
      {step === "offer" && (
        <div className={cardCls + " space-y-3"}>
          <div className={labelCls}>Which offer does this ad sell?</div>
          {offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No offers saved for this client yet — add one in the client's Offers area first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {offers.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={pill(draft.offerId === o.id)}
                  onClick={() =>
                    update({
                      offerId: o.id,
                      offerSnapshot: {
                        id: o.id,
                        name: o.title,
                        audience: "",
                        terms: o.description || "",
                        proof: "",
                        sources: o.file_url ? [o.file_url] : [],
                      },
                    })
                  }
                >
                  {o.title}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className={labelCls}>Production brief (does not change the saved offer)</div>
              <Textarea rows={4} value={draft.brief} onChange={(e) => update({ brief: e.target.value })} placeholder="Angle for this specific ad, audience, what to lead with…" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Claims and proof allowed in this ad</div>
              <Textarea rows={4} value={draft.claims} onChange={(e) => update({ claims: e.target.value })} placeholder="Only verified figures and proof points, with where they come from…" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className={labelCls}>The one call to action</div>
              <Input value={draft.cta} onChange={(e) => update({ cta: e.target.value })} placeholder="Book a call at…" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Sources / references</div>
              <Input value={draft.sourceNotes} onChange={(e) => update({ sourceNotes: e.target.value })} placeholder="Links or documents backing the claims" />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- 2. Style */}
      {step === "style" && (
        <div className={cardCls + " space-y-3"}>
          <div className={labelCls}>Pick one style — hover to preview</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {VIDEO_STYLE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  // Picking a style fills in its full direction, unless the
                  // operator has written their own directions.
                  const ownWords =
                    draft.styleDirections.trim() &&
                    !VIDEO_STYLE_PRESETS.some((x) => x.promptHint === draft.styleDirections);
                  update({
                    styleId: p.id,
                    styleLabel: p.name,
                    ...(ownWords ? {} : { styleDirections: p.promptHint }),
                  });
                }}
                className={`group overflow-hidden rounded-xl border text-left transition ${
                  draft.styleId === p.id ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/40"
                }`}
              >
                <video
                  src={p.preview}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] w-full object-cover"
                  onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e) => {
                    const v = e.currentTarget as HTMLVideoElement;
                    v.pause();
                    v.currentTime = 0;
                  }}
                />
                <div className="p-2">
                  <div className="truncate text-xs font-medium">{p.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{p.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={styleFile}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const kind = f.type.startsWith("video/") ? "video" : "image";
                  const url = await uploadAsset(f, "style", kind, clientId);
                  update({ styleReferenceUrl: url, styleLabel: draft.styleLabel || "Uploaded reference" });
                  toast.success("Reference uploaded");
                } catch (err: any) {
                  toast.error(err?.message || "Could not upload that reference");
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={() => styleFile.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload a reference
            </Button>
            {draft.styleReferenceUrl && (
              <>
                <img src={draft.styleReferenceUrl} alt="Style reference" className="h-10 w-10 rounded-md object-cover" />
                <Button variant="ghost" size="sm" onClick={() => update({ styleReferenceUrl: null })}>
                  Remove
                </Button>
              </>
            )}
          </div>
          <div className="space-y-1">
            <div className={labelCls}>Extra style directions</div>
            <Textarea rows={3} value={draft.styleDirections} onChange={(e) => update({ styleDirections: e.target.value })} placeholder="Lighting, pace, energy, anything the reference doesn't cover…" />
          </div>
        </div>
      )}

      {/* --------------------------------------------------- 3. Presenter */}
      {step === "avatar" && (
        <div className={cardCls + " space-y-3"}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={labelCls + " w-full"}>Who is on camera?</span>
            <button type="button" className={pill(draft.presenter === "avatar")} onClick={() => update({ presenter: "avatar" })}>
              A presenter
            </button>
            <button
              type="button"
              className={pill(draft.presenter === "none")}
              onClick={() => update({ presenter: "none", avatarId: null, avatarName: null, avatarImageUrl: null })}
            >
              No presenter
            </button>
          </div>

          {draft.presenter === "avatar" && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {usableAvatars.map((a: any) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => update({ avatarId: a.id, avatarName: a.name, avatarImageUrl: a.image_url })}
                    className={`overflow-hidden rounded-xl border transition ${
                      draft.avatarId === a.id ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <img src={a.image_url} alt={a.name} className="aspect-[3/4] w-full object-cover" />
                    <div className="truncate p-1 text-[10px]">{a.name}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={avatarFile}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const url = await uploadAsset(f, "presenter", "image", clientId);
                      update({ avatarId: `upload:${url}`, avatarName: "Uploaded presenter", avatarImageUrl: url });
                      toast.success("Presenter uploaded");
                    } catch (err: any) {
                      toast.error(err?.message || "Could not upload that photo");
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => avatarFile.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload a presenter
                </Button>
                {draft.avatarImageUrl && (
                  <>
                    <img src={draft.avatarImageUrl} alt="Presenter" className="h-10 w-10 rounded-md object-cover" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ avatarId: null, avatarName: null, avatarImageUrl: null })}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
              <div className="space-y-1">
                <div className={labelCls}>How this person should come across</div>
                <Textarea rows={2} value={draft.avatarDescription} onChange={(e) => update({ avatarDescription: e.target.value })} placeholder="Warm, credible advisor in her 40s…" />
              </div>
            </>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className={labelCls}>Wardrobe</div>
              <Input value={draft.wardrobe} onChange={(e) => update({ wardrobe: e.target.value })} placeholder="Neutral linen blazer" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Location</div>
              <Input value={draft.location} onChange={(e) => update({ location: e.target.value })} placeholder="Sunlit office, city behind" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Camera & motion</div>
              <Input value={draft.motion} onChange={(e) => update({ motion: e.target.value })} placeholder="Slow push in, handheld sway" />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- 4. First frame */}
      {step === "frame" && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className={cardCls + " space-y-3"}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className={labelCls}>Opening frame prompt</div>
                <div className="flex items-center gap-1.5">
                  {FRAME_IMAGE_MODELS.map((m) => (
                    <button key={m.value} type="button" className={pill(frameModel === m.value)} onClick={() => setFrameModel(m.value)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea rows={5} value={framePrompt} onChange={(e) => setFramePrompt(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => runFrameImage("create")} disabled={busy === "frame"}>
                {busy === "frame" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
                Create frame
              </Button>
              <Button variant="outline" size="sm" onClick={() => runFrameImage("edit")} disabled={busy === "frame-edit" || !frame}>
                {busy === "frame-edit" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Edit chosen frame
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ framePrompt: buildFirstFramePrompt(draft, clientName), framePromptTouched: false })}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rebuild prompt
              </Button>
              <input
                ref={frameFile}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const url = await uploadAsset(f, "frame", "image", clientId);
                    addFrame(url, "uploaded", framePrompt.trim(), null);
                    toast.success("Frame uploaded");
                  } catch (err: any) {
                    toast.error(err?.message || "Could not upload that image");
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => frameFile.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload a frame
              </Button>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Format
                {spec.aspectRatios.map((a) => (
                  <button key={a} type="button" className={pill(draft.aspectRatio === a)} onClick={() => update({ aspectRatio: a })}>
                    {a}
                  </button>
                ))}
              </span>
            </div>

            {draft.frames.length > 0 && (
              <div className="space-y-1.5">
                <div className={labelCls}>Versions — pick the one to use</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {draft.frames.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => update({ selectedFrameId: f.id })}
                      className={`overflow-hidden rounded-xl border transition ${
                        draft.selectedFrameId === f.id ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/40"
                      }`}
                    >
                      <img src={f.url} alt={`Frame v${f.version}`} className="aspect-[9/16] w-full object-cover" />
                      <div className="p-1 text-[10px] text-muted-foreground">v{f.version} · {f.source}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={cardCls + " space-y-3"}>
            <div className={labelCls}>Chosen frame</div>
            {frame ? (
              <img src={frame.url} alt="Chosen opening frame" className="w-full rounded-xl object-cover" />
            ) : (
              <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-muted text-xs text-muted-foreground">
                Nothing chosen yet
              </div>
            )}
            {statusOf("frame").reason && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {statusOf("frame").reason}
              </p>
            )}
            <Button size="sm" className="w-full" disabled={!frame || statusOf("frame").complete} onClick={project.approveFrame}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {statusOf("frame").complete ? "Frame approved" : "Approve this exact frame"}
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------- 5. Script & directions */}
      {step === "script" && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className={cardCls + " space-y-3"}>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={draftScript} disabled={busy === "script"}>
                {busy === "script" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Draft with AI
              </Button>
              <Button variant="outline" size="sm" onClick={() => update({ videoPrompt: buildVideoPrompt(draft) })}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rebuild directions
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {scriptWordCount(draft.script)} words · about {estimatedReadSeconds(draft.script)}s to read · render is {draft.durationSeconds}s
              </span>
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Spoken script — the exact words, nothing else</div>
              <Textarea rows={8} value={draft.script} onChange={(e) => update({ script: e.target.value })} placeholder="Paste or write the words that are said out loud…" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Camera, motion and audio directions</div>
              <Textarea rows={5} value={draft.videoPrompt} onChange={(e) => update({ videoPrompt: e.target.value })} placeholder="Single continuous handheld shot, slow push in, room tone…" />
            </div>
            <div className="space-y-1">
              <div className={labelCls}>Disclosure (added on screen later, never spoken)</div>
              <Textarea rows={2} value={draft.disclosure} onChange={(e) => update({ disclosure: e.target.value })} placeholder="Targeted returns are not guaranteed…" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={labelCls + " w-full"}>Render settings</span>
              {MASTER_VIDEO_MODELS.map((m) => (
                <button key={m.value} type="button" title={m.hint} className={pill(draft.model === m.value)} onClick={() => update({ model: m.value })}>
                  {m.label}
                </button>
              ))}
              <span className="mx-1 h-3 w-px bg-border/70" />
              {spec.resolutions.map((r) => (
                <button key={r} type="button" className={pill(draft.resolution === r) + " uppercase"} onClick={() => update({ resolution: r })}>
                  {r}
                </button>
              ))}
              <span className="mx-1 h-3 w-px bg-border/70" />
              {spec.durations.map((d) => (
                <button key={d} type="button" className={pill(draft.durationSeconds === d)} onClick={() => update({ durationSeconds: d })}>
                  {d}s
                </button>
              ))}
              <span className="mx-1 h-3 w-px bg-border/70" />
              <button type="button" className={pill(draft.audio)} onClick={() => update({ audio: !draft.audio })}>
                Audio {draft.audio ? "on" : "off"}
              </button>
            </div>
          </div>

          <div className={cardCls + " space-y-3"}>
            <div className={labelCls}>Approved frame</div>
            {frame ? (
              <img src={frame.url} alt="Approved frame" className="w-full rounded-xl object-cover" />
            ) : (
              <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-muted text-xs text-muted-foreground">
                Go back and approve a frame
              </div>
            )}
            {scriptApprovalStale(draft, approvals) && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Something changed after you approved. Read it once more and approve again — the old version is kept.
              </p>
            )}
            {statusOf("script").reason && !scriptApprovalStale(draft, approvals) && (
              <p className="text-[11px] text-muted-foreground">{statusOf("script").reason}</p>
            )}
            <Button size="sm" className="w-full" disabled={statusOf("script").complete || !statusOf("frame").complete} onClick={project.approveScript}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {statusOf("script").complete ? "Script approved" : "Approve script & directions"}
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- 6. Generate */}
      {step === "generate" && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className={cardCls + " space-y-3"}>
            <div className={labelCls}>Final review</div>
            <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              {reviewSummary(draft, { clientName, offerName: offer?.title }).map((row) => (
                <div key={row.label} className="flex justify-between gap-3 border-b border-border/40 py-1">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-1">
              <div className={labelCls}>Exactly what the renderer is told</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-2 text-[11px] leading-relaxed">
                {composeRenderPrompt(draft)}
              </pre>
            </div>
            {!gate.ok && (
              <ul className="space-y-1 text-[11px] text-amber-600">
                {gate.reasons.map((r) => (
                  <li key={r} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => generate()} disabled={!gate.ok || busy === "generate" || !project.projectId}>
                {busy === "generate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Film className="mr-1.5 h-4 w-4" />}
                Generate video
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {costEstimate(draft).known ? costEstimate(draft).note : costEstimate(draft).note}
              </span>
            </div>
          </div>

          <div className={cardCls + " space-y-2"}>
            <div className="flex items-center justify-between">
              <div className={labelCls}>Renders</div>
              <Button variant="ghost" size="sm" onClick={project.refreshGenerations}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {project.generations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing rendered yet.</p>
            ) : (
              project.generations.map((g) => (
                <div key={g.id} className="rounded-xl border border-border/60 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{renderStatusLabel(g.status)}</span>
                    <span className="text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {g.model} · {g.resolution} · {g.duration_seconds}s
                  </div>
                  {g.error && <div className="mt-1 text-amber-600">{g.error}</div>}
                  {g.video_url && (
                    <>
                      <video src={g.video_url} controls className="mt-1.5 w-full rounded-lg" />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <a href={g.video_url} download target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(g.video_url as string);
                            toast.success("Link copied — paste it into captions or editing");
                          }}
                        >
                          Copy link
                        </Button>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        This is the untouched render. Captions or trims are made afterwards and saved separately, so
                        this clean version stays as it is.
                      </p>
                    </>
                  )}
                  {!g.video_url && (g.status === "running" || g.status === "queued") && (
                    <div className="mt-1 text-muted-foreground">
                      Rendering — it finishes on the server, so you can close this.
                    </div>
                  )}
                  {g.status === "submission_unknown" && (
                    <div className="mt-1 text-amber-600">
                      We could not confirm whether this reached the renderer, so it is held. It may already have been
                      charged — check the Renders list again before starting another.
                    </div>
                  )}
                  {g.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1.5 w-full"
                      onClick={() => generate(g.id)}
                      disabled={busy === "generate"}
                    >
                      Try this exact version again
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={idx === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <span className="text-[11px] text-muted-foreground">{statusOf(step).reason || "Ready"}</span>
        <Button variant="outline" size="sm" onClick={() => go(1)} disabled={idx === MASTER_VIDEO_STEPS.length - 1}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
