import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Link2, Loader2, Scissors, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CLIP_DEFAULT_S, CLIP_MAX_S, clipLength, clipProblem, type PacingProfile } from "@/lib/influencerStudio";
import { cutClip } from "./clipCutter";
import type { ProjectRow } from "./api";

interface Props {
  clientId: string;
  project: ProjectRow;
  update: (patch: Partial<ProjectRow>) => Promise<ProjectRow | undefined>;
  onNext: () => void;
}

type RefVideo = {
  id: string;
  name: string;
  video_url: string;
  poster_url: string | null;
  view_count: number | null;
  library: string | null;
  client_id: string | null;
};

const CAMERA_PRESETS = ["Handheld selfie at arm's length", "Phone propped on a desk", "Car dashboard mount", "Mirror selfie", "Walking and talking"];

export function ReferenceStage({ clientId, project, update, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [range, setRange] = useState<[number, number]>([Number(project.clip_start_s) || 0, Number(project.clip_end_s) || CLIP_DEFAULT_S]);
  const [urlDraft, setUrlDraft] = useState("");
  const [busy, setBusy] = useState<null | "upload" | "cut">(null);
  const [progress, setProgress] = useState(0);
  const pacing = (project.pacing || {}) as PacingProfile;
  const [pace, setPace] = useState<PacingProfile>(pacing);
  useEffect(() => setPace((project.pacing || {}) as PacingProfile), [project.pacing]);

  const library = useQuery({
    queryKey: ["influencer-ref-library", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_studio_reference_videos")
        .select("id, name, video_url, poster_url, view_count, library, client_id")
        .or(`client_id.is.null,client_id.eq.${clientId}`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data || []) as RefVideo[];
    },
  });

  const len = clipLength(range[0], range[1]);
  const problem = clipProblem(range[0], range[1]);
  const savedRangeChanged = range[0] !== Number(project.clip_start_s) || range[1] !== Number(project.clip_end_s);

  const pickReference = (v: { id?: string | null; url: string; poster?: string | null }) => {
    setRange([0, CLIP_DEFAULT_S]);
    update({
      reference_video_id: v.id || null,
      reference_url: v.url,
      reference_poster_url: v.poster || null,
      clip_url: null,
      clip_start_s: 0,
      clip_end_s: CLIP_DEFAULT_S,
    });
  };

  const onLoaded = () => {
    const d = videoRef.current?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) return;
    setDuration(d);
    setRange(([s, e]) => {
      const start = Math.min(s, Math.max(0, d - 2));
      const end = Math.min(Math.max(e, start + 2), d, start + CLIP_MAX_S);
      return [Math.round(start * 10) / 10, Math.round(end * 10) / 10];
    });
  };

  const onSlide = (v: number[]) => {
    let [s, e] = v as [number, number];
    if (e - s > CLIP_MAX_S) {
      // Keep the window at the cap, following whichever thumb moved.
      if (s !== range[0]) e = s + CLIP_MAX_S; else s = e - CLIP_MAX_S;
    }
    setRange([Math.round(s * 10) / 10, Math.round(e * 10) / 10]);
    if (videoRef.current && s !== range[0]) videoRef.current.currentTime = s;
  };

  const preview = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = range[0];
    v.play();
    const stop = () => {
      if (v.currentTime >= range[1]) { v.pause(); v.removeEventListener("timeupdate", stop); }
    };
    v.addEventListener("timeupdate", stop);
  };

  const uploadReference = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Pick a video file"); return; }
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `influencer-studio/refs/${clientId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("creatives").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from("creatives").getPublicUrl(path).data.publicUrl;
      pickReference({ url });
      toast.success("Reference uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const cut = async () => {
    if (!project.reference_url || problem) return;
    setBusy("cut");
    setProgress(0);
    try {
      let source: Blob;
      try {
        const r = await fetch(project.reference_url);
        if (!r.ok) throw new Error(String(r.status));
        source = await r.blob();
      } catch {
        throw new Error("This link can't be read from the browser — download the video and upload the file instead.");
      }
      const clip = await cutClip(source, range[0], len, setProgress);
      const path = `influencer-studio/clips/${clientId}/${crypto.randomUUID()}.mp4`;
      const { error } = await supabase.storage.from("creatives").upload(path, clip, { contentType: "video/mp4" });
      if (error) throw error;
      const url = supabase.storage.from("creatives").getPublicUrl(path).data.publicUrl;
      await update({ clip_url: url, clip_start_s: range[0], clip_end_s: range[1] });
      toast.success(`${len}s motion clip ready`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cut the clip");
    } finally {
      setBusy(null);
    }
  };

  const savePace = (next: PacingProfile) => {
    setPace(next);
    update({ pacing: next as unknown as ProjectRow["pacing"] });
  };

  const refs = library.data || [];
  const selectedId = project.reference_video_id;
  const sorted = useMemo(
    () => refs.slice().sort((a, b) => (b.view_count || 0) - (a.view_count || 0)),
    [refs],
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Pick the viral clip to model</h2>
            <p className="text-[11px] text-muted-foreground">From your reference library, a direct video link, or an upload.</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Upload video
          </Button>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { uploadReference(e.target.files?.[0] || null); e.target.value = ""; }} />
        </div>

        <div className="flex gap-2">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Paste a direct .mp4 link…"
            className="h-8 text-xs rounded-lg"
          />
          <Button
            size="sm" variant="secondary" className="h-8 text-xs"
            disabled={!/^https:\/\//i.test(urlDraft.trim())}
            onClick={() => { pickReference({ url: urlDraft.trim() }); setUrlDraft(""); }}
          >
            <Link2 className="h-3.5 w-3.5 mr-1" /> Use link
          </Button>
        </div>

        {library.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading library…</p>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No reference videos yet — add some under Video Ads → Templates, or upload one here.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2 max-h-[280px] overflow-y-auto pr-1">
            {sorted.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pickReference({ id: v.id, url: v.video_url, poster: v.poster_url })}
                className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-muted/40 border-2 ${selectedId === v.id ? "border-primary" : "border-transparent hover:border-border"}`}
                title={v.name}
              >
                {v.poster_url ? (
                  <img src={v.poster_url} alt={v.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <video src={v.video_url} className="w-full h-full object-cover" muted preload="metadata" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-background/90 to-transparent">
                  <p className="text-[9px] font-medium truncate">{v.name}</p>
                  {v.view_count != null && <p className="text-[9px] text-muted-foreground">{v.view_count.toLocaleString()} views</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Motion cut</h2>
            {project.clip_url && !savedRangeChanged && <Badge variant="secondary" className="text-[10px]">Clip saved · {clipLength(Number(project.clip_start_s), Number(project.clip_end_s))}s</Badge>}
          </div>
          {project.reference_url ? (
            <>
              <div className="relative rounded-lg overflow-hidden bg-muted/30 aspect-[9/16] max-h-[420px] mx-auto">
                <video
                  ref={videoRef}
                  src={project.reference_url}
                  className="w-full h-full object-contain"
                  controls
                  playsInline
                  onLoadedMetadata={onLoaded}
                />
                <Button
                  size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6 bg-background/70"
                  onClick={() => update({ reference_video_id: null, reference_url: null, reference_poster_url: null, clip_url: null })}
                  aria-label="Remove reference"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {duration > 0 && (
                <div className="space-y-2">
                  <Slider min={0} max={Math.round(duration * 10) / 10} step={0.1} value={range} onValueChange={onSlide} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{range[0].toFixed(1)}s → {range[1].toFixed(1)}s</span>
                    <span className={problem ? "text-destructive" : "font-medium"}>{len}s{problem ? ` · ${problem}` : ""}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={preview} disabled={!duration}>Preview cut</Button>
                <Button size="sm" className="h-8 text-xs flex-1" onClick={cut} disabled={!!busy || !!problem || !duration}>
                  {busy === "cut" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Scissors className="h-3.5 w-3.5 mr-1" />}
                  {project.clip_url && !savedRangeChanged ? "Re-cut clip" : `Cut ${len}s clip`}
                </Button>
              </div>
              {busy === "cut" && (
                <div className="space-y-1">
                  <Progress value={progress * 100} className="h-1" />
                  <p className="text-[10px] text-muted-foreground">First cut loads the video tool (~30MB), then it's quick.</p>
                </div>
              )}
              {project.clip_url && savedRangeChanged && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">You moved the window — re-cut to use it.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Pick a reference to set the start and end of the motion you want to copy.</p>
          )}
        </Card>

        <Card className="p-4 space-y-2.5">
          <h2 className="text-sm font-semibold">Pacing profile</h2>
          <div className="grid grid-cols-2 gap-2">
            <Select value={pace.energy || "conversational"} onValueChange={(v) => savePace({ ...pace, energy: v as PacingProfile["energy"] })}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="calm" className="text-xs">Calm, measured</SelectItem>
                <SelectItem value="conversational" className="text-xs">Conversational</SelectItem>
                <SelectItem value="high" className="text-xs">High energy</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number" min={90} max={240}
              value={pace.wordsPerMinute ?? ""}
              placeholder="Words/min (160)"
              onChange={(e) => setPace({ ...pace, wordsPerMinute: e.target.value ? Number(e.target.value) : undefined })}
              onBlur={() => savePace(pace)}
              className="h-8 text-xs rounded-lg"
            />
          </div>
          <Select value={CAMERA_PRESETS.includes(pace.camera || "") ? pace.camera : undefined} onValueChange={(v) => savePace({ ...pace, camera: v })}>
            <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder={pace.camera || "Camera style"} /></SelectTrigger>
            <SelectContent>
              {CAMERA_PRESETS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {([
            ["gestures", "Gestures (e.g. counts on fingers, leans in)"],
            ["setting", "Setting (e.g. messy bedroom, parked car)"],
            ["hookStyle", "Hook style (e.g. confession, pattern interrupt)"],
            ["audio", "Audio notes (e.g. room echo, no music)"],
          ] as const).map(([k, ph]) => (
            <Input
              key={k}
              value={(pace[k] as string) || ""}
              placeholder={ph}
              onChange={(e) => setPace({ ...pace, [k]: e.target.value })}
              onBlur={() => savePace(pace)}
              className="h-8 text-xs rounded-lg"
            />
          ))}
          <Button size="sm" variant="ghost" className="h-8 text-xs w-full" onClick={onNext}>
            Next: character <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
