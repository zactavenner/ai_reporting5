import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dashboardTokenHeaders } from "@/lib/dashboardAuthHeaders";
import { toast } from "sonner";
import {
  Loader2, Sparkles, ImagePlus, Upload, Play, DollarSign, Send, Film, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MASTER_VIDEO_MODELS,
  costEstimate,
  estimatedReadSeconds,
  modelSpec,
  scriptWordCount,
  suggestDurationForScript,
  type MasterVideoDraft,
} from "@/lib/masterVideo";

/**
 * Video Ads production pipeline.
 *
 * Pick up to three templates/references from the library → each gets a column
 * with its own script, video prompt and first frame → render with the chosen
 * model, aspect and resolution. Duration follows the script's spoken length
 * (30s ceiling) and the total cost estimate is shown before anything is paid.
 * Finished videos are saved into the client's Creatives tab as pending review.
 */

export interface PipelineTemplate {
  id: string;
  name: string;
  url: string;
  poster_url?: string | null;
  library: "reference" | "template";
  view_count: number | null;
  instructions: string | null;
}

interface Props {
  clientId: string;
  clientName: string;
  offerTitle: string;
  offerDescription: string;
  templates: PipelineTemplate[];
  onRemoveTemplate: (id: string) => void;
}

interface ColumnState {
  script: string;
  videoPrompt: string;
  framePrompt: string;
  frameUrl: string | null;
  videoUrl: string | null;
  busy: "script" | "frame" | "video" | null;
  error: string | null;
  savedToCreatives: boolean;
}

const EMPTY_COL: ColumnState = {
  script: "",
  videoPrompt: "",
  framePrompt: "",
  frameUrl: null,
  videoUrl: null,
  busy: null,
  error: null,
  savedToCreatives: false,
};

const IMAGE_MODELS = [
  { value: "openai", label: "GPT Image 2.6" },
  { value: "nano-banana", label: "Nano Banana Pro" },
] as const;

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

export function VideoPipeline({ clientId, clientName, offerTitle, offerDescription, templates, onRemoveTemplate }: Props) {
  const [cols, setCols] = useState<Record<string, ColumnState>>({});
  const [model, setModel] = useState<string>("alibaba/wan-3.0");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [imageModel, setImageModel] = useState<string>("openai");
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const spec = modelSpec(model);
  const resolutionOptions = spec.resolutions;
  const [resolution, setResolution] = useState<string>(
    spec.resolutions.includes("720p") ? "720p" : spec.resolutions[spec.resolutions.length - 1],
  );

  const col = (id: string): ColumnState => cols[id] || EMPTY_COL;
  const patch = (id: string, p: Partial<ColumnState>) =>
    setCols((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_COL), ...p } }));

  // Duration follows the longest script's spoken length unless overridden.
  const suggestedDuration = useMemo(() => {
    const longest = templates
      .map((t) => col(t.id).script)
      .reduce((a, b) => (scriptWordCount(b) > scriptWordCount(a) ? b : a), "");
    return suggestDurationForScript(longest, model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, model, templates]);
  const duration = durationOverride ?? suggestedDuration;

  // Live total cost estimate across every column that would render.
  const perVideoEstimate = costEstimate({
    model, resolution, durationSeconds: duration,
  } as MasterVideoDraft);
  const renderableCount = templates.filter((t) => col(t.id).script.trim() && !col(t.id).videoUrl).length;
  const totalEstimate = perVideoEstimate.known && perVideoEstimate.usd != null
    ? perVideoEstimate.usd * Math.max(renderableCount, 1)
    : null;

  const changeModel = (m: string) => {
    setModel(m);
    const s = modelSpec(m);
    setResolution(s.resolutions.includes("720p") ? "720p" : s.resolutions[s.resolutions.length - 1]);
    setDurationOverride(null);
  };

  /* ------------------------------------------------------------ script --- */
  const writeScript = async (t: PipelineTemplate) => {
    patch(t.id, { busy: "script", error: null });
    try {
      const targetWords = Math.round((Math.min(duration, 30) / 60) * 150);
      const prompt = [
        "You write direct-response video ad scripts. Reply with JSON only:",
        '{"script": "the exact spoken words", "videoPrompt": "camera, motion, wardrobe, location and audio directions only"}',
        "",
        `Target length: about ${Math.min(duration, 30)} seconds spoken (roughly ${targetWords} words). Never exceed 30 seconds.`,
        `Client: ${clientName}.`,
        `Offer: ${offerTitle || "(not set)"}${offerDescription ? ` — ${offerDescription}` : ""}`,
        t.library === "reference"
          ? `This models a new find with ${t.view_count ? `${t.view_count.toLocaleString()} views` : "strong traction"}. Recreate what made it work for this offer.`
          : `This replicates a proven converting template: "${t.name}".`,
        t.instructions ? `Template instructions to follow: ${t.instructions}` : "",
        "",
        "Structure: hook, the mechanism, supported proof, one call to action.",
        "Rules: never invent returns, guarantees, numbers or proof that were not given. Use 'targeted returns' language, never 'guaranteed'.",
        "The script is spoken words ONLY — no scene headings, no stage directions, no captions, no emoji.",
      ].filter(Boolean).join("\n");

      const { data, error } = await supabase.functions.invoke("generate-ad-script", { body: { prompt } });
      if (error) throw error;
      const script = String(data?.script || "").trim();
      const videoPrompt = String(data?.videoPrompt || "").trim();
      if (!script) throw new Error("empty");
      patch(t.id, {
        script,
        videoPrompt: videoPrompt || `Vertical video ad for ${clientName}. ${t.instructions || ""}`.trim(),
        busy: null,
      });
      setDurationOverride(null); // re-derive from the new script
    } catch {
      patch(t.id, { busy: null, error: "Could not draft the script — write it yourself or try again" });
    }
  };

  /* ------------------------------------------------------------- frame --- */
  const generateFrame = async (t: PipelineTemplate) => {
    const c = col(t.id);
    const framePrompt = c.framePrompt.trim() || [
      "Photorealistic opening frame of a direct-response video ad.",
      `Context: an ad for ${offerTitle || clientName}.`,
      aspectRatio === "9:16" ? "Vertical 9:16 framing" : "Landscape 16:9 framing",
      "natural lighting, shallow depth of field, shot on a cinema camera.",
      "No text, no lettering, no captions, no logos, no watermarks anywhere in the image.",
    ].join(" ");
    patch(t.id, { busy: "frame", error: null });
    try {
      const { data, error } = await supabase.functions.invoke("generate-static-ad", {
        headers: dashboardTokenHeaders(),
        body: {
          prompt: framePrompt,
          imageModel,
          aspectRatio,
          projectId: "video-pipeline-first-frame",
          clientId,
          productDescription: offerDescription || undefined,
        },
      });
      if (error) throw error;
      const url: string | undefined = data?.imageUrl;
      if (!url) throw new Error("No image came back");
      patch(t.id, { frameUrl: url, framePrompt, busy: null });
      toast.success("Opening frame ready");
    } catch {
      patch(t.id, { busy: null, error: "Could not create the opening frame — adjust the prompt and retry" });
    }
  };

  const uploadFrame = async (t: PipelineTemplate, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Only image files can be a first frame"); return; }
    patch(t.id, { busy: "frame", error: null });
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `ai-studio/frames/${clientId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("creatives").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("creatives").getPublicUrl(path);
      patch(t.id, { frameUrl: pub.publicUrl, busy: null });
      toast.success("Frame uploaded");
    } catch (e: any) {
      patch(t.id, { busy: null, error: e?.message || "Upload failed" });
    }
  };

  /* ------------------------------------------------------------- video --- */
  const generateVideo = async (t: PipelineTemplate) => {
    const c = col(t.id);
    if (!c.script.trim()) { toast.error("Write the script first"); return; }
    if (!c.videoPrompt.trim()) { toast.error("Add the video prompt first"); return; }
    patch(t.id, { busy: "video", error: null });
    try {
      const fullPrompt = [
        c.videoPrompt.trim(),
        t.instructions ? `Template instructions: ${t.instructions}` : "",
        `Spoken script (say exactly this, nothing else): ${c.script.trim()}`,
        "No subtitles, no captions, no on-screen text, no titles, no logos, no watermarks.",
      ].filter(Boolean).join("\n\n");

      const { data, error } = await supabase.functions.invoke("generate-video-from-image", {
        headers: dashboardTokenHeaders(),
        body: {
          exactModel: model,
          prompt: fullPrompt,
          imageUrl: c.frameUrl || undefined,
          aspectRatio,
          duration,
          resolution,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const videoUrl: string | undefined = data?.videoUrl;
      if (!videoUrl) throw new Error("No video came back");
      patch(t.id, { videoUrl, busy: null });
      toast.success("Video rendered");
    } catch (e: any) {
      patch(t.id, { busy: null, error: e?.message || "Video generation failed" });
    }
  };

  /* ---------------------------------------------------------- creatives --- */
  const sendToCreatives = async (t: PipelineTemplate) => {
    const c = col(t.id);
    if (!c.videoUrl) return;
    try {
      const { error } = await supabase.from("creatives").insert({
        client_id: clientId,
        title: `${t.name} — ${spec.label} ${resolution} ${duration}s`,
        type: "video",
        file_url: c.videoUrl,
        status: "pending",
      } as any);
      if (error) throw error;
      patch(t.id, { savedToCreatives: true });
      toast.success("Sent to Creatives for review");
    } catch (e: any) {
      toast.error(e?.message || "Could not save to Creatives");
    }
  };

  if (templates.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Film className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          Pick up to three templates or references from the library — each one gets its own column here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Shared render bar */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={model} onValueChange={changeModel}>
          <SelectTrigger className="h-8 w-[150px] text-xs rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASTER_VIDEO_MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as "9:16" | "16:9")}>
          <SelectTrigger className="h-8 w-[96px] text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {spec.aspectRatios.map((a) => (
              <SelectItem key={a} value={a} className="text-xs">{a === "9:16" ? "9:16 vertical" : "16:9 wide"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resolution} onValueChange={setResolution}>
          <SelectTrigger className="h-8 w-[92px] text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {resolutionOptions.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(duration)}
          onValueChange={(v) => setDurationOverride(Number(v))}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {spec.durations.filter((d) => d <= 30).map((d) => (
              <SelectItem key={d} value={String(d)} className="text-xs">
                {d}s{d === suggestedDuration ? " (script)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={imageModel} onValueChange={setImageModel}>
          <SelectTrigger className="h-8 w-[150px] text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {IMAGE_MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">Frame: {m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          {perVideoEstimate.known && perVideoEstimate.usd != null ? (
            <span className="text-xs font-medium">
              {fmtMoney(perVideoEstimate.usd)} / video
              {renderableCount > 1 && totalEstimate != null && (
                <span className="text-muted-foreground"> · {fmtMoney(totalEstimate)} total for {renderableCount}</span>
              )}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{spec.label} is billed per video token — cost known at render</span>
          )}
        </div>
      </Card>
      <p className="text-[10px] text-muted-foreground -mt-1.5">
        {spec.hint}. Duration follows the script's spoken length ({duration}s); 720p is the default, 1080p costs more.
      </p>

      {/* Columns */}
      <div className={`grid gap-3 ${templates.length === 1 ? "grid-cols-1 max-w-xl" : templates.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
        {templates.map((t) => {
          const c = col(t.id);
          const words = scriptWordCount(c.script);
          const readSecs = estimatedReadSeconds(c.script);
          return (
            <Card key={t.id} className="p-3 space-y-3 flex flex-col">
              {/* Template header */}
              <div className="flex items-start gap-2">
                <div className="relative h-16 w-12 rounded-lg overflow-hidden bg-muted/40 shrink-0">
                  {t.poster_url ? (
                    <img src={t.poster_url} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <video src={t.url} className="w-full h-full object-cover" muted preload="metadata" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{t.name}</p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <Badge variant={t.library === "reference" ? "secondary" : "outline"} className="text-[9px]">
                      {t.library === "reference" ? "Reference" : "Proven template"}
                    </Badge>
                    {t.view_count != null && (
                      <Badge variant="outline" className="text-[9px]">{t.view_count.toLocaleString()} views</Badge>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => onRemoveTemplate(t.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Script */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Script</span>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-[10px]"
                    onClick={() => writeScript(t)} disabled={c.busy !== null}
                  >
                    {c.busy === "script" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {c.script ? "Rewrite" : "Write script"}
                  </Button>
                </div>
                <Textarea
                  value={c.script}
                  onChange={(e) => patch(t.id, { script: e.target.value })}
                  placeholder="Spoken words only…"
                  className="min-h-[88px] text-xs rounded-lg"
                />
                {words > 0 && (
                  <p className={`text-[10px] ${readSecs > 30 ? "text-destructive" : "text-muted-foreground"}`}>
                    {words} words · ~{readSecs}s spoken{readSecs > 30 ? " — over the 30s ceiling, trim it" : ""}
                  </p>
                )}
              </div>

              {/* Video prompt */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Video prompt</span>
                <Textarea
                  value={c.videoPrompt}
                  onChange={(e) => patch(t.id, { videoPrompt: e.target.value })}
                  placeholder="Camera, motion, wardrobe, location, audio…"
                  className="min-h-[64px] text-xs rounded-lg"
                />
              </div>

              {/* First frame */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">First frame</span>
                {c.frameUrl ? (
                  <div className="relative rounded-lg overflow-hidden bg-muted/30 aspect-video">
                    <img src={c.frameUrl} alt="First frame" className="w-full h-full object-cover" />
                    <Button
                      size="icon" variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/70"
                      onClick={() => patch(t.id, { frameUrl: null })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Textarea
                    value={c.framePrompt}
                    onChange={(e) => patch(t.id, { framePrompt: e.target.value })}
                    placeholder="Describe the opening frame (or leave blank for a sensible default)…"
                    className="min-h-[52px] text-xs rounded-lg"
                  />
                )}
                <div className="flex gap-1.5">
                  <Button
                    size="sm" variant="outline" className="h-7 text-[10px] flex-1"
                    onClick={() => generateFrame(t)} disabled={c.busy !== null}
                  >
                    {c.busy === "frame" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ImagePlus className="h-3 w-3 mr-1" />}
                    Generate frame
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={() => fileRefs.current[t.id]?.click()} disabled={c.busy !== null}
                  >
                    <Upload className="h-3 w-3 mr-1" /> Upload
                  </Button>
                  <input
                    ref={(el) => { fileRefs.current[t.id] = el; }}
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { uploadFrame(t, e.target.files?.[0] || null); e.target.value = ""; }}
                  />
                </div>
              </div>

              {/* Result / generate */}
              {c.videoUrl ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-muted/30 aspect-video">
                    <video src={c.videoUrl} className="w-full h-full object-cover" controls playsInline />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm" className="h-7 text-[10px] flex-1"
                      onClick={() => sendToCreatives(t)} disabled={c.savedToCreatives}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {c.savedToCreatives ? "In Creatives ✓" : "Send to Creatives"}
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 text-[10px]"
                      onClick={() => generateVideo(t)} disabled={c.busy !== null}
                    >
                      Re-render
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm" className="h-8 text-xs w-full"
                  onClick={() => generateVideo(t)}
                  disabled={c.busy !== null || !c.script.trim() || !c.videoPrompt.trim()}
                >
                  {c.busy === "video" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Rendering — up to a few minutes…</>
                  ) : (
                    <><Play className="h-3.5 w-3.5 mr-1.5" /> Generate video{perVideoEstimate.known && perVideoEstimate.usd != null ? ` · ${fmtMoney(perVideoEstimate.usd)}` : ""}</>
                  )}
                </Button>
              )}

              {c.error && <p className="text-[10px] text-destructive">{c.error}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
