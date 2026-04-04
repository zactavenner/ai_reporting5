import type { InvestmentType, SegmentType, DealInput, AvatarConfig, AvatarGender } from '@/types/avatar-ad';

// ── Environment Mapping ──
export const ENVIRONMENT_MAP: Record<InvestmentType, string> = {
  rv_park: 'a well-maintained RV park campground with recreational vehicles visible, green grass, mature oak trees, picnic tables',
  luxury_home: 'a modern rooftop terrace overlooking a city skyline at sunset, sleek outdoor furniture, glass railings',
  lakefront: 'a stone patio overlooking a pristine lake with boats on the water, pine trees, modern glass lakehouse',
  multifamily: 'the entrance courtyard of a modern luxury apartment complex with landscaped gardens and a pool',
  self_storage: 'exterior of a modern climate-controlled self-storage facility with clean facade and clear blue sky',
  land_development: 'a grassy hilltop overlooking rolling green land with construction equipment staging in background',
  short_term_rental: 'stylish balcony of a modern vacation rental overlooking a beach, rattan furniture, tropical plants',
  general_fund: 'modern financial district street with glass skyscrapers, stock ticker digital board visible',
  car_wash: 'exterior of a modern express tunnel car wash with bright signage, cars in queue',
  mobile_home_park: 'well-maintained manufactured housing community with paved roads, mature trees, community clubhouse',
};

// ── Gesture Map ──
export const GESTURE_MAP: Record<SegmentType, string> = {
  hook: 'raises eyebrows slightly and leans toward camera with energy and excitement',
  credibility: 'nods subtly while speaking, hands together, conveying authority and confidence',
  context: 'gestures with one hand, pointing toward the environment behind as if showing it off',
  cta: 'smiles warmly and gestures toward camera as if inviting the viewer',
};

// ── Background Motion Map ──
export const BACKGROUND_MOTION_MAP: Record<InvestmentType, string> = {
  rv_park: 'wind rustling through oak trees, an RV visible behind, light campfire smoke in distance',
  luxury_home: 'city lights twinkling in skyline, curtains moving in breeze on rooftop',
  lakefront: 'sunlight sparkling on lake water, pontoon boat slowly crossing, pine trees swaying',
  multifamily: 'pool water gently rippling, garden sprinklers misting, residents walking in background',
  self_storage: 'cars arriving and parking, clouds drifting across blue sky, clean facility',
  land_development: 'tall grass waving in wind, bulldozer moving in far background, clouds drifting',
  short_term_rental: 'palm trees swaying, ocean waves in distance, seagulls flying overhead',
  general_fund: 'pedestrians walking, digital stock ticker scrolling on building, traffic passing',
  car_wash: 'cars moving through the tunnel wash, water spraying, bright sunlight reflecting',
  mobile_home_park: 'kids riding bikes on paved road, sprinklers on lawns, birds in trees',
};

// ── Ambient Audio Map ──
export const AMBIENT_AUDIO_MAP: Record<InvestmentType, string> = {
  rv_park: 'birds chirping, distant campfire crackling, light wind',
  luxury_home: 'city ambiance, distant traffic hum, wind on rooftop',
  lakefront: 'water lapping, boat motor in distance, birds',
  multifamily: 'pool water, garden sounds, distant conversations',
  self_storage: 'light traffic, birds, facility door closing',
  land_development: 'wind, distant construction, birds',
  short_term_rental: 'ocean waves, seagulls, tropical breeze',
  general_fund: 'city traffic, distant conversations, building sounds',
  car_wash: 'water spraying, car engines, bright ambient sounds',
  mobile_home_park: 'birds, distant lawn mower, children playing',
};

// ── Hair description ──
const HAIR_DESC: Record<string, string> = {
  blonde: 'blonde hair',
  brunette: 'brunette hair',
  auburn: 'auburn hair',
  dark: 'dark hair',
  light_brown: 'light brown hair',
};

// ── Investment type labels ──
export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  rv_park: 'RV Park',
  luxury_home: 'Luxury Home Build',
  lakefront: 'Lakefront / Waterfront',
  multifamily: 'Multifamily Apartments',
  self_storage: 'Self-Storage',
  land_development: 'Land Development',
  short_term_rental: 'Short-Term Rental / Airbnb',
  car_wash: 'Car Wash',
  mobile_home_park: 'Mobile Home Park',
  general_fund: 'General Fund / Diversified',
};

// ── CTA labels ──
export const CTA_LABELS: Record<string, string> = {
  click_link: 'Click link below',
  comment_invest: 'Comment INVEST',
  tap_learn_more: 'Tap Learn More',
  custom: 'Custom',
};

// ── Build script generation prompt ──
export function buildScriptPrompt(deal: DealInput): string {
  return `You are a direct-response copywriter specializing in investment video ads. Write a 60-120 word script for a vertical video ad (TikTok/Reels/Shorts style) promoting this investment:

Investment Type: ${INVESTMENT_TYPE_LABELS[deal.investmentType]}
Project Name: ${deal.projectName}
Location: ${deal.location}
Key Metric: ${deal.keyMetric}
Minimum Investment: ${deal.minInvestment}
Unique Selling Proposition: ${deal.usp}
CTA: ${deal.ctaType === 'custom' ? deal.customCta : CTA_LABELS[deal.ctaType]}

RULES:
- Split into exactly 4 segments of 15-25 words each
- Segment 1 (HOOK): Open with the most compelling number. Must stop the scroll in 2 seconds.
- Segment 2 (CREDIBILITY): Reference the team's track record or market fundamentals.
- Segment 3 (CONTEXT): Explain the location/asset advantage in plain language.
- Segment 4 (CTA): Tell them exactly what to do. Low friction, not salesy.
- Conversational tone. Short sentences. No sentence longer than 15 words.
- No jargon. No "passive income." Include natural speech patterns.

Return ONLY a JSON object with this exact structure:
{"segments": [{"id": 1, "text": "...", "type": "hook"}, {"id": 2, "text": "...", "type": "credibility"}, {"id": 3, "text": "...", "type": "context"}, {"id": 4, "text": "...", "type": "cta"}], "headline": "..."}`;
}

// ── Build avatar image prompt ──
export function buildAvatarPrompt(config: AvatarConfig, deal: DealInput): string {
  const pronoun = config.gender === 'female' ? 'She' : 'He';
  const hairDesc = HAIR_DESC[config.hair] || 'brown hair';
  const environment = config.customEnvironment || ENVIRONMENT_MAP[deal.investmentType];
  const outfit = config.customOutfit || (config.gender === 'female'
    ? 'a tailored blazer over a casual top, business-casual'
    : 'a fitted button-down shirt with rolled sleeves, business-casual');

  return `A hyper-realistic photograph of a ${config.age} year old ${config.gender === 'female' ? 'woman' : 'man'} with ${hairDesc}, wearing ${outfit}. ${pronoun} is standing at ${environment}. Located in ${deal.location}. ${pronoun} is looking directly at the camera with a confident, warm, approachable expression and a slight natural smile. Golden hour lighting. Shot on iPhone 15 Pro Max, portrait mode, shallow depth of field with bokeh background. The composition is a medium close-up selfie angle, slightly below eye level. Photojournalistic UGC style, candid feel, no artificial posing. No text overlays, no watermarks, no logos. 9:16 vertical portrait format.`;
}

// ── Build video prompt per segment ──
export function buildVideoPrompt(
  segmentText: string,
  segmentType: SegmentType,
  gender: AvatarGender,
  deal: DealInput,
): string {
  const pronoun = gender === 'female' ? 'She' : 'He';
  const gesture = GESTURE_MAP[segmentType];
  const bgMotion = BACKGROUND_MOTION_MAP[deal.investmentType];
  const ambient = AMBIENT_AUDIO_MAP[deal.investmentType];

  return `A hyper-realistic video of the ${gender} from the reference image, standing at the same location in ${deal.location}. ${pronoun} is speaking directly to camera in a selfie-style vertical composition, delivering the following dialogue naturally: "${segmentText}" ${pronoun} ${gesture}. The background shows ${bgMotion}. Portrait 9:16 vertical format, photojournalistic documentary style, shot on iPhone, natural lighting, slight camera handheld movement. Audio: clear ${gender} voice speaking the dialogue at a natural conversational pace, with subtle ambient sounds of ${ambient}.`;
}

// ── Caption timing ──
export function generateWordTimestamps(
  segments: { id: number; text: string }[],
  segmentDurations: number[],
) {
  const words: { word: string; start: number; end: number; segmentId: number }[] = [];
  let cumulativeTime = 0;

  segments.forEach((seg, i) => {
    const duration = segmentDurations[i] || 8;
    const segWords = seg.text.split(' ').filter(Boolean);
    const usableDuration = duration * 0.90;
    const startOffset = duration * 0.05;

    const weights = segWords.map(w => Math.max(w.replace(/[^\w]/g, '').length, 2));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let currentTime = cumulativeTime + startOffset;
    segWords.forEach((word, j) => {
      const wordDuration = Math.max(0.2, Math.min((weights[j] / totalWeight) * usableDuration, 0.8));
      words.push({ word, start: currentTime, end: currentTime + wordDuration, segmentId: seg.id });
      currentTime += wordDuration;
    });

    cumulativeTime += duration;
  });

  return words;
}

// ── SRT export ──
export function generateSRT(timestamps: { word: string; start: number; end: number }[]): string {
  return timestamps.map((t, i) => {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600).toString().padStart(2, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = Math.floor(s % 60).toString().padStart(2, '0');
      const ms = Math.round((s % 1) * 1000).toString().padStart(3, '0');
      return `${h}:${m}:${sec},${ms}`;
    };
    return `${i + 1}\n${fmt(t.start)} --> ${fmt(t.end)}\n${t.word}\n`;
  }).join('\n');
}

// ── Caption style configs ──
export const CAPTION_STYLES = {
  black_box: { bg: 'rgba(0,0,0,0.9)', text: '#FFFFFF', label: 'Black Box' },
  teal_box: { bg: '#2BBDB5', text: '#FFFFFF', label: 'Teal Box' },
  yellow_highlight: { bg: '#FFD700', text: '#1A1A1A', label: 'Yellow Highlight' },
};

export const HEADLINE_STYLES = {
  white_banner: { bg: '#FFFFFF', text: '#000000', label: 'White Banner' },
  yellow_banner: { bg: '#FFD700', text: '#000000', label: 'Yellow Banner' },
  no_headline: { bg: 'transparent', text: 'transparent', label: 'No Headline' },
};
