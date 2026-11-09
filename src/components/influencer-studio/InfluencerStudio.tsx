import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Film, Loader2, Plus, Trash2, UserRound, FileText, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClients } from "@/hooks/useClients";
import { useClientOffers } from "@/hooks/useClientOffers";
import { stageStates, type StageKey } from "@/lib/influencerStudio";
import { cn } from "@/lib/utils";
import { studio, toStudioCharacter, toStudioProject, type CharacterRow, type ProjectRow } from "./api";
import { ReferenceStage } from "./ReferenceStage";
import { CharacterStage } from "./CharacterStage";
import { ScriptStage } from "./ScriptStage";
import { RenderStage } from "./RenderStage";

/**
 * Content → AI Influencers. A standalone production line, separate from
 * AI Studio: Reference clip → Character → Script & audio → Render.
 */

const STAGES: Array<{ key: StageKey; n: number; title: string; bullets: string[]; icon: typeof Film }> = [
  { key: "reference", n: 1, title: "Reference Vault", bullets: ["Viral hook / clip", "10s motion cut", "Pacing profile"], icon: Film },
  { key: "character", n: 2, title: "Character Studio", bullets: ["Raw iPhone prompt", "6-view turnaround", "Client roster"], icon: UserRound },
  { key: "script", n: 3, title: "Script & Audio", bullets: ["Spoken DR script", "Hook + mechanism", "Word-for-word lock"], icon: FileText },
  { key: "render", n: 4, title: "Swap Engine", bullets: ["Video-to-video swap", "Motion + lip sync", "Push to Creatives"], icon: Wand2 },
];

export function InfluencerStudio() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const roster = useMemo(
    () => clients.filter((c) => c.status === "active" || c.status === "onboarding").sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem("influencer:last-client") || "");
  const client = roster.find((c) => c.id === clientId) || roster[0];
  const cid = client?.id || "";

  const projectsQ = useQuery({
    queryKey: ["influencer-projects", cid],
    enabled: !!cid,
    queryFn: async () => (await studio<{ projects: ProjectRow[] }>("list", { clientId: cid })).projects,
  });
  const charactersQ = useQuery({
    queryKey: ["influencer-characters", cid],
    enabled: !!cid,
    queryFn: async () => (await studio<{ characters: CharacterRow[] }>("characters", { clientId: cid })).characters,
  });
  const configQ = useQuery({
    queryKey: ["influencer-config"],
    staleTime: 5 * 60_000,
    queryFn: () => studio<{ enabledVideoModels: string[]; enabledImageModels: string[] }>("config"),
  });
  const { data: offers = [] } = useClientOffers(cid || undefined);
  const offer = offers[0] as unknown as { title?: string; name?: string; description?: string } | undefined;

  const projects = projectsQ.data || [];
  const [projectId, setProjectId] = useState<string>("");
  useEffect(() => {
    if (!projects.length) { setProjectId(""); return; }
    if (!projects.some((p) => p.id === projectId)) {
      const saved = localStorage.getItem(`influencer:last-project:${cid}`);
      setProjectId(projects.find((p) => p.id === saved)?.id || projects[0].id);
    }
  }, [projects, projectId, cid]);
  const project = projects.find((p) => p.id === projectId) || null;
  const character = (charactersQ.data || []).find((c) => c.id === project?.character_id) || null;

  const [stage, setStage] = useState<StageKey>("reference");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const states = project ? stageStates(toStudioProject(project), toStudioCharacter(character)) : [];

  const setProjectInCache = (p: ProjectRow) =>
    qc.setQueryData<ProjectRow[]>(["influencer-projects", cid], (prev = []) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i === -1) return [p, ...prev];
      const next = prev.slice();
      next[i] = p;
      return next;
    });

  const update = async (patch: Partial<ProjectRow>) => {
    if (!project) return;
    try {
      const { project: p } = await studio<{ project: ProjectRow }>("update", { id: project.id, clientId: cid, patch });
      setProjectInCache(p);
      return p;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const pickClient = (id: string) => {
    setClientId(id);
    localStorage.setItem("influencer:last-client", id);
    setProjectId("");
    setStage("reference");
  };
  const pickProject = (id: string) => {
    setProjectId(id);
    localStorage.setItem(`influencer:last-project:${cid}`, id);
  };

  const createProject = async () => {
    setBusy("create");
    try {
      const n = projects.length + 1;
      const { project: p } = await studio<{ project: ProjectRow }>("create", { clientId: cid, name: `${client?.name} influencer ad ${n}` });
      setProjectInCache(p);
      pickProject(p.id);
      setStage("reference");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the project");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    if (!project) return;
    setBusy("dup");
    try {
      const { project: p } = await studio<{ project: ProjectRow }>("duplicate", { id: project.id, clientId: cid });
      setProjectInCache(p);
      pickProject(p.id);
      toast.success("Duplicated — swap the character or hook for a new variation");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!project) return;
    try {
      await studio("delete", { id: project.id, clientId: cid });
      qc.setQueryData<ProjectRow[]>(["influencer-projects", cid], (prev = []) => prev.filter((p) => p.id !== project.id));
      setProjectId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => setNameDraft(project?.name || ""), [project?.id, project?.name]);

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight">AI Influencers</h1>
          <p className="text-xs text-muted-foreground">
            Reference clip → locked character → word-for-word script → swap render, straight into Creatives.
          </p>
        </div>
        <Select value={cid} onValueChange={pickClient}>
          <SelectTrigger className="h-9 w-[220px] rounded-lg text-sm"><SelectValue placeholder="Pick a client" /></SelectTrigger>
          <SelectContent>
            {roster.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}{c.status === "onboarding" ? " · onboarding" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Project bar */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        {projects.length > 0 ? (
          <Select value={projectId} onValueChange={pickProject}>
            <SelectTrigger className="h-8 w-[260px] rounded-lg text-xs"><SelectValue placeholder="Pick a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}{p.status === "ready" ? " · ready" : p.status === "rendering" ? " · rendering" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">
            {projectsQ.isLoading ? "Loading projects…" : projectsQ.error ? (projectsQ.error as Error).message : "No influencer ads yet for this client."}
          </span>
        )}
        {project && (
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft.trim() && nameDraft !== project.name && update({ name: nameDraft.trim() })}
            className="h-8 w-[240px] text-xs rounded-lg"
            aria-label="Project name"
          />
        )}
        <div className="ml-auto flex gap-1.5">
          {project && (
            <>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={duplicate} disabled={!!busy}>
                {busy === "dup" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Duplicate
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => setConfirmDelete(true)} disabled={project.status === "rendering"}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={createProject} disabled={!cid || !!busy}>
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            New influencer ad
          </Button>
        </div>
      </Card>

      {project ? (
        <>
          {/* Stepper — mirrors the four-stage blueprint */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {STAGES.map((s) => {
              const st = states.find((x) => x.key === s.key);
              const active = stage === s.key;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStage(s.key)}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold",
                      st?.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}>
                      {st?.done ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span className="text-sm font-medium">{s.title}</span>
                    <Icon className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="text-[11px] text-muted-foreground">• {b}</li>
                    ))}
                  </ul>
                  {st && !st.done && st.missing.length > 0 && (
                    <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 truncate">{st.missing[0]}</p>
                  )}
                </button>
              );
            })}
          </div>

          {stage === "reference" && (
            <ReferenceStage key={project.id} clientId={cid} project={project} update={update} onNext={() => setStage("character")} />
          )}
          {stage === "character" && (
            <CharacterStage
              key={project.id}
              clientId={cid}
              project={project}
              characters={charactersQ.data || []}
              loading={charactersQ.isLoading}
              enabledImageModels={configQ.data?.enabledImageModels || []}
              update={update}
              onSaved={() => qc.invalidateQueries({ queryKey: ["influencer-characters", cid] })}
              onNext={() => setStage("script")}
            />
          )}
          {stage === "script" && (
            <ScriptStage
              key={project.id}
              clientId={cid}
              clientName={client?.name || ""}
              offerTitle={offer?.title || offer?.name || ""}
              offerDescription={offer?.description || ""}
              project={project}
              update={update}
              onProject={setProjectInCache}
              onNext={() => setStage("render")}
            />
          )}
          {stage === "render" && (
            <RenderStage
              key={project.id}
              clientId={cid}
              project={project}
              character={character}
              enabledVideoModels={configQ.data?.enabledVideoModels || []}
              update={update}
              onProject={setProjectInCache}
              onGoTo={setStage}
            />
          )}
        </>
      ) : (
        cid && !projectsQ.isLoading && (
          <Card className="p-10 text-center">
            <UserRound className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">Build a reusable AI influencer for {client?.name}</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Start from a viral clip, lock a character once, then batch new hooks with the same face.
            </p>
            <Button size="sm" onClick={createProject} disabled={!!busy}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New influencer ad
            </Button>
          </Card>
        )
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The project is removed. The character stays in the roster, and anything already sent to Creatives stays there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default InfluencerStudio;
