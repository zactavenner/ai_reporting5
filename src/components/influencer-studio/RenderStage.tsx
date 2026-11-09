import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Download, Loader2, Send, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  defaultModelForMode, modelsForMode, renderBlockers, renderDuration, studioCostEstimate,
  swapModel, targetSeconds, type RenderMode, type StageKey,
} from "@/lib/influencerStudio";
import { modelSpec } from "@/lib/masterVideo";
import { studio, toStudioCharacter, toStudioProject, StudioError, type CharacterRow, type ProjectRow } from "./api";

interface Props {
  clientId: string;
  project: ProjectRow;
  character: CharacterRow | null;
  enabledVideoModels: string[];
  update: (patch: Partial<ProjectRow>) => Promise<ProjectRow | undefined>;
  onProject: (p: ProjectRow) => void;
  onGoTo: (s: StageKey) => void;
}

const STAGE_FOR: Array<[RegExp, StageKey]> = [
  [/clip/i, "reference"],
  [/character|portrait|turnaround/i, "character"],
  [/script|words/i, "script"],
];

export function RenderStage({ clientId, project, character, enabledVideoModels, update, onProject, onGoTo }: Props) {
  const mode = (project.render_mode as RenderMode) || "motion_swap";
  const model = project.model && swapModel(project.model)?.modes.includes(mode) ? project.model : defaultModelForMode(mode);
  const spec = modelSpec(model);
  const resolution = spec.resolutions.includes(project.resolution) ? project.resolution : (spec.resolutions.includes("720p") ? "720p" : spec.resolutions[0]);
  const aspect = project.aspect_ratio === "16:9" ? "16:9" : "9:16";
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<null | "render" | "send">(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<number | null>(null);

  const sp = toStudioProject(project);
  const ch = toStudioCharacter(character);
  const opts = { model, resolution, aspectRatio: aspect };
  const blockers = renderBlockers({ ...sp, status: project.status === "rendering" ? "rendering" : "draft" }, ch, opts);
  const enabled = enabledVideoModels.includes(model);
  const seconds = renderDuration(model, targetSeconds(sp));
  const cost = studioCostEstimate(model, resolution, seconds);

  // Poll while rendering.
  useEffect(() => {
    if (project.status !== "rendering") return;
    const started = Date.parse(project.render_started_at || "") || Date.now();
    const tick = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    const poll = async () => {
      try {
        const { project: p } = await studio<{ project: ProjectRow }>("poll", { id: project.id, clientId });
        onProject(p);
        if (p.status === "ready") toast.success("Render finished");
        if (p.status === "failed") toast.error(p.error || "Render failed");
      } catch { /* keep polling */ }
    };
    pollRef.current = window.setInterval(poll, 8000);
    poll();
    return () => {
      window.clearInterval(tick);
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.status, project.id]);

  const setMode = (m: RenderMode) => {
    if (!m || m === mode) return;
    const nextModel = swapModel(project.model)?.modes.includes(m) ? project.model : defaultModelForMode(m);
    update({ render_mode: m, model: nextModel });
  };

  const render = async () => {
    setConfirm(false);
    setBusy("render");
    try {
      const { project: p } = await studio<{ project: ProjectRow }>("render", {
        id: project.id, clientId, model, resolution, aspectRatio: aspect,
      });
      onProject(p);
      toast.success("Render started — this usually takes 1–5 minutes");
    } catch (e) {
      const err = e as StudioError;
      toast.error(err.blockers?.length ? err.blockers[0] : err.message);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    try {
      const { project: p } = await studio<{ project: ProjectRow }>("send_to_creatives", { id: project.id, clientId });
      onProject(p);
      toast.success("Sent to Creatives for review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(null);
    }
  };

  const rendering = project.status === "rendering";

  return (
    <div className="grid gap-3 lg:grid-cols-[380px_1fr]">
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Engine</h2>
        <ToggleGroup type="single" value={mode} onValueChange={(v) => setMode(v as RenderMode)} className="grid grid-cols-2 gap-1.5" disabled={rendering}>
          <ToggleGroupItem value="motion_swap" className="h-auto py-2 flex-col items-start text-left rounded-lg border data-[state=on]:border-primary">
            <span className="text-xs font-medium">Motion swap</span>
            <span className="text-[10px] text-muted-foreground font-normal">Copies the clip's moves & pacing</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="character_only" className="h-auto py-2 flex-col items-start text-left rounded-lg border data-[state=on]:border-primary">
            <span className="text-xs font-medium">Character only</span>
            <span className="text-[10px] text-muted-foreground font-normal">Starts from the portrait</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Model</span>
          <Select value={model} onValueChange={(v) => update({ model: v })} disabled={rendering}>
            <SelectTrigger className="h-9 text-xs rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              {modelsForMode(mode).map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}{enabledVideoModels.includes(m.value) ? "" : " · not enabled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">{swapModel(model)?.note}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={resolution} onValueChange={(v) => update({ resolution: v })} disabled={rendering}>
            <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              {spec.resolutions.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={aspect} onValueChange={(v) => update({ aspect_ratio: v })} disabled={rendering}>
            <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="9:16" className="text-xs">9:16 vertical</SelectItem>
              <SelectItem value="16:9" className="text-xs">16:9 wide</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] space-y-0.5">
          <p><span className="text-muted-foreground">Length:</span> {seconds}s</p>
          <p>
            <span className="text-muted-foreground">Cost:</span>{" "}
            {cost.known ? `about $${cost.usd!.toFixed(2)} (list price)` : "billed by video tokens — exact cost shows on the provider bill"}
          </p>
          <p><span className="text-muted-foreground">Character:</span> {character?.name || "none"}</p>
        </div>

        {!enabled && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] flex gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>{spec.label} isn't enabled for spending yet. Ask an admin to turn it on, or pick an enabled model.</span>
          </div>
        )}

        {blockers.length > 0 && (
          <ul className="space-y-1">
            {blockers.map((b) => {
              const target = STAGE_FOR.find(([re]) => re.test(b))?.[1];
              return (
                <li key={b} className="text-[11px] flex items-start gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  {target ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onGoTo(target)}>{b}</button>
                  ) : b}
                </li>
              );
            })}
          </ul>
        )}

        <Button className="w-full h-9 text-sm" onClick={() => setConfirm(true)} disabled={rendering || !!busy || blockers.length > 0 || !enabled}>
          {busy === "render" || rendering ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
          {rendering ? `Rendering… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : project.video_url ? "Render again" : "Render"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Output</h2>
          {project.status === "ready" && <Badge variant="secondary" className="text-[10px]">Ready</Badge>}
          {project.status === "failed" && <Badge variant="destructive" className="text-[10px]">Failed</Badge>}
          {project.creative_id && <Badge className="text-[10px]"><Check className="h-3 w-3 mr-1" />In Creatives</Badge>}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Thumb label="Reference clip" kind="video" url={project.clip_url} />
          <Thumb label="Character" kind="image" url={character?.image_url || null} />
          <Thumb label="Result" kind="video" url={project.video_url} pending={rendering} />
        </div>

        {project.status === "failed" && project.error && (
          <p className="text-[11px] text-destructive">{project.error}</p>
        )}

        {project.video_url && project.status === "ready" && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={send} disabled={!!busy || !!project.creative_id}>
              {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              {project.creative_id ? "Sent to Creatives" : "Send to Creatives"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
              <a href={project.video_url} download target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5 mr-1" /> Download</a>
            </Button>
          </div>
        )}
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a paid render?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>{mode === "motion_swap" ? "Motion swap" : "Character only"} · {spec.label} · {resolution} · {aspect} · {seconds}s</p>
                <p>Character: {character?.name}</p>
                <p>{cost.known ? `Estimated cost: about $${cost.usd!.toFixed(2)}` : "Cost: billed by video tokens, shown on the provider bill."}</p>
                <p className="text-muted-foreground">The character says the locked script word-for-word and nothing else.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={render}>Render</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Thumb({ label, kind, url, pending }: { label: string; kind: "image" | "video"; url: string | null; pending?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="aspect-[9/16] rounded-lg overflow-hidden bg-muted/40 grid place-items-center">
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : url ? (
          kind === "video" ? (
            <video src={url} className="w-full h-full object-cover" controls playsInline preload="metadata" />
          ) : (
            <img src={url} alt={label} className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
