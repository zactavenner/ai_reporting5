import { describe, it, expect } from "vitest";
import {
  isActiveLedgerStatus,
  ledgerPatchForOutcome,
  masterGenerationId,
} from "../../supabase/functions/_shared/masterVideoLedger";

const masterPayload = { source: "master_video", generation_id: "gen-1" };

describe("master video render ledger", () => {
  it("only claims canvas jobs that came from the master workflow", () => {
    expect(masterGenerationId(masterPayload)).toBe("gen-1");
    expect(masterGenerationId({ source: "chat", generation_id: "gen-2" })).toBeNull();
    expect(masterGenerationId({ source: "master_video" })).toBeNull();
    expect(masterGenerationId(null)).toBeNull();
  });

  it("records a finished render with its playable file", () => {
    const patch = ledgerPatchForOutcome(masterPayload, {
      kind: "completed",
      videoUrl: "https://cdn.example.com/a.mp4",
    });
    expect(patch).toEqual({
      generationId: "gen-1",
      patch: { status: "completed", video_url: "https://cdn.example.com/a.mp4", error: null },
    });
  });

  it("refuses to call a render ready when no usable file came back", () => {
    const patch = ledgerPatchForOutcome(masterPayload, { kind: "completed", videoUrl: "blob:local" });
    expect(patch?.patch.status).toBe("submission_unknown");
    expect(patch?.patch.video_url).toBeUndefined();
  });

  it("records a provider failure with its reason", () => {
    const patch = ledgerPatchForOutcome(masterPayload, { kind: "failed", error: "provider rejected the audio" });
    expect(patch?.patch).toEqual({ status: "failed", error: "provider rejected the audio" });
  });

  it("keeps an unresolved paid attempt held for review rather than failed", () => {
    const patch = ledgerPatchForOutcome(masterPayload, { kind: "unresolved", error: "no answer after 30 minutes" });
    expect(patch?.patch.status).toBe("submission_unknown");
  });

  it("writes nothing while a render is still in flight", () => {
    expect(ledgerPatchForOutcome(masterPayload, { kind: "in_flight", providerStatus: "running" })).toBeNull();
  });

  it("treats queued, running and held renders as still needing a refresh", () => {
    expect(isActiveLedgerStatus("queued")).toBe(true);
    expect(isActiveLedgerStatus("running")).toBe(true);
    expect(isActiveLedgerStatus("submission_unknown")).toBe(true);
    expect(isActiveLedgerStatus("completed")).toBe(false);
    expect(isActiveLedgerStatus("failed")).toBe(false);
  });
});
