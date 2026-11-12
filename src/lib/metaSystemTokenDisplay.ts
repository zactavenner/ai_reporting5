/**
 * Display rules for a client's Meta System User Token row (metadata only —
 * the token itself never reaches the browser).
 */
import { format } from 'date-fns';
import type { RowState } from '@/lib/huddle/connectionsChecklist';

export type MetaSystemTokenState = 'not_set' | 'active' | 'invalid' | 'needs_attention';

export interface MetaSystemTokenStatus {
  client_id: string;
  status: MetaSystemTokenState;
  using: 'system_user' | 'user_token';
  system_user_id: string | null;
  system_user_name: string | null;
  token_last4: string | null;
  scopes: string[];
  expires_at: string | null;
  data_access_expires_at: string | null;
  ad_account_access: Record<string, { ok: boolean; name?: string | null; error?: string }>;
  saved_at: string | null;
  saved_by: string | null;
  last_validated_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
}

export const TOKEN_PILL: Record<MetaSystemTokenState, { label: string; className: string }> = {
  not_set: { label: 'Not set', className: 'bg-muted text-muted-foreground border-border' },
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  invalid: { label: 'Invalid', className: 'bg-rose-500/10 text-rose-600 border-rose-500/40' },
  needs_attention: { label: 'Needs attention', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

/** Invalid and Needs attention both count toward the section's "need attention" total. */
export function tokenNeedsAttention(status: MetaSystemTokenState | null | undefined): boolean {
  return status === 'invalid' || status === 'needs_attention';
}

/** Checklist row state: not set is neutral (the user token is the normal default). */
export function tokenRowState(status: MetaSystemTokenState | null | undefined): RowState | 'neutral' {
  if (status === 'active') return 'ok';
  if (tokenNeedsAttention(status)) return 'warn';
  return 'neutral';
}

const day = (v: string | null) => (v ? format(new Date(v), 'MMM d, yyyy') : null);

const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 4)}…` : id);

/** Subtitle lines, in display order. */
export function tokenDetailLines(s: MetaSystemTokenStatus | null | undefined): string[] {
  if (!s) return [];
  const lines = [`Using: ${s.using === 'system_user' ? 'System user' : 'User token'}`];
  if (s.status === 'not_set') return lines;
  const idBits = [s.system_user_id ? `System user ID ${shortId(s.system_user_id)}` : null, s.token_last4 ? `••••${s.token_last4}` : null]
    .filter(Boolean)
    .join(' · ');
  if (idBits) lines.push(idBits);
  const dates = [s.saved_at ? `Saved ${day(s.saved_at)}` : null, s.last_validated_at ? `Last validated ${day(s.last_validated_at)}` : null]
    .filter(Boolean)
    .join(' · ');
  if (dates) lines.push(dates);
  lines.push(`Scopes: ${s.scopes.length ? s.scopes.join(', ') : '—'}`);
  lines.push(`Expires: ${s.expires_at ? day(s.expires_at) : 'Never'}`);
  return lines;
}
