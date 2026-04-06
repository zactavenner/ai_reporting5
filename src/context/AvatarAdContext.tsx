import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  AvatarAdState, AvatarAdStep, DealInput, GeneratedScript,
  AvatarConfig, GeneratedAvatar, SelectedAvatar, VideoSegment, CaptionStyle, HeadlineStyle,
} from '@/types/avatar-ad';

const DEFAULT_STATE: AvatarAdState = {
  step: 'deal',
  deal: {
    investmentType: 'land_development',
    projectName: '',
    location: '',
    keyMetric: '',
    minInvestment: '',
    targetInvestor: 'accredited',
    ctaType: 'click_link',
    usp: '',
  },
  script: null,
  avatarConfig: { gender: 'female', age: '25-30', hair: 'blonde' },
  avatar: null,
  selectedExistingAvatar: null,
  videoSegments: [],
  captionStyle: 'black_box',
  headlineStyle: 'white_banner',
  isProcessing: false,
};

interface AvatarAdContextType {
  state: AvatarAdState;
  setStep: (step: AvatarAdStep) => void;
  updateDeal: (updates: Partial<DealInput>) => void;
  setScript: (script: GeneratedScript) => void;
  updateAvatarConfig: (updates: Partial<AvatarConfig>) => void;
  setAvatar: (avatar: GeneratedAvatar) => void;
  setSelectedExistingAvatar: (avatar: SelectedAvatar | null) => void;
  setVideoSegments: (segments: VideoSegment[]) => void;
  updateVideoSegment: (segmentId: number, updates: Partial<VideoSegment>) => void;
  setCaptionStyle: (style: CaptionStyle) => void;
  setHeadlineStyle: (style: HeadlineStyle) => void;
  setProcessing: (v: boolean) => void;
  reset: () => void;
}

const AvatarAdContext = createContext<AvatarAdContextType | null>(null);

export function AvatarAdProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AvatarAdState>(DEFAULT_STATE);

  const setStep = useCallback((step: AvatarAdStep) => setState(p => ({ ...p, step })), []);
  const updateDeal = useCallback((updates: Partial<DealInput>) =>
    setState(p => ({ ...p, deal: { ...p.deal, ...updates } })), []);
  const setScript = useCallback((script: GeneratedScript) => setState(p => ({ ...p, script })), []);
  const updateAvatarConfig = useCallback((updates: Partial<AvatarConfig>) =>
    setState(p => ({ ...p, avatarConfig: { ...p.avatarConfig, ...updates } })), []);
  const setAvatar = useCallback((avatar: GeneratedAvatar) => setState(p => ({ ...p, avatar })), []);
  const setSelectedExistingAvatar = useCallback((selectedExistingAvatar: SelectedAvatar | null) =>
    setState(p => ({ ...p, selectedExistingAvatar })), []);
  const setVideoSegments = useCallback((videoSegments: VideoSegment[]) =>
    setState(p => ({ ...p, videoSegments })), []);
  const updateVideoSegment = useCallback((segmentId: number, updates: Partial<VideoSegment>) =>
    setState(p => ({
      ...p,
      videoSegments: p.videoSegments.map(v => v.segmentId === segmentId ? { ...v, ...updates } : v),
    })), []);
  const setCaptionStyle = useCallback((captionStyle: CaptionStyle) => setState(p => ({ ...p, captionStyle })), []);
  const setHeadlineStyle = useCallback((headlineStyle: HeadlineStyle) => setState(p => ({ ...p, headlineStyle })), []);
  const setProcessing = useCallback((isProcessing: boolean) => setState(p => ({ ...p, isProcessing })), []);
  const reset = useCallback(() => setState(DEFAULT_STATE), []);

  return (
    <AvatarAdContext.Provider value={{
      state, setStep, updateDeal, setScript, updateAvatarConfig,
      setAvatar, setSelectedExistingAvatar, setVideoSegments, updateVideoSegment,
      setCaptionStyle, setHeadlineStyle, setProcessing, reset,
    }}>
      {children}
    </AvatarAdContext.Provider>
  );
}

export function useAvatarAd() {
  const ctx = useContext(AvatarAdContext);
  if (!ctx) throw new Error('useAvatarAd must be used within AvatarAdProvider');
  return ctx;
}
