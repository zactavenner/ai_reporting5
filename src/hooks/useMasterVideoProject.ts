import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dashboardAuthHeaders, normalizeDashboardError } from "@/lib/dashboardAuthHeaders";
import {
  createEmptyDraft,
  clampRenderSettings,
  frameApprovalHash,
  normalizeStoredDraft,
  pushScriptVersion,
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

export type SaveResult = { ok: boolean; projectId: string | null; error?: string };

const ACTIVE = new Set(["queued", "running"]);

/**
 * One recoverable draft per (person, client, thread).
 *
 * Switching client or thread loads a DIFFERENT row — draft and approvals never
 * leak across scopes, which is what stops an approval for one client's offer
 * from authorising another client's render.
 *
 * Everything goes through the guarded `master-video-generate` route: the browser
 * never touches the tables, the portal's dashboard session is the identity, and
 * the server decides what may be read, written or rendered.
 */
export function useMasterVideoProject(clientId: string | null, conversationId: string | null) {
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MasterVideoDraft>(() => createEmptyDraft());
  const [approvals, setApprovals] = useState<MasterVideoApprovals>({});
  const [generations, setGenerations] = useState<MasterVideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);

  const scopeKey = `${clientId ?? ""}|${conversationId ?? ""}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const loadedScopeRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Writes are chained so two autosaves can never land out of order. */
  const writeChain = useRef<Promise<SaveResult>>(Promise.resolve({ ok: true, projectId: null }));
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = projectId;

  /* --------------------------------------------------------- identity ----- */
  // Reporting signs operators in through the password portal, which stores an
  // HMAC dashboard token; most sessions have NO Supabase auth user. The token is
  // the only thing the browser needs — the server verifies it and decides who
  // the owner is, so no browser-supplied id is ever trusted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let present = false;
      try {
        present = !!localStorage.getItem("dashboard_session_token");
      } catch {
        present = false;
      }
      if (!present) {
        try {
          const { data } = await supabase.auth.getUser();
          present = !!data.user?.id;
        } catch {
          present = false;
        }
      }
      if (cancelled) return;
      setHasSession(present);
      setSessionReady(true);
      if (!present) {
        // Visible, actionable state instead of an endless spinner.
        setLoading(false);
        setLoadError("We could not read your dashboard sign-in. Please sign in again to use Master video.");
      }
      try {
        setApprovedBy(localStorage.getItem("team_member_id"));
      } catch { /* nothing to attribute the approval to */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("master-video-generate", {
        body: { clientId: clientId || null, conversationId: conversationId || null, ...payload },
        headers: dashboardAuthHeaders(),
      });
      if (error) throw await normalizeDashboardError(error);
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return data as any;
    },
    [clientId, conversationId],
  );

  /* ------------------------------------------------------------- load ----- */
  useEffect(() => {
    if (!sessionReady || !hasSession) return;
    const scopeAtStart = scopeKey;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    // Reset first so a slow load can never show the previous client's draft.
    setProjectId(null);
    setDraft(createEmptyDraft());
    setApprovals({});
    setGenerations([]);
    loadedScopeRef.current = "";

    (async () => {
      try {
        const res = await call({ action: "load" });
        // Drop an answer that arrived after the operator moved to another client
        // or thread — otherwise one client's draft appears under another.
        if (cancelled || scopeRef.current !== scopeAtStart) return;
        if (res?.project) {
          setProjectId(res.project.id);
          setDraft(normalizeStoredDraft(res.project.draft));
          setApprovals(((res.project.approvals as any) || {}) as MasterVideoApprovals);
          setGenerations((res.generations || []) as MasterVideoGeneration[]);
        }
        loadedScopeRef.current = scopeAtStart;
      } catch (e: any) {
        if (cancelled || scopeRef.current !== scopeAtStart) return;
        console.error("master video load failed", e);
        setLoadError(e?.message || "We could not open your video project. Try again.");
      } finally {
        if (!cancelled && scopeRef.current === scopeAtStart) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, hasSession, clientId, conversationId]);

  /* ------------------------------------------------------------- save ----- */
  /**
   * Serialised save. A failure is reported honestly — the screen must never say
   * "Saved" when the server refused — and the real project id comes back so a
   * render can be refused when the save it depends on did not land.
   */
  const persist = useCallback(
    (nextDraft: MasterVideoDraft, nextApprovals: MasterVideoApprovals): Promise<SaveResult> => {
      if (!hasSession) return Promise.resolve({ ok: false, projectId: null, error: "You are not signed in." });
      const scopeAtStart = scopeRef.current;
      const run = async (): Promise<SaveResult> => {
        setSaving(true);
        try {
          const res = await call({ action: "save", draft: nextDraft, approvals: nextApprovals });
          // A save that finishes after a scope switch must not be applied to the
          // new client's screen.
          if (scopeRef.current !== scopeAtStart) return { ok: false, projectId: null, error: "Scope changed" };
          const id = res?.project?.id ?? projectIdRef.current ?? null;
          if (id) setProjectId(id);
          setSaveError(null);
          setSavedAt(new Date().toISOString());
          return { ok: true, projectId: id };
        } catch (e: any) {
          const message = e?.message || "Your last change could not be saved.";
          console.error("master video save failed", e);
          if (scopeRef.current === scopeAtStart) setSaveError(message);
          return { ok: false, projectId: projectIdRef.current, error: message };
        } finally {
          setSaving(false);
        }
      };
      const chained = writeChain.current.then(run, run);
      writeChain.current = chained;
      return chained;
    },
    [hasSession, call],
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

  /** Keeps the words that were there before an AI redraft or a paste. */
  const snapshotScript = useCallback((note: string) => {
    setDraft((prev) => pushScriptVersion(prev, note));
  }, []);

  const restoreScriptVersion = useCallback((versionId: string) => {
    setDraft((prev) => {
      const v = prev.scriptVersions.find((s) => s.id === versionId);
      if (!v) return prev;
      const kept = pushScriptVersion(prev, "before restoring an earlier take");
      return { ...kept, script: v.script, videoPrompt: v.videoPrompt, disclosure: v.disclosure };
    });
  }, []);

  const approveFrame = useCallback(() => {
    setDraft((d) => {
      setApprovals((a) => ({ ...a, frame: { hash: frameApprovalHash(d), at: new Date().toISOString(), by: approvedBy } }));
      return d;
    });
  }, [approvedBy]);

  const approveScript = useCallback(() => {
    setDraft((d) => {
      const kept = pushScriptVersion(d, "approved");
      setApprovals((a) => ({
        ...a,
        script: { hash: scriptApprovalHash(kept), at: new Date().toISOString(), by: approvedBy },
      }));
      return kept;
    });
  }, [approvedBy]);

  const clearApproval = useCallback((key: "frame" | "script") => {
    setApprovals((a) => {
      const next = { ...a };
      delete next[key];
      return next;
    });
  }, []);

  const refreshGenerations = useCallback(async () => {
    if (!projectIdRef.current) return;
    const scopeAtStart = scopeRef.current;
    try {
      const res = await call({ action: "load" });
      if (scopeRef.current !== scopeAtStart) return;
      if (res?.generations) setGenerations(res.generations as MasterVideoGeneration[]);
    } catch (e) {
      console.warn("master video render refresh failed", e);
    }
  }, [call]);

  // While a render is queued or running the screen refreshes itself, so a
  // finished video appears without anyone pressing anything.
  const hasActiveRender = generations.some((g) => ACTIVE.has(g.status));
  useEffect(() => {
    if (!hasActiveRender) return;
    const t = setInterval(() => void refreshGenerations(), 20000);
    return () => clearInterval(t);
  }, [hasActiveRender, refreshGenerations]);

  /** Flushes pending edits so the server reads the same content the operator sees. */
  const saveNow = useCallback(async (): Promise<SaveResult> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    return persist(draft, approvals);
  }, [persist, draft, approvals]);

  const reset = useCallback(async () => {
    const empty = createEmptyDraft();
    setDraft(empty);
    setApprovals({});
    const res = await persist(empty, {});
    if (res.ok) toast.success("Started a fresh video project");
    else toast.error(res.error || "Could not start a fresh video project");
  }, [persist]);

  return {
    projectId,
    draft,
    approvals,
    generations,
    loading,
    saving,
    savedAt,
    hasSession,
    update,
    snapshotScript,
    restoreScriptVersion,
    approveFrame,
    approveScript,
    clearApproval,
    refreshGenerations,
    saveNow,
    reset,
    loadError,
    saveError,
  };
}
