import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Trash2, Link2, Film, ImageIcon, Play, Eye, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Shared media libraries for the Content → Video Ads / Static Ads tabs.
 * Backed by the same ai_studio_reference_* tables the AI Studio agents use,
 * so anything added here is immediately visible to (and addable by) agents.
 *
 * Two libraries per media kind:
 *  - "reference": new finds worth testing (e.g. an agent spotted a video with
 *    1M+ views). Carries the view count and the instructions that travel with
 *    the video prompt when it is recreated.
 *  - "template": proven converters we replicate or re-skin with new avatars.
 *
 * client_id NULL rows are the master library across clients.
 */

export type LibraryKind = "reference" | "template";

interface TemplateRow {
  id: string;
  name: string;
  tags: string[] | null;
  url: string;
  poster_url?: string | null;
  storage_path: string | null;
  client_id: string | null;
  source: string | null;
  library: LibraryKind;
  view_count: number | null;
  instructions: string | null;
  created_at: string;
}

interface Props {
  kind: "video" | "image";
  clientId: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[], rows?: TemplateRow[]) => void;
  /** Cap on simultaneous selection (the pipeline renders one column per pick). */
  maxSelected?: number;
}

const fmtViews = (n: number | null) => {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${n} views`;
};

export function TemplateLibrary({ kind, clientId, selectedIds, onSelectionChange, maxSelected = 3 }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [targetLibrary, setTargetLibrary] = useState<LibraryKind>("template");
  const [editing, setEditing] = useState<string | null>(null);
  const [editViews, setEditViews] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const table = kind === "video" ? "ai_studio_reference_videos" : "ai_studio_reference_images";
  const urlField = kind === "video" ? "video_url" : "image_url";
  const queryKey = ["content-ads-templates", kind, clientId];

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .or(`client_id.is.null,client_id.eq.${clientId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ...r,
        url: r[urlField],
        library: (r.library === "reference" ? "reference" : "template") as LibraryKind,
      })) as TemplateRow[];
    },
    enabled: !!clientId,
  });

  const references = rows.filter((r) => r.library === "reference");
  const templates = rows.filter((r) => r.library !== "reference");

  const emit = (ids: string[]) =>
    onSelectionChange(ids, rows.filter((r) => ids.includes(r.id)));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      emit(selectedIds.filter((x) => x !== id));
      return;
    }
    if (selectedIds.length >= maxSelected) {
      toast.info(`Pick up to ${maxSelected} at a time — one column each`);
      return;
    }
    emit([...selectedIds, id]);
  };

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const userId = sess.user?.id || null;
      let count = 0;
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        if (kind === "video" && !isVideo) continue;
        if (kind === "image" && !file.type.startsWith("image/")) continue;
        const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "png");
        const path = `ai-studio/references/${userId || "anon"}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("creatives")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("creatives").getPublicUrl(path);
        const row: Record<string, unknown> = {
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
          tags: [targetLibrary],
          storage_path: path,
          created_by: userId,
          client_id: null, // master library — visible to all clients and agents
          source: "template_upload",
          library: targetLibrary,
          [urlField]: pub.publicUrl,
        };
        const { error: insErr } = await supabase.from(table as any).insert(row as any);
        if (insErr) throw insErr;
        count++;
      }
      if (count > 0) {
        toast.success(`Added ${count} to ${targetLibrary === "reference" ? "References" : "Templates"}`);
        qc.invalidateQueries({ queryKey });
      } else {
        toast.info(`Only ${kind} files can be added here`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importFromUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("template-url-import", {
        body: { url, kind, client_id: null, library: targetLibrary },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported "${data?.name || "media"}" into ${targetLibrary === "reference" ? "References" : "Templates"}`);
      setUrlInput("");
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e?.message || "URL import failed");
    } finally {
      setImporting(false);
    }
  };

  const remove = async (t: TemplateRow) => {
    setDeleting(t.id);
    try {
      const { error } = await supabase.from(table as any).delete().eq("id", t.id);
      if (error) throw error;
      if (t.storage_path) {
        try { await supabase.storage.from("creatives").remove([t.storage_path]); } catch {}
      }
      emit(selectedIds.filter((x) => x !== t.id));
      qc.invalidateQueries({ queryKey });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (t: TemplateRow) => {
    setEditing(t.id);
    setEditViews(t.view_count != null ? String(t.view_count) : "");
    setEditInstructions(t.instructions || "");
  };

  const saveEdit = async (t: TemplateRow) => {
    setSavingEdit(true);
    try {
      const views = editViews.trim() ? Math.max(0, parseInt(editViews.replace(/[^\d]/g, ""), 10) || 0) : null;
      const { error } = await supabase
        .from(table as any)
        .update({ view_count: views, instructions: editInstructions.trim() || null } as any)
        .eq("id", t.id);
      if (error) throw error;
      setEditing(null);
      qc.invalidateQueries({ queryKey });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const KindIcon = kind === "video" ? Film : ImageIcon;

  const renderGrid = (items: TemplateRow[], library: LibraryKind) => (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((t) => {
        const selected = selectedIds.includes(t.id);
        const isEditing = editing === t.id;
        return (
          <Card
            key={t.id}
            className={`overflow-hidden group relative cursor-pointer transition-all ${
              selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30"
            }`}
            onClick={() => !isEditing && toggle(t.id)}
          >
            <div className="relative aspect-[4/5] bg-muted/30">
              {kind === "video" ? (
                <div className="w-full h-full relative">
                  {t.poster_url ? (
                    <img src={t.poster_url} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <video src={t.url} className="w-full h-full object-cover" muted preload="metadata" />
                  )}
                  <div className="absolute inset-0 grid place-items-center pointer-events-none">
                    <div className="h-9 w-9 rounded-full bg-background/70 grid place-items-center">
                      <Play className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                </div>
              ) : (
                <img src={t.url} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
              )}
              <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggle(t.id)}
                  className="bg-background/80 data-[state=checked]:bg-primary"
                />
              </div>
              {t.view_count != null && (
                <Badge className="absolute bottom-1.5 left-1.5 bg-background/80 text-foreground text-[9px] gap-0.5">
                  <Eye className="h-2.5 w-2.5" />
                  {fmtViews(t.view_count)}
                </Badge>
              )}
              <div className="absolute top-1.5 right-1.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => (isEditing ? setEditing(null) : startEdit(t))}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => remove(t)}
                  disabled={deleting === t.id}
                >
                  {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                </Button>
              </div>
            </div>
            <div className="p-2" onClick={(e) => isEditing && e.stopPropagation()}>
              <p className="text-[11px] font-medium truncate">{t.name}</p>
              {isEditing ? (
                <div className="mt-1.5 space-y-1.5">
                  <Input
                    value={editViews}
                    onChange={(e) => setEditViews(e.target.value)}
                    placeholder="View count (e.g. 1200000)"
                    className="h-7 text-[10px] rounded-md"
                    inputMode="numeric"
                  />
                  <Textarea
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    placeholder="Instructions sent with the prompt (hook, pacing, what to copy)…"
                    className="min-h-[52px] text-[10px] rounded-md"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-[10px] flex-1" onClick={() => saveEdit(t)} disabled={savingEdit}>
                      {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-0.5" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditing(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {t.client_id ? "Client" : "Master library"}
                    {t.source === "url_import" ? " · URL import" : ""}
                  </p>
                  {t.instructions && (
                    <p className="text-[9px] text-muted-foreground/80 line-clamp-2 mt-0.5">{t.instructions}</p>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <KindIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold">
            {kind === "video" ? "Video library" : "Static library"}
          </h3>
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex rounded-lg border border-border/60 overflow-hidden">
            {(["reference", "template"] as LibraryKind[]).map((lib) => (
              <button
                key={lib}
                type="button"
                onClick={() => setTargetLibrary(lib)}
                className={`px-2.5 py-1 text-[10px] transition ${
                  targetLibrary === lib
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {lib === "reference" ? "New reference" : "Proven template"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={kind === "video" ? "Paste video URL to import…" : "Paste image URL to import…"}
              className="h-8 w-[200px] text-xs rounded-lg"
              onKeyDown={(e) => { if (e.key === "Enter") importFromUrl(); }}
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={importFromUrl} disabled={importing || !urlInput.trim()}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
              Import
            </Button>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={kind === "video" ? "video/*" : "image/*"}
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Select up to {maxSelected} to recreate side by side. This is the master library — AI agents can see and add to it too.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="aspect-[4/5] animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <KindIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Nothing here yet — upload files or paste a URL above to start the library.
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold">References — new finds to test</h4>
              <Badge variant="outline" className="text-[9px]">{references.length}</Badge>
              <span className="text-[10px] text-muted-foreground">
                sent with the video prompt instructions
              </span>
            </div>
            {references.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 py-2">
                No new references yet. When an agent spots a video worth testing (e.g. 1M+ views), it lands here with its view count.
              </p>
            ) : renderGrid(references, "reference")}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold">Templates — proven converters</h4>
              <Badge variant="outline" className="text-[9px]">{templates.length}</Badge>
              <span className="text-[10px] text-muted-foreground">
                replicate or re-skin with different avatars
              </span>
            </div>
            {templates.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 py-2">
                No proven templates yet.
              </p>
            ) : renderGrid(templates, "template")}
          </div>
        </>
      )}
    </div>
  );
}
