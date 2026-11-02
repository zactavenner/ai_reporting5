import type { CreativeComment } from '@/hooks/useCreatives';

/**
 * Creative comments are stored as JSON. Most rows hold an array, but some
 * external writers store a plain string or object. Always return an array
 * so the UI never crashes on `.map`/`.slice`.
 */
export function normalizeCreativeComments(raw: unknown, createdAt?: string): CreativeComment[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((c) => c != null)
      .map((c, i) =>
        typeof c === 'string'
          ? { id: `legacy-${i}`, author: 'System', text: c, createdAt: createdAt || new Date(0).toISOString() }
          : (c as CreativeComment),
      );
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return normalizeCreativeComments(parsed, createdAt);
    } catch {
      /* plain text note */
    }
    return [{ id: 'legacy-0', author: 'System', text, createdAt: createdAt || new Date(0).toISOString() }];
  }
  if (typeof raw === 'object') {
    const obj = raw as Partial<CreativeComment>;
    if (typeof obj.text === 'string') {
      return [{ id: obj.id || 'legacy-0', author: obj.author || 'System', text: obj.text, createdAt: obj.createdAt || createdAt || new Date(0).toISOString() }];
    }
  }
  return [];
}
