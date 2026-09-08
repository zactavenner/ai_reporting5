/**
 * Frontend re-export of the canonical Capital Raising SOP rules.
 *
 * The single source of truth lives in supabase/functions/_shared/mediaBuyerSop.ts
 * so the preview UI, the prepared media-buyer-sop-review edge function and the
 * unit tests all evaluate identical logic. Keep this file as a pure re-export.
 */
export * from '../../supabase/functions/_shared/mediaBuyerSop';
