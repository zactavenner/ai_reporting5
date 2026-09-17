/** Links canvas polling to the Master Video render ledger. Pure and testable. */
export type PollOutcome =
  | { kind: "completed"; videoUrl: string; storagePath?: string | null }
  | { kind: "failed"; error: string }
  | { kind: "unresolved"; error: string }
  | { kind: "in_flight"; providerStatus?: string | null };

export type LedgerPatch = { generationId: string; patch: Record<string, unknown> };

export function masterGenerationId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.source !== "master_video") return null;
  return typeof p.generation_id === "string" && p.generation_id ? p.generation_id : null;
}

export function ledgerPatchForOutcome(payload: unknown, outcome: PollOutcome): LedgerPatch | null {
  const generationId = masterGenerationId(payload);
  if (!generationId) return null;
  if (outcome.kind === "completed") {
    if (!/^https?:\/\//.test(outcome.videoUrl)) {
      return {
        generationId,
        patch: {
          status: "submission_unknown",
          error: "The renderer reported it finished but gave no usable video file.",
        },
      };
    }
    return { generationId, patch: { status: "completed", video_url: outcome.videoUrl, error: null } };
  }
  if (outcome.kind === "failed") {
    return { generationId, patch: { status: "failed", error: String(outcome.error || "").slice(0, 900) } };
  }
  // An unresolved paid attempt retains its claim until the provider outcome is known.
  if (outcome.kind === "unresolved") {
    return { generationId, patch: { status: "submission_unknown", error: String(outcome.error || "").slice(0, 900) } };
  }
  return null;
}

export function isActiveLedgerStatus(status: string | null | undefined): boolean {
  return status === "queued" || status === "running" || status === "submission_unknown";
}
