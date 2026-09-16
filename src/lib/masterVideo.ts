/**
 * Browser-side entry point for the Master AI Video contract.
 *
 * There is deliberately no second implementation here: the workflow UI and the
 * `master-video-generate` edge function import the SAME pure module, so the
 * readiness the operator sees and the approval the server enforces can never
 * drift apart.
 */
export * from "../../supabase/functions/_shared/masterVideoContract";

import type { MasterVideoDraft } from "../../supabase/functions/_shared/masterVideoContract";

/** Image models available for the opening frame (matches ScriptRenderCard). */
export const FRAME_IMAGE_MODELS = [
  { value: "openai", label: "GPT Image 2" },
  { value: "nano-banana", label: "Nano Banana Pro" },
] as const;

/**
 * Seeds the opening-frame prompt from what the operator has already chosen.
 * Never asks for lettering, logos or captions — those are a post-production
 * step, and burned-in text ruins a re-usable source frame.
 */
export function buildFirstFramePrompt(draft: MasterVideoDraft, clientName?: string | null): string {
  const bits: string[] = [];
  bits.push("Photorealistic opening frame of a direct-response video ad.");
  if (draft.presenter === "avatar") {
    bits.push(
      draft.avatarDescription?.trim()
        ? `On camera: ${draft.avatarDescription.trim()}, looking straight into the lens.`
        : "A single presenter looking straight into the lens.",
    );
  } else {
    bits.push("No presenter or person in frame.");
  }
  if (draft.wardrobe?.trim()) bits.push(`Wearing ${draft.wardrobe.trim()}.`);
  if (draft.location?.trim()) bits.push(`Setting: ${draft.location.trim()}.`);
  if (draft.styleDirections?.trim()) bits.push(draft.styleDirections.trim());
  else if (draft.styleLabel) bits.push(`Styled like: ${draft.styleLabel}.`);
  if (draft.offerSnapshot?.name) bits.push(`Context: an ad for ${draft.offerSnapshot.name}${clientName ? ` (${clientName})` : ""}.`);
  // Say the truth about the shape: a 16:9 frame described as "vertical" makes the
  // image model compose for the wrong crop.
  const orientation = draft.aspectRatio === "9:16" ? "Vertical" : "Landscape";
  bits.push(`${orientation} framing for ${draft.aspectRatio}, natural lighting, shallow depth of field, shot on a cinema camera.`);
  bits.push("No text, no lettering, no captions, no logos, no watermarks anywhere in the image.");
  return bits.join(" ");
}
