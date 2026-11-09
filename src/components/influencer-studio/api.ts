import { supabase } from "@/integrations/supabase/client";
import { dashboardTokenHeaders } from "@/lib/dashboardAuthHeaders";
import type { Tables } from "@/integrations/supabase/types";
import type { CharacterBuilder, PacingProfile, RenderMode, StudioCharacter, StudioProject } from "@/lib/influencerStudio";

export type ProjectRow = Tables<"influencer_projects">;

export type CharacterRow = {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
  image_url: string | null;
  metadata: {
    kind?: string;
    builder?: CharacterBuilder;
    portrait_prompt?: string;
    sheet_url?: string | null;
    sheet_prompt?: string;
  } | null;
  created_at: string;
};

export class StudioError extends Error {
  blockers: string[];
  notEnabled: boolean;
  constructor(message: string, blockers: string[] = [], notEnabled = false) {
    super(message);
    this.blockers = blockers;
    this.notEnabled = notEnabled;
  }
}

/** Calls the influencer-studio function and surfaces its own error text. */
export async function studio<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("influencer-studio", {
    headers: dashboardTokenHeaders(),
    body: { action, ...body },
  });
  if (error) {
    let payload: Record<string, unknown> | null = null;
    try {
      // deno-lint-ignore no-explicit-any
      payload = await (error as any).context?.json?.();
    } catch { /* not json */ }
    throw new StudioError(
      String(payload?.error || error.message || "Request failed"),
      Array.isArray(payload?.blockers) ? (payload!.blockers as string[]) : [],
      !!payload?.notEnabled,
    );
  }
  if (data?.error) throw new StudioError(String(data.error), data.blockers || [], !!data.notEnabled);
  return data as T;
}

export function toStudioProject(p: ProjectRow): StudioProject {
  return {
    clip_url: p.clip_url,
    clip_start_s: Number(p.clip_start_s) || 0,
    clip_end_s: Number(p.clip_end_s) || 0,
    pacing: (p.pacing as PacingProfile) || {},
    character_id: p.character_id,
    script: p.script || "",
    script_locked: p.script_locked,
    script_lock_hash: p.script_lock_hash,
    render_mode: (p.render_mode as RenderMode) || "motion_swap",
    status: p.status,
  };
}

export function toStudioCharacter(c: CharacterRow | null | undefined): StudioCharacter | null {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    portrait_url: c.image_url,
    sheet_url: c.metadata?.sheet_url || null,
    builder: c.metadata?.builder,
  };
}
