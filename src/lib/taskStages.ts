// Single source of truth for task board stages.
// Primary workflow: To Do → In Progress → Needs QA → Needs Zac Approval → Done.
// Legacy stage ids stay valid for existing tasks (no backfill):
//   - agency_review is shown in the "Needs QA" column (the EOD flow still writes it).
//   - client_tasks / stuck / review / revisions keep their own columns, shown only when a task uses them.
export type StageDef = {
  id: string;
  label: string;
  color: string;
  agencyOnly?: boolean;
  legacy?: boolean;
};

export const PRIMARY_STAGES: StageDef[] = [
  { id: 'todo', label: 'To Do', color: 'bg-blue-500/20' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-orange-500/20' },
  { id: 'needs_qa', label: 'Needs QA', color: 'bg-indigo-500/20', agencyOnly: true },
  { id: 'needs_zac_approval', label: 'Needs Zac Approval', color: 'bg-purple-500/20', agencyOnly: true },
  { id: 'done', label: 'Done', color: 'bg-green-500/20' },
];

export const LEGACY_STAGES: StageDef[] = [
  { id: 'client_tasks', label: 'Client Tasks', color: 'bg-cyan-500/20', legacy: true },
  { id: 'stuck', label: 'Stuck', color: 'bg-destructive/20', legacy: true },
  { id: 'review', label: 'Client Review', color: 'bg-purple-500/20', legacy: true },
  { id: 'revisions', label: 'Revisions', color: 'bg-amber-500/20', legacy: true },
];

/** Stored stage id → board column id. */
export const STAGE_ALIASES: Record<string, string> = {
  agency_review: 'needs_qa',
};

export const ALL_STAGES: StageDef[] = [...PRIMARY_STAGES, ...LEGACY_STAGES];

/** Stages a user can pick in the task detail dropdown (includes legacy so existing tasks still display). */
export const SELECTABLE_STAGES: { id: string; label: string }[] = [
  ...PRIMARY_STAGES.map(({ id, label }) => ({ id, label })),
  { id: 'agency_review', label: 'Needs QA (legacy: Agency Review)' },
  ...LEGACY_STAGES.map(({ id, label }) => ({ id, label: `${label} (legacy)` })),
];

export function boardStageFor(stage: string | null | undefined): string {
  const s = String(stage || 'todo');
  return STAGE_ALIASES[s] || s;
}

export function stageLabel(stage: string | null | undefined): string {
  const id = boardStageFor(stage);
  return ALL_STAGES.find((s) => s.id === id)?.label || String(stage || '');
}

/** Stages that are hidden from the client / public board. */
export function isAgencyOnlyStage(stage: string | null | undefined): boolean {
  const id = boardStageFor(stage);
  return !!ALL_STAGES.find((s) => s.id === id)?.agencyOnly;
}
