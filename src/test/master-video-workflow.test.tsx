// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

/* ------------------------------------------------------------------ mocks --- */

/** In-memory stand-in for the two Master Video tables. */
const db = {
  projects: [] as any[],
  generations: [] as any[],
};
const invoke = vi.fn();

function tableApi(name: string) {
  const rows = () => (name === "ai_studio_video_projects" ? db.projects : db.generations);
  const filters: Array<(r: any) => boolean> = [];
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => (filters.push((r) => r[col] === val), api),
    is: (col: string, val: any) => (filters.push((r) => (r[col] ?? null) === val), api),
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: rows().find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    single: async () => ({ data: rows().find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    then: (res: any) => res({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }),
    insert: (row: any) => {
      const created = { id: `row-${rows().length + 1}`, created_at: new Date().toISOString(), ...row };
      rows().push(created);
      return {
        select: () => ({ single: async () => ({ data: created, error: null }) }),
        then: (res: any) => res({ data: created, error: null }),
      };
    },
    update: (patch: any) => ({
      eq: async (col: string, val: any) => {
        const target = rows().find((r) => r[col] === val);
        if (target) Object.assign(target, patch);
        return { data: target, error: null };
      },
    }),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (name: string) => tableApi(name),
    functions: { invoke: (...args: any[]) => invoke(...args) },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.example.com/${p}` } }),
      }),
    },
  },
}));

vi.mock("@/hooks/useClientOffers", () => ({
  useClientOffers: () => ({
    data: [{ id: "offer-1", title: "Fund III", description: "Real assets fund", file_url: null }],
  }),
}));

vi.mock("@/hooks/useAvatars", () => ({
  useAvatars: () => ({ data: [{ id: "avatar-1", name: "Dana", image_url: "https://cdn.example.com/dana.png" }] }),
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toasts.push(`success:${m}`),
    error: (m: string) => toasts.push(`error:${m}`),
  },
}));

vi.mock("@/lib/dashboardAuthHeaders", () => ({ dashboardAuthHeaders: () => ({ "x-dashboard-token": "t" }) }));

import MasterVideoWorkflow from "@/components/ai/master-video/MasterVideoWorkflow";
import { createEmptyDraft, frameApprovalHash, scriptApprovalHash } from "@/lib/masterVideo";

/** A saved project row that is complete but NOT yet approved. */
function seedProject(over: Partial<any> = {}) {
  const draft = {
    ...createEmptyDraft(),
    offerId: "offer-1",
    cta: "Book a call",
    styleId: "lakeside",
    styleLabel: "Lakeside",
    presenter: "avatar" as const,
    avatarId: "avatar-1",
    avatarName: "Dana",
    avatarImageUrl: "https://cdn.example.com/dana.png",
    frames: [
      {
        id: "frame-1",
        url: "https://cdn.example.com/frame-1.png",
        version: 1,
        prompt: "Opening frame",
        imageModel: "openai",
        source: "generated" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    selectedFrameId: "frame-1",
    script: "Most investors never see this. Here is how it works. Book a call.",
    videoPrompt: "Handheld medium shot, slow push in.",
  };
  const row = {
    id: "project-1",
    user_id: "user-1",
    client_id: "client-1",
    conversation_id: "conv-1",
    draft,
    approvals: {},
    ...over,
  };
  db.projects.push(row);
  return row;
}

const mount = () =>
  render(<MasterVideoWorkflow clientId="client-1" clientName="Acme Capital" conversationId="conv-1" />);

beforeEach(() => {
  cleanup();
  db.projects = [];
  db.generations = [];
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, duplicate: false, generation: { id: "g1", status: "running" } }, error: null });
  toasts.length = 0;
});

/* ------------------------------------------------------------------ tests --- */

describe("Master AI Video workflow UI", () => {
  it("shows all six steps and resumes the saved project", async () => {
    seedProject();
    mount();
    for (const label of ["Offer", "Style", "Presenter", "First frame", "Script & directions", "Generate"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    // Resumed content, not an empty draft.
    expect(await screen.findByDisplayValue("Book a call")).toBeInTheDocument();
  });

  it("moves forward and back through the steps in order", async () => {
    seedProject();
    const user = userEvent.setup();
    mount();
    await screen.findByText("Offer");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Pick one style/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Who is on camera/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(await screen.findByText(/Pick one style/i)).toBeInTheDocument();
  });

  it("will not start a render while the frame and script are unapproved", async () => {
    seedProject();
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /^Generate$/i }));
    const generateBtn = await screen.findByRole("button", { name: /Generate video/i });
    expect(generateBtn).toBeDisabled();
    expect(await screen.findByText(/Approve the frame you picked/i)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("grants a render only after both approvals, sending the exact project and approved hash", async () => {
    const row = seedProject();
    row.approvals = {
      frame: { hash: frameApprovalHash(row.draft), at: "", by: "user-1" },
      script: { hash: scriptApprovalHash(row.draft), at: "", by: "user-1" },
    };
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /^Generate$/i }));
    const generateBtn = await screen.findByRole("button", { name: /Generate video/i });
    expect(generateBtn).toBeEnabled();
    await user.click(generateBtn);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe("master-video-generate");
    expect(options.body.projectId).toBe("project-1");
    expect(options.body.scriptHash).toBe(scriptApprovalHash(row.draft));
  });

  it("reports a duplicate render as not charged twice", async () => {
    const row = seedProject();
    row.approvals = {
      frame: { hash: frameApprovalHash(row.draft), at: "", by: "user-1" },
      script: { hash: scriptApprovalHash(row.draft), at: "", by: "user-1" },
    };
    invoke.mockResolvedValue({ data: { ok: true, duplicate: true, generation: { id: "g1", status: "running" } }, error: null });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /^Generate$/i }));
    await user.click(await screen.findByRole("button", { name: /Generate video/i }));
    await waitFor(() => expect(toasts.some((t) => /nothing was charged twice/i.test(t))).toBe(true));
  });

  it("surfaces a failed render with an explicit retry", async () => {
    const row = seedProject();
    row.approvals = {
      frame: { hash: frameApprovalHash(row.draft), at: "", by: "user-1" },
      script: { hash: scriptApprovalHash(row.draft), at: "", by: "user-1" },
    };
    db.generations.push({
      id: "gen-1",
      project_id: "project-1",
      status: "failed",
      model: "alibaba/wan-3.0",
      resolution: "1080p",
      duration_seconds: 30,
      error: "Provider rejected the frame",
      created_at: new Date().toISOString(),
      video_url: null,
    });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /^Generate$/i }));
    expect(await screen.findByText(/Provider rejected the frame/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Try this render again/i })).toBeEnabled();
  });

  it("invalidates the approval with a clear message after an upstream edit", async () => {
    const row = seedProject();
    row.approvals = {
      frame: { hash: frameApprovalHash(row.draft), at: "", by: "user-1" },
      script: { hash: scriptApprovalHash(row.draft), at: "", by: "user-1" },
    };
    const user = userEvent.setup();
    mount();
    // Edit the call to action on step 1 — that is part of the approved contract.
    const cta = await screen.findByDisplayValue("Book a call");
    await user.type(cta, " today");
    await user.click(await screen.findByRole("button", { name: /^Generate$/i }));
    expect(await screen.findByText(/approve again|Approve the script/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Generate video/i })).toBeDisabled();
  });

  it("keeps one project per client and thread, with no state leaking across clients", async () => {
    seedProject();
    db.projects.push({
      id: "project-2",
      user_id: "user-1",
      client_id: "client-2",
      conversation_id: "conv-1",
      draft: { ...createEmptyDraft(), cta: "Other client CTA" },
      approvals: {},
    });
    const view = render(<MasterVideoWorkflow clientId="client-2" clientName="Other" conversationId="conv-1" />);
    expect(await screen.findByDisplayValue("Other client CTA")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Book a call")).not.toBeInTheDocument();
    view.unmount();
  });
});
