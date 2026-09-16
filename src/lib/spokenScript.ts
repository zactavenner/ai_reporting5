/**
 * Spoken-words helpers for the browser.
 *
 * Single implementation, shared with the edge functions: direction lines (camera,
 * framing, b-roll) never count towards the read length, so a storyboard cannot
 * inflate the suggested clip duration.
 */
export {
  extractSpokenScript,
  scriptWordCount,
  estimatedReadSeconds,
} from "../../supabase/functions/_shared/masterVideoContract";

import { scriptWordCount } from "../../supabase/functions/_shared/masterVideoContract";

/** Number of words actually read out loud. */
export const countSpokenWords = (raw: string): number => scriptWordCount(raw);
