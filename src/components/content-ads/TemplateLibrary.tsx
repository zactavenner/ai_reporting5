import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, Trash2, Link2, Film, ImageIcon, Play } from "lucide-react";
import { toast } from "sonner";

/**
 * Shared template library for the Content → Video Ads / Static Ads tabs.
 * Backed by the same ai_studio_reference_* tables the AI Studio agents use,
 * so anything uploaded here is immediately visible to (and uploadable by)
 * the agents. client_id NULL rows are the master library across clients.
 */

interface TemplateRow {
  id: string;
  name: string;
  tags: string[] | null;
  url: string;
  poster_url?: string | null;
  storage_path: string | null;
  client_id: string | null;
  source: string | null;
  created_at: string;
}

interface Props {
  kind: "video" | "image";
  clientId: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TemplateLibrary({ kind, clientId, selectedIds, onSelectionChange }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [importing, setImporting] = useState(false);

  const table = kind === "video" ? "ai_studio_reference_videos" : "ai_studio_reference_images";
  const urlField = kind === "video" ? "video_url" : "image_url";
  const queryKey = ["content-ads-templates", kind, clientId];

  const { data: templates = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .or(`client_id.is.null,client_id.eq.${clientId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({ ...r, url: r[urlField] })) as TemplateRow[];
    },
    enabled: !!clientId,
  });

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
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
          tags: ["template"],
          storage_path: path,
          created_by: userId,
          client_id: null, // master library — visible to all clients and agents
          source: "template_upload",
          [urlField]: pub.publicUrl,
        };
        const { error: insErr } = await supabase.from(table as any).insert(row as any);
        if (insErr) throw insErr;
        count++;
      }
      if (count > 0) {
        toast.success(`Added ${count} template${count > 1 ? "s" : ""}`);
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
        body: { url, kind, client_id: null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported "${data?.name || "template"}" from URL`);
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
      onSelectionChange(selectedIds.filter((x) => x !== t.id));
      qc.invalidateQueries({ queryKey });
      toast.success("Template deleted");
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const KindIcon = kind === "video" ? Film : ImageIcon;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <KindIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold">
            {kind === "video" ? "Video templates" : "Static templates"}
          </h3>
          <Badge variant="secondary" className="text-[10px]">{templates.length}</Badge>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={kind === "video" ? "Paste video URL to import…" : "Paste image URL to import…"}
              className="h-8 w-[220px] text-xs rounded-lg"
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
        Select one or more templates to recreate or model. This is the master library — AI agents can see and add to it too.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="aspect-[4/5] animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center">
          <KindIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No templates yet — upload files or paste a URL above to start the library.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {templates.map((t) => {
            const selected = selectedIds.includes(t.id);
            return (
              <Card
                key={t.id}
                className={`overflow-hidden group relative cursor-pointer transition-all ${
                  selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30"
                }`}
                onClick={() => toggle(t.id)}
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1.5 right-1.5 h-7 w-7 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); remove(t); }}
                    disabled={deleting === t.id}
                  >
                    {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                  </Button>
                </div>
                <div className="p-2">
                  <p className="text-[11px] font-medium truncate">{t.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {t.client_id ? "Client template" : "Master library"}
                    {t.source === "url_import" ? " · URL import" : ""}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
