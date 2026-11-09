import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, ImagePlus, LayoutGrid, Loader2, Plus, RotateCcw, Save, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildRawIphonePrompt, buildTurnaroundPrompt, type CharacterBuilder } from "@/lib/influencerStudio";
import { studio, type CharacterRow, type ProjectRow } from "./api";

interface Props {
  clientId: string;
  project: ProjectRow;
  characters: CharacterRow[];
  loading: boolean;
  enabledImageModels: string[];
  update: (patch: Partial<ProjectRow>) => Promise<ProjectRow | undefined>;
  onSaved: () => void;
  onNext: () => void;
}

const IMAGE_MODEL_LABELS: Record<string, string> = {
  "openai/gpt-image-2": "GPT Image 2",
  "google/gemini-3.1-flash-image-preview": "Nano Banana Pro",
};

const FIELDS: Array<[keyof CharacterBuilder, string]> = [
  ["age", "Age (e.g. 24)"],
  ["gender", "Gender (e.g. woman)"],
  ["ethnicity", "Ethnicity / background"],
  ["look", "Face & hair (e.g. freckles, messy brown bun)"],
  ["wardrobe", "Wardrobe (e.g. oversized grey hoodie)"],
  ["setting", "Setting (e.g. dim bedroom, fairy lights)"],
  ["lighting", "Lighting (e.g. warm lamp + window)"],
  ["vibe", "Vibe (e.g. smart, skeptical, finance-curious)"],
];

type Draft = {
  id: string | null;
  name: string;
  builder: CharacterBuilder;
  portraitPrompt: string;
  promptEdited: boolean;
  portraitUrl: string | null;
  sheetUrl: string | null;
  sheetPrompt: string;
};

const emptyDraft = (): Draft => ({
  id: null, name: "", builder: {}, portraitPrompt: buildRawIphonePrompt({}), promptEdited: false,
  portraitUrl: null, sheetUrl: null, sheetPrompt: "",
});

const fromRow = (c: CharacterRow): Draft => ({
  id: c.id,
  name: c.name,
  builder: c.metadata?.builder || {},
  portraitPrompt: c.metadata?.portrait_prompt || buildRawIphonePrompt(c.metadata?.builder || {}),
  promptEdited: true,
  portraitUrl: c.image_url,
  sheetUrl: c.metadata?.sheet_url || null,
  sheetPrompt: c.metadata?.sheet_prompt || "",
});

export function CharacterStage({ clientId, project, characters, loading, enabledImageModels, update, onSaved, onNext }: Props) {
  const selected = characters.find((c) => c.id === project.character_id) || null;
  const [draft, setDraft] = useState<Draft>(() => (selected ? fromRow(selected) : emptyDraft()));
  const [busy, setBusy] = useState<null | "portrait" | "sheet" | "save">(null);
  const [model, setModel] = useState<string>("");
  useEffect(() => {
    if (!model && enabledImageModels.length) setModel(enabledImageModels.includes("openai/gpt-image-2") ? "openai/gpt-image-2" : enabledImageModels[0]);
  }, [enabledImageModels, model]);

  const setField = (k: keyof CharacterBuilder, v: string) =>
    setDraft((d) => {
      const builder = { ...d.builder, [k]: v };
      return { ...d, builder, portraitPrompt: d.promptEdited ? d.portraitPrompt : buildRawIphonePrompt(builder) };
    });

  const dirty = !selected || JSON.stringify(fromRow(selected)) !== JSON.stringify({ ...draft, promptEdited: true });

  const gen = async (kind: "portrait" | "sheet") => {
    if (!model) { toast.error("No image model is enabled for spending"); return; }
    if (kind === "sheet" && !draft.portraitUrl) return;
    setBusy(kind);
    try {
      const prompt = kind === "portrait" ? draft.portraitPrompt : buildTurnaroundPrompt(draft.builder);
      const { imageUrl } = await studio<{ imageUrl: string }>("generate_image", {
        clientId,
        model,
        prompt,
        referenceUrl: kind === "sheet" ? draft.portraitUrl : undefined,
      });
      setDraft((d) =>
        kind === "portrait"
          ? { ...d, portraitUrl: imageUrl, sheetUrl: null, sheetPrompt: "" } // new face → old sheet no longer matches
          : { ...d, sheetUrl: imageUrl, sheetPrompt: prompt },
      );
      toast.success(kind === "portrait" ? "Portrait ready — happy with the face? Build the turnaround." : "Turnaround sheet ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Name the character first"); return; }
    setBusy("save");
    try {
      const { id } = await studio<{ id: string }>("save_character", {
        clientId,
        id: draft.id,
        name: draft.name.trim(),
        builder: draft.builder,
        portraitUrl: draft.portraitUrl,
        portraitPrompt: draft.portraitPrompt,
        sheetUrl: draft.sheetUrl,
        sheetPrompt: draft.sheetPrompt,
      });
      setDraft((d) => ({ ...d, id }));
      onSaved();
      if (project.character_id !== id) await update({ character_id: id });
      toast.success("Saved to the client roster");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the character");
    } finally {
      setBusy(null);
    }
  };

  const choose = async (c: CharacterRow) => {
    setDraft(fromRow(c));
    if (project.character_id !== c.id) await update({ character_id: c.id });
  };

  const archive = async () => {
    if (!draft.id) return;
    try {
      await studio("archive_character", { clientId, id: draft.id });
      if (project.character_id === draft.id) await update({ character_id: null });
      setDraft(emptyDraft());
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive");
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      {/* Roster */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Client roster</h2>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : characters.length === 0 ? (
          <p className="text-xs text-muted-foreground">No characters yet. Build one once and reuse the same face in every ad.</p>
        ) : (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c)}
                className={`w-full flex items-center gap-2 rounded-lg p-1.5 text-left border ${project.character_id === c.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/40"}`}
              >
                <div className="h-12 w-9 rounded-md overflow-hidden bg-muted shrink-0">
                  {c.image_url && <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[c.age_range, c.gender].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {c.metadata?.sheet_url ? (
                  <Badge variant="secondary" className="text-[9px]">Locked</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]">No sheet</Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Builder */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Character name (e.g. Sarah — 24, finance-curious)"
            className="h-9 text-sm rounded-lg max-w-sm"
          />
          {draft.id && project.character_id === draft.id && <Badge className="text-[10px]"><Check className="h-3 w-3 mr-1" />In this ad</Badge>}
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-8 w-[170px] text-xs rounded-lg ml-auto"><SelectValue placeholder="Image model" /></SelectTrigger>
            <SelectContent>
              {enabledImageModels.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">{IMAGE_MODEL_LABELS[m] || m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map(([k, ph]) => (
                <Input
                  key={k}
                  value={draft.builder[k] || ""}
                  onChange={(e) => setField(k, e.target.value)}
                  placeholder={ph}
                  className={`h-8 text-xs rounded-lg ${k === "look" || k === "vibe" ? "col-span-2" : ""}`}
                />
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Raw iPhone prompt</span>
                {draft.promptEdited && (
                  <Button
                    size="sm" variant="ghost" className="h-6 text-[10px]"
                    onClick={() => setDraft((d) => ({ ...d, portraitPrompt: buildRawIphonePrompt(d.builder), promptEdited: false }))}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Rebuild from fields
                  </Button>
                )}
              </div>
              <Textarea
                value={draft.portraitPrompt}
                onChange={(e) => setDraft((d) => ({ ...d, portraitPrompt: e.target.value, promptEdited: true }))}
                className="min-h-[150px] text-xs rounded-lg"
              />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => gen("portrait")} disabled={!!busy}>
                {busy === "portrait" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ImagePlus className="h-3.5 w-3.5 mr-1" />}
                {draft.portraitUrl ? "New portrait" : "Generate portrait"}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => gen("sheet")} disabled={!!busy || !draft.portraitUrl}>
                {busy === "sheet" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <LayoutGrid className="h-3.5 w-3.5 mr-1" />}
                {draft.sheetUrl ? "Rebuild 6-view sheet" : "Build 6-view turnaround"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Each image is one paid generation. A new portrait clears the old turnaround so the face always matches.</p>
          </div>

          <div className="grid grid-cols-[2fr_3fr] gap-2 content-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Portrait</span>
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted/40 grid place-items-center">
                {draft.portraitUrl ? (
                  <a href={draft.portraitUrl} target="_blank" rel="noreferrer"><img src={draft.portraitUrl} alt="Portrait" className="w-full h-full object-cover" /></a>
                ) : (
                  <span className="text-[10px] text-muted-foreground p-2 text-center">Generate the face first</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">6-view turnaround</span>
              <div className="aspect-[3/2] rounded-lg overflow-hidden bg-muted/40 grid place-items-center">
                {draft.sheetUrl ? (
                  <a href={draft.sheetUrl} target="_blank" rel="noreferrer"><img src={draft.sheetUrl} alt="Turnaround" className="w-full h-full object-contain" /></a>
                ) : (
                  <span className="text-[10px] text-muted-foreground p-2 text-center">Locks face, hair and wardrobe for motion swaps</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" className="h-8 text-xs" onClick={save} disabled={!!busy || !draft.name.trim() || !draft.portraitUrl || !dirty && project.character_id === draft.id}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            {draft.id ? "Save & use in this ad" : "Save to roster & use"}
          </Button>
          {draft.id && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={archive}>
              <Archive className="h-3.5 w-3.5 mr-1" /> Archive
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={onNext} disabled={!project.character_id}>
            Next: script <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
