// AI Avatar Ad Generator Types

export type AvatarAdStep = 'settings' | 'deal' | 'script' | 'avatar' | 'video' | 'composite';

export type InvestmentType =
  | 'rv_park' | 'luxury_home' | 'lakefront' | 'multifamily'
  | 'self_storage' | 'land_development' | 'short_term_rental'
  | 'car_wash' | 'mobile_home_park' | 'general_fund';

export type TargetInvestor = 'accredited' | 'sophisticated' | 'all';
export type CTAType = 'click_link' | 'comment_invest' | 'tap_learn_more' | 'custom';
export type AvatarGender = 'female' | 'male';
export type AvatarAge = '25-30' | '30-35' | '35-40' | '40-50';
export type AvatarHair = 'blonde' | 'brunette' | 'auburn' | 'dark' | 'light_brown';
export type CaptionStyle = 'black_box' | 'teal_box' | 'yellow_highlight';
export type HeadlineStyle = 'white_banner' | 'yellow_banner' | 'no_headline';
export type SegmentType = 'hook' | 'credibility' | 'context' | 'cta';

export interface DealInput {
  investmentType: InvestmentType;
  projectName: string;
  location: string;
  keyMetric: string;
  minInvestment: string;
  targetInvestor: TargetInvestor;
  usp: string;
  ctaType: CTAType;
  customCta?: string;
  customScript?: string;
  // New: link to client offer
  clientId?: string;
  offerId?: string;
}

export interface ScriptSegment {
  id: number;
  text: string;
  type: SegmentType;
}

export interface GeneratedScript {
  segments: ScriptSegment[];
  headline: string;
}

export interface AvatarConfig {
  gender: AvatarGender;
  age: AvatarAge;
  hair: AvatarHair;
  customOutfit?: string;
  customEnvironment?: string;
}

export interface GeneratedAvatar {
  imageUrl: string;
  imageBase64?: string;
  prompt: string;
}

export interface SelectedAvatar {
  id: string;
  name: string;
  imageUrl: string;
  isStock: boolean;
}

export interface VideoSegment {
  segmentId: number;
  status: 'queued' | 'generating' | 'polling' | 'done' | 'failed';
  operationId?: string;
  videoUrl?: string;
  error?: string;
  progress?: number;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  segmentId: number;
}

export interface AvatarAdState {
  step: AvatarAdStep;
  deal: Partial<DealInput>;
  script: GeneratedScript | null;
  avatarConfig: AvatarConfig;
  avatar: GeneratedAvatar | null;
  selectedExistingAvatar: SelectedAvatar | null;
  videoSegments: VideoSegment[];
  captionStyle: CaptionStyle;
  headlineStyle: HeadlineStyle;
  isProcessing: boolean;
}
