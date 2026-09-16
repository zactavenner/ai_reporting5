import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  createEmptyDraft,
  clampRenderSettings,
  frameApprovalHash,
  scriptApprovalHash,
  type MasterVideoApprovals,
  type MasterVideoDraft,
} from "@/lib/masterVideo";

export type MasterVideoGeneration = {
  id: string;
  status: string;
  model: string | null;
  resolution: string | null;
  aspect_ratio: string | null;
  duration_seconds: number | null;
  provider_job_id: string | null;
  canvas_item_id: string | null;
  video_url: string | null;
  error: string | null;
  created_at: string;
};

type Scope = { userId: string | null; clientId: string | null; conversationId: string | null };

/**
 * One recoverable draft per (person, client, thread).
 *
 * Switching client or thread loads a DIFFERENT row — draft and approvals never
 * leak across scopes, which is what stops an approval for one client's offer
 * from authorising another client's render.
 */
export function useMasterVideoProject(clientId: string | null, conversationId: string | null) {
  const [userId, setUserId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MasterVideoDraft>(() => createEmptyDraft());
  const [approvals, setApprovals] = useState<MasterVideoApprovals>({});
  const [generations, setGenerations] = useState<MasterVideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const scope: Scope = useMemo(
    () => ({ userId, clientId: clientId || null, conversationId: conversationId || null }),
    [userId, clientId, conversationId],
  );
  const scopeKey = `${scope.userId ?? ""}|${scope.clientId ?? ""}|${scope.conversationId ?? ""}`;
  const loadedScopeRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  /* ------------------------------------------------------------- load ----- */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    // Reset first so a slow load can never show the previous client's draft.
    setProjectId(null);
    setDraft(createEmptyDraft());
    setApprovals({});
    setGenerations([]);

    (async () => {
      let q = supabase
        .from("ai_studio_video_projects")
        .select("id, draft, approvals")
        .eq("user_id", userId)
        .limit(1);
      q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
      q = conversationId ? q.eq("conversation_id", conversationId) : q.is("conversation_id", null);
      const { data, error } = await q.maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("master video load failed", error);
      } else if (data) {
        setProjectId(data.id);
        setDraft(clampRenderSettings({ ...createEmptyDraft(), ...((data.draft as any) || {}) }));
        setApprovals(((data.approvals as any) || {}) as MasterVideoApprovals);
        const { data: gens } = await supabase
          .from("ai_studio_video_generations")
          .select("id, status, model, resolution, aspect_ratio, duration_seconds, provider_job_id, canvas_item_id, video_url, error, created_at")
          .eq("project_id", data.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!cancelled && gens) setGenerations(gens as MasterVideoGeneration[]);
      }
      loadedScopeRef.current = scopeKey;
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, clientId, conversationId]);

  /* ------------------------------------------------------------- save ----- */
  const persist = useCallback(
    async (nextDraft: MasterVideoDraft, nextApprovals: MasterVideoApprovals) => {
      if (!userId) return;
      setSaving(true);
      try {
        const row = {
          user_id: userId,
          client_id: clientId || null,
          conversation_id: conversationId || null,
          draft: nextDraft as any,
          approvals: nextApprovals as any,
        };
        if (projectId) {
          const { error } = await supabase.from("ai_studio_video_projects").update(row).eq("id", projectId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from("ai_studio_video_projects")
            .insert(row)
            .select("id")
            .single();
          if (error) throw error;
          setProjectId(data.id);
        }
      } catch (e) {
        console.error("master video save failed", e);
      } finally {
        setSaving(false);
      }
    },
    [userId, clientId, conversationId, projectId],
  );

  // Debounced autosave — only after this scope finished loading, so an empty
  // initial draft can never overwrite a saved one.
  useEffect(() => {
    if (loading || loadedScopeRef.current !== scopeKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(draft, approvals), 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, approvals, loading, scopeKey]);

  const update = useCallback((patch: Partial<MasterVideoDraft>) => {
    setDraft((prev) => clampRenderSettings({ ...prev, ...patch }));
  }, []);

  const approveFrame = useCallback(() => {
    setDraft((d) => {
      setApprovals((a) => ({ ...a, frame: { hash: frameApprovalHash(d), at: new Date().toISOString(), by: userId } }));
      return d;
    });
  }, [userId]);

  const approveScript = useCallback(() => {
    setDraft((d) => {
      setApprovals((a) => ({ ...a, script: { hash: scriptApprovalHash(d), at: new Date().toISOString(), by: userId } }));
      return d;
    });
  }, [userId]);

  const clearApproval = useCallback((key: "frame" | "script") => {
    setApprovals((a) => {
      const next = { ...a };
      delete next[key];
      return next;
    });
  }, []);

  const refreshGenerations = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("ai_studio_video_generations")
      .select("id, status, model, resolution, aspect_ratio, duration_seconds, provider_job_id, canvas_item_id, video_url, error, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setGenerations(data as MasterVideoGeneration[]);
  }, [projectId]);

  /** Flushes pending edits so the server reads the same content the operator sees. */
  const saveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(draft, approvals);
  }, [persist, draft, approvals]);

  const reset = useCallback(async () => {
    const empty = createEmptyDraft();
    setDraft(empty);
    setApprovals({});
    await persist(empty, {});
    toast.success("Started a fresh video project");
  }, [persist]);

  return {
    userId,
    projectId,
    draft,
    approvals,
    generations,
    loading,
    saving,
    update,
    approveFrame,
    approveScript,
    clearApproval,
    refreshGenerations,
    saveNow,
    reset,
  };
}
