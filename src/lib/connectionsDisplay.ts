/**
 * Pure display helpers shared by the Connections & Settings chips and panels.
 *
 * Kept free of React so both surfaces (Huddle summary chip and the expanded
 * panels) count the SAME records, and so every status can be unit tested.
 */

export interface OfferLike {
  status?: string | null;
}

/**
 * Records the Offers panel actually renders: everything not archived, including
 * legacy/migrated rows whose status was never set.
 */
export function visibleOffers<T extends OfferLike>(offers: T[]): T[] {
  return (offers || []).filter((o) => (o?.status ?? 'active') !== 'archived');
}

export function countVisibleOffers(offers: OfferLike[]): number {
  return visibleOffers(offers || []).length;
}

export function archivedOffers<T extends OfferLike>(offers: T[]): T[] {
  return (offers || []).filter((o) => (o?.status ?? 'active') === 'archived');
}

/** Every connection request must land in exactly one of these terminal states. */
export type ConnectionStatusView =
  | { kind: 'unauthorized'; message: string }
  | { kind: 'loading'; message: string }
  | { kind: 'loaded' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

const CREDENTIAL_ISH = /\b(?:[A-Za-z0-9_-]{24,})\b/g;

/** Never echo a token, key or bearer value into the UI. */
export function sanitizeConnectionError(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : input && typeof (input as any).message === 'string'
        ? (input as any).message
        : '';
  const cleaned = raw
    .replace(CREDENTIAL_ISH, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Connection status could not be loaded.';
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}…` : cleaned;
}

export const CONNECTION_TIMEOUT_MS = 15_000;

export function resolveConnectionStatusView(input: {
  canEdit: boolean;
  hasData: boolean;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  timedOut?: boolean;
}): ConnectionStatusView {
  if (!input.canEdit) {
    return { kind: 'unauthorized', message: 'Sign in as an agency operator to see connection status.' };
  }
  if (input.hasData) return { kind: 'loaded' };
  if (input.isError) {
    const message = sanitizeConnectionError(input.error);
    if (/timed out|timeout/i.test(message)) {
      return { kind: 'unavailable', message: 'Connection status is unavailable right now (request timed out).' };
    }
    if (/unauthor|forbidden|401|403/i.test(message)) {
      return { kind: 'unauthorized', message: 'Your operator session has expired — sign in again to see connection status.' };
    }
    return { kind: 'error', message };
  }
  if (input.timedOut) {
    return { kind: 'unavailable', message: 'Connection status is unavailable right now (request timed out).' };
  }
  if (input.isPending) return { kind: 'loading', message: 'Loading connection status…' };
  return { kind: 'unavailable', message: 'Connection status is unavailable right now.' };
}

/** Rejects with a timeout error so a hung request can never spin forever. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = CONNECTION_TIMEOUT_MS,
  label = 'Connection status request',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
