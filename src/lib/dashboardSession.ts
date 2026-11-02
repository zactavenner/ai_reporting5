/**
 * Client-side check of the dashboard session token's expiry.
 * The token is `<base64url(JSON{memberId, exp})>.<signature>`; the server
 * verifies the signature, but the browser can read `exp` (ms) to avoid
 * sending requests with a token the server will refuse.
 */
export const DASHBOARD_TOKEN_KEY = 'dashboard_session_token';

export function dashboardTokenExpiry(token: string | null | undefined): number | null {
  if (!token || !token.includes('.')) return null;
  try {
    const payload = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(payload + '='.repeat((4 - (payload.length % 4)) % 4)));
    return typeof parsed?.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

/** True when the token is present, well-formed and not yet expired. */
export function isDashboardTokenValid(token: string | null | undefined, now = Date.now()): boolean {
  const exp = dashboardTokenExpiry(token);
  return exp !== null && exp > now;
}

/** Returns the stored token if still valid; otherwise clears it and returns null. */
export function getValidDashboardToken(): string | null {
  try {
    const token = localStorage.getItem(DASHBOARD_TOKEN_KEY);
    if (!token) return null;
    if (isDashboardTokenValid(token)) return token;
    localStorage.removeItem(DASHBOARD_TOKEN_KEY);
    return null;
  } catch {
    return null;
  }
}
