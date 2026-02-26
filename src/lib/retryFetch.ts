/**
 * Exponential backoff retry wrapper for fetch calls.
 * Retries on 429, 5xx, and network errors.
 */
export async function retryFetch(
  url: string,
  options: RequestInit = {},
  config: { maxRetries?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 1000, timeoutMs = 30000 } = config;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok || attempt === maxRetries) return res;

      // Retry on rate limit or server error
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get('Retry-After');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return res; // 4xx (non-429) — don't retry
    } catch (err: any) {
      clearTimeout(timeout);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }

  throw new Error('retryFetch: unreachable');
}
