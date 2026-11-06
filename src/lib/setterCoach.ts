export type Objection = { label: string; keywords: string[]; reply: string };
export type SetterScript = {
  id: string; client_id: string | null; name: string; opening: string;
  questions: string[]; booking: string; objections: Objection[]; is_default: boolean;
};

/** Replace {{var}} placeholders; unknown vars stay visible so setters notice them. */
export function fillScript(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (vars[k] ? vars[k] : m));
}

/** Pick the script for a client: client default > client any > agency default > agency any. */
export function pickScript(scripts: SetterScript[], clientId: string | null | undefined): SetterScript | null {
  const own = scripts.filter((s) => clientId && s.client_id === clientId);
  const agency = scripts.filter((s) => !s.client_id);
  return own.find((s) => s.is_default) ?? own[0] ?? agency.find((s) => s.is_default) ?? agency[0] ?? null;
}

/** Match the latest thing the lead said against the script's objection playbook. */
export function matchObjection(said: string, objections: Objection[]): Objection | null {
  const t = said.toLowerCase();
  if (!t.trim()) return null;
  let best: { o: Objection; hits: number } | null = null;
  for (const o of objections) {
    const hits = o.keywords.filter((k) => k && t.includes(k.toLowerCase())).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { o, hits };
  }
  return best?.o ?? null;
}

/** Hotkeys 1–7 → dispositions, matching the PPS dialer muscle memory. */
export const DISPOSITION_HOTKEYS: Record<string, string> = {
  '1': 'booked', '2': 'qualified', '3': 'callback', '4': 'contacted',
  '5': 'nurture', '6': 'not_interested', '7': 'unqualified',
};
