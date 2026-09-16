import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dashboardAuthHeaders, normalizeDashboardError } from "@/lib/dashboardAuthHeaders";
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const scope: Scope = useMemo(
    () => ({ userId, clientId: clientId || null, conversationId: conversationId || null }),
    [userId, clientId, conversationId],
  );
  const scopeKey = `${scope.clientId ?? ""}|${scope.conversationId ?? ""}`;
  const loadedScopeRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --------------------------------------------------------- identity ----- */
  // Reporting signs operators in through the password portal, which stores an
  // agency member id + HMAC dashboard token — most sessions have NO Supabase
  // auth user. Resolve both, in the same order the backend does, and never
  // block the UI on a Supabase user that will not exist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolved: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        resolved = data.user?.id ?? null;
      } catch {
        /* no Supabase session — expected on the portal */
      }
      if (!resolved) {
        try {
          resolved = localStorage.getItem("team_member_id");
        } catch {
          resolved = null;
        }
      }
      if (cancelled) return;
      setUserId(resolved);
      if (!resolved) {
        // Visible, actionable state instead of an endless spinner.
        setLoading(false);
        setLoadError("We could not read your dashboard session. Please sign in again to use Master video.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** All reads/writes go through the guarded edge route (service role behind an
   * identity check), so the tables stay closed to browser roles. */
  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("master-video-generate", {
      body: { clientId: clientId || null, conversationId: conversationId || null, ...payload },
      headers: dashboardAuthHeaders(),
    });
    if (error) throw await normalizeDashboardError(error);
    if ((data as any)?.error) throw new Error(String((data as any).error));
    return data as any;
  }, [clientId, conversationId]);

  /* ------------------------------------------------------------- load ----- */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Reset first so a slow load can never show the previous client's draft.
    setProjectId(null);
    setDraft(createEmptyDraft());
    setApprovals({});
    setGenerations([]);

    (async () => {
      try {
        const res = await call({ action: "load" });
        if (cancelled) return;
        if (res?.project) {
          setProjectId(res.project.id);
          setDraft(clampRenderSettings({ ...createEmptyDraft(), ...((res.project.draft as any) || {}) }));
          setApprovals(((res.project.approvals as any) || {}) as MasterVideoApprovals);
          setGenerations((res.generations || []) as MasterVideoGeneration[]);
        }
        loadedScopeRef.current = scopeKey;
      } catch (e: any) {
        if (cancelled) return;
        console.error("master video load failed", e);
        setLoadError(e?.message || "We could not open your video project. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
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
        const res = await call({ action: "save", draft: nextDraft, approvals: nextApprovals });
        if (res?.project?.id) setProjectId(res.project.id);
        setLoadError(null);
      } catch (e: any) {
        console.error("master video save failed", e);
        setLoadError(e?.message || "Your last change could not be saved.");
      } finally {
        setSaving(false);
      }
    },
    [userId, call],
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
    try {
      const res = await call({ action: "load" });
      if (res?.generations) setGenerations(res.generations as MasterVideoGeneration[]);
    } catch (e) {
      console.warn("master video render refresh failed", e);
    }
  }, [projectId, call]);

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
    loadError,
  };
}
