import { useAvatarAd } from '@/context/AvatarAdContext';
import { AvatarAdProgress } from './AvatarAdProgress';
import { DealInputStep } from './steps/DealInputStep';
import { ScriptStep } from './steps/ScriptStep';
import { AvatarStep } from './steps/AvatarStep';
import { VideoStep } from './steps/VideoStep';
import { CompositeStep } from './steps/CompositeStep';

export function AvatarAdWizard() {
  const { state } = useAvatarAd();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Avatar Ad Generator</h1>
        <p className="text-muted-foreground">Create hyper-realistic AI avatar video ads for investment offers</p>
      </div>

      <AvatarAdProgress currentStep={state.step} />

      <div className="min-h-[500px]">
        {state.step === 'deal' && <DealInputStep />}
        {state.step === 'script' && <ScriptStep />}
        {state.step === 'avatar' && <AvatarStep />}
        {state.step === 'video' && <VideoStep />}
        {state.step === 'composite' && <CompositeStep />}
      </div>
    </div>
  );
}
