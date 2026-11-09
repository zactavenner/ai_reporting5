import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Lock, Sparkles, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  clipLength, isScriptLockValid, scriptLockHash, scriptStats, targetSeconds, type PacingProfile,
} from "@/lib/influencerStudio";
import { studio, toStudioProject, type ProjectRow } from "./api";

interface Props {
  clientId: string;
  clientName: string;
  offerTitle: string;
  offerDescription: string;
  project: ProjectRow;
  update: (patch: Partial<ProjectRow>) => Promise<ProjectRow | undefined>;
  onProject: (p: ProjectRow) => void;
  onNext: () => void;
}

export function ScriptStage({ clientId, clientName, offerTitle, offerDescription, project, update, onProject, onNext }: Props) {
  const [hook, setHook] = useState(project.hook);
  const [mechanism, setMechanism] = useState(project.mechanism);
  const [cta, setCta] = useState(project.cta);
  const [script, setScript] = useState(project.script);
  const [busy, setBusy] = useState<null | "write" | "lock">(null);
  const [readBack, setReadBack] = useState(false);
  useEffect(() => { setScript(project.script); }, [project.script]);

  const pacing = (project.pacing || {}) as PacingProfile;
  const studioProject = { ...toStudioProject(project), script };
  const seconds = project.render_mode === "motion_swap"
    ? clipLength(Number(project.clip_start_s), Number(project.clip_end_s))
    : targetSeconds(studioProject);
  const stats = scriptStats(script, seconds, pacing.wordsPerMinute);
  const locked = isScriptLockValid(project);

  const saveField = (patch: Partial<ProjectRow>) => update(patch);

  const write = async () => {
    setBusy("write");
    try {
      const prompt = [
        "You write spoken scripts for raw, selfie-style creator ads (a real person talking to their phone). Reply with JSON only:",
        '{"hook": "first line, under 12 words", "mechanism": "one sentence on how it works", "cta": "one short call to action", "script": "the exact spoken words, hook first"}',
        "",
        `Length: at most ${stats.budget} words so it fits ${seconds}s at the creator's pace. Count carefully.`,
        `Client: ${clientName}.`,
        `Offer: ${offerTitle || "(not set)"}${offerDescription ? ` — ${offerDescription.slice(0, 600)}` : ""}`,
        pacing.hookStyle ? `Hook style to copy from the reference: ${pacing.hookStyle}.` : "",
        pacing.energy ? `Delivery energy: ${pacing.energy}.` : "",
        hook.trim() ? `Use this hook (you may tighten it): ${hook.trim()}` : "",
        mechanism.trim() ? `Mechanism to explain: ${mechanism.trim()}` : "",
        cta.trim() ? `Call to action: ${cta.trim()}` : "",
        "",
        "Sound like a person, not an ad: contractions, short sentences, one idea per line.",
        "Never invent returns, guarantees, numbers, testimonials or proof that were not given. Say 'targeted returns', never 'guaranteed'.",
        "Spoken words only — no stage directions, no emoji, no hashtags, no captions.",
      ].filter(Boolean).join("\n");
      const { data, error } = await supabase.functions.invoke("generate-ad-script", { body: { prompt } });
      if (error) throw error;
      const next = String(data?.script || "").trim();
      if (!next) throw new Error("empty");
      const patch: Partial<ProjectRow> = {
        script: next,
        hook: String(data?.hook || hook).trim(),
        mechanism: String(data?.mechanism || mechanism).trim(),
        cta: String(data?.cta || cta).trim(),
      };
      setScript(next);
      setHook(patch.hook!);
      setMechanism(patch.mechanism!);
      setCta(patch.cta!);
      await update(patch);
    } catch {
      toast.error("Could not draft the script — write it yourself or try again");
    } finally {
      setBusy(null);
    }
  };

  const lock = async () => {
    setBusy("lock");
    try {
      if (script !== project.script) await update({ script });
      const { project: p } = await studio<{ project: ProjectRow }>("lock_script", {
        id: project.id, clientId, confirmHash: scriptLockHash(script),
      });
      onProject(p);
      setReadBack(false);
      toast.success("Script locked word-for-word");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not lock the script");
    } finally {
      setBusy(null);
    }
  };

  const unlock = async () => {
    try {
      const { project: p } = await studio<{ project: ProjectRow }>("unlock_script", { id: project.id, clientId });
      onProject(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlock");
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Card className="p-4 space-y-2.5">
        <h2 className="text-sm font-semibold">Angle</h2>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Hook</span>
          <Input value={hook} onChange={(e) => setHook(e.target.value)} onBlur={() => hook !== project.hook && saveField({ hook })} placeholder="e.g. I almost didn't post this…" className="h-8 text-xs rounded-lg" disabled={locked} />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Mechanism</span>
          <Textarea value={mechanism} onChange={(e) => setMechanism(e.target.value)} onBlur={() => mechanism !== project.mechanism && saveField({ mechanism })} placeholder="How the offer actually works, in one line" className="min-h-[64px] text-xs rounded-lg" disabled={locked} />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Call to action</span>
          <Input value={cta} onChange={(e) => setCta(e.target.value)} onBlur={() => cta !== project.cta && saveField({ cta })} placeholder="e.g. Tap the link to see if you qualify" className="h-8 text-xs rounded-lg" disabled={locked} />
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] space-y-0.5">
          <p><span className="text-muted-foreground">Fits:</span> {seconds}s · ~{stats.budget} words at {pacing.wordsPerMinute || 160} wpm</p>
          <p><span className="text-muted-foreground">Voice:</span> generated with the video, lip-synced to these exact words</p>
          <p><span className="text-muted-foreground">Offer:</span> {offerTitle || "not set"}</p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Spoken script</h2>
          {locked ? (
            <Badge className="text-[10px]"><Lock className="h-3 w-3 mr-1" />Locked word-for-word</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Not locked</Badge>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={write} disabled={!!busy || locked}>
            {busy === "write" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {script ? "Rewrite" : "Write script"}
          </Button>
        </div>
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          onBlur={() => script !== project.script && update({ script })}
          readOnly={locked}
          placeholder="The exact words the character says…"
          className="min-h-[200px] text-sm leading-relaxed rounded-lg"
        />
        {script.trim() && (
          <p className={`text-[11px] ${stats.over ? "text-destructive" : "text-muted-foreground"}`}>
            {stats.words} / {stats.budget} words · ~{stats.readSeconds}s spoken
            {stats.over ? ` — too long for the ${seconds}s clip, trim it` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {locked ? (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={unlock} disabled={project.status === "rendering"}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock to edit
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={() => setReadBack(true)} disabled={!script.trim() || stats.over || !!busy}>
              <Lock className="h-3.5 w-3.5 mr-1" /> Read back & lock
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={onNext}>
            Next: render <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </Card>

      <Dialog open={readBack} onOpenChange={setReadBack}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Read it back before locking</DialogTitle>
            <DialogDescription>The video will say exactly these words and nothing else. Any later edit unlocks it.</DialogDescription>
          </DialogHeader>
          <blockquote className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">{script.trim()}</blockquote>
          <p className="text-[11px] text-muted-foreground">{stats.words} words · ~{stats.readSeconds}s</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReadBack(false)}>Keep editing</Button>
            <Button onClick={lock} disabled={busy === "lock"}>
              {busy === "lock" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
              These are the exact words
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
