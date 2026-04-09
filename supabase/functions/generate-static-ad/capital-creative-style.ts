/**
 * Capital Creative Style System
 * Imported from Creative Flow Hub — the master design language for capital raising ads.
 */

export const CAPITAL_CREATIVE = {
  name: "Capital Creative",
  backgrounds: {
    deepGreen: "#0B2B26",
    navy: "#0A1628",
    charcoal: "#1A1A2E",
    darkTeal: "#0D3B3B",
    pureBlack: "#0A0A0A",
  },
  gold: {
    primary: "#C5A55A",
    light: "#D4B96E",
    dark: "#A8893E",
  },
  text: {
    white: "#FFFFFF",
    offWhite: "#F0EDED",
    lightGray: "#B8B8B8",
    gold: "#C5A55A",
  },
  cta: {
    gold: { bg: "#C5A55A", text: "#0A0A0A" },
    red: { bg: "#E74C3C", text: "#FFFFFF" },
    blue: { bg: "#2980B9", text: "#FFFFFF" },
  },
  gradients: {
    verticalGreen: "linear-gradient(180deg, rgba(11,43,38,0.95) 0%, rgba(11,43,38,0.7) 60%, rgba(11,43,38,0.95) 100%)",
    diagonalNavy: "linear-gradient(135deg, rgba(10,22,40,0.92) 0%, rgba(26,26,46,0.85) 100%)",
    cinematicBlack: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.9) 100%)",
  },
  typography: {
    qualifier: { size: "13px", weight: 700, letterSpacing: "5px", transform: "uppercase" },
    heroReturn: { size: "56-72px", weight: 900 },
    headline: { family: "Playfair Display, serif", size: "24-32px", weight: 900, transform: "uppercase" },
    benefit: { size: "14-16px", weight: 600, letterSpacing: "2-3px", transform: "uppercase" },
    cta: { size: "13-15px", weight: 800, letterSpacing: "3-4px", transform: "uppercase" },
    disclaimer: { size: "7-9px", weight: 400, opacity: 0.35 },
  },
  compliance: {
    qualifierText: "ACCREDITED INVESTORS",
    returnPrefix: "Target",
    disclaimer:
      "This opportunity is for accredited investors only. All investments carry risk, including the potential loss of principal. Past performance does not guarantee future results. Any sale of securities will be made solely via our Private Placement Memorandum. Please consult your financial advisor before investing.",
  },
  powerWords: [
    "ACCREDITED", "PROJECTED", "TARGETED", "SECURED", "ASSET-BACKED",
    "PAID MONTHLY", "QUARTERLY PAYOUTS", "PREFERRED RETURNS", "HIGH-YIELD",
    "IRR", "TAX ADVANTAGES", "CASH FLOW", "ZERO MISSED PAYMENTS", "AUM",
    "VERTICALLY INTEGRATED", "HUD-INSURED",
  ],
};

/**
 * Returns a detailed style directive to inject into the ad generation prompt
 * when the Capital Raising style is active.
 */
export function getCapitalCreativeDirective(): string {
  const c = CAPITAL_CREATIVE;
  return `
CAPITAL CREATIVE DESIGN SYSTEM — MANDATORY STYLE GUIDE:
You MUST follow this design system precisely. This is not a suggestion — it is the production standard.

COLOR PALETTE:
- Backgrounds: Deep Green ${c.backgrounds.deepGreen}, Navy ${c.backgrounds.navy}, Charcoal ${c.backgrounds.charcoal}, Dark Teal ${c.backgrounds.darkTeal}, Pure Black ${c.backgrounds.pureBlack}
- Gold accents: Primary ${c.gold.primary}, Light ${c.gold.light}, Dark ${c.gold.dark}
- Text: White ${c.text.white}, Off-White ${c.text.offWhite}, Light Gray ${c.text.lightGray}, Gold ${c.text.gold}
- CTA buttons: Gold bg ${c.cta.gold.bg} with dark text, or Red ${c.cta.red.bg} with white text

GRADIENTS:
- Use cinematic dark overlays with vertical or diagonal gradients
- Background should be DARK (green, navy, or black) with subtle depth

TYPOGRAPHY HIERARCHY:
1. QUALIFIER LINE: Small uppercase text at top (e.g., "ACCREDITED INVESTORS") — 13px, weight 700, letter-spacing 5px
2. HERO RETURN NUMBER: The biggest element — 56-72px, weight 900, with gold color. Show the return percentage HUGE (e.g., "15%" or "18%")
3. RETURN LABEL: "PREFERRED RETURNS" or "TARGETED RETURNS" next to the number — bold, uppercase
4. HEADLINE: Playfair Display serif, 24-32px, weight 900, uppercase
5. BENEFIT BULLETS: 14-16px, weight 600, uppercase, 2-3px letter-spacing, with gold vertical bars as bullet markers
6. CTA: 13-15px, weight 800, uppercase, 3-4px letter-spacing, gold background
7. DISCLAIMER: Tiny 7-9px text at very bottom, 35% opacity

LAYOUT RULES:
- Dark, premium backgrounds — NEVER white or light backgrounds
- Gold accent elements (lines, bars, dots) for visual hierarchy
- Strong vertical hierarchy: qualifier → hero number → headline → benefits → CTA → disclaimer
- Use gold vertical bar "|" markers next to benefit text
- Real estate / land / development imagery as subtle background (if applicable)

POWER WORDS TO USE: ${c.powerWords.join(', ')}

COMPLIANCE:
- Always prefix return numbers with "Target" or "Projected" — NEVER say "guaranteed"
- Include "${c.compliance.qualifierText}" qualifier at top
- Include small disclaimer at bottom: "${c.compliance.disclaimer}"

VISUAL FEEL: Premium, institutional, trustworthy. Think BlackRock meets high-end real estate fund marketing.
`.trim();
}
