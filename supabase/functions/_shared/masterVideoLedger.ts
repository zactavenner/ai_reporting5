/**
 * Links the video poller back to the Master Video render ledger.
 *
 * The poller works from `ai_studio_canvas_items`, which is where every render —
 * chat line or Master workflow — is tracked. A Master render also owns a row in
 * `ai_studio_video_generations`, and that row is what the six-step screen shows.
 * Without this link the ledger row would sit on "running" forever even though
 * the video finished, which is exactly the bug this file exists to prevent.
 *
 * Kept pure so it can be tested without a database or a provider.
 */

export type PollOutcome =
  | { kind: "completed"; videoUrl: string; storagePath?: string | null }
  | { kind: "failed"; error: string }
  | { kind: "in_flight"; providerStatus?: string | null };

export type LedgerPatch = {
  generationId: string;
  patch: Record<string, unknown>;
};

/** A payload only belongs to the ledger when the generator stamped it. */
export function masterGenerationId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.source !== "master_video") return null;
  const id = p.generation_id;
  return typeof id === "string" && id ? id : null;
}

/**
 * The ledger patch for a polled outcome, or null when this card is not a Master
 * render. `in_flight` deliberately produces no write: nothing has changed, and a
 * pointless update per poll would just churn the table.
 */
export function ledgerPatchForOutcome(payload: unknown, outcome: PollOutcome): LedgerPatch | null {
  const generationId = masterGenerationId(payload);
  if (!generationId) return null;

  if (outcome.kind === "completed") {
    if (!/^https?:\/\//.test(outcome.videoUrl)) {
      return {
        generationId,
        patch: {
          status: "failed",
          error: "The renderer reported it finished but gave no usable video file.",
        },
      };
    }
    return {
      generationId,
      patch: {
        status: "completed",
        video_url: outcome.videoUrl,
        error: null,
      },
    };
  }

  if (outcome.kind === "failed") {
    return {
      generationId,
      patch: { status: "failed", error: String(outcome.error || "").slice(0, 900) },
    };
  }

  return null;
}

/** True while the six-step screen should keep refreshing on its own. */
export function isActiveLedgerStatus(status: string | null | undefined): boolean {
  return status === "queued" || status === "running";
}
