import { useState } from 'react';
import { useBatchVideo } from '@/hooks/useBatchVideo';
import { useClients, useClient } from '@/hooks/useClients';
import { StepIndicator } from './StepIndicator';
import { ScriptSelectionStep } from './steps/ScriptSelectionStep';
import { VisualSelectionStep } from './steps/VisualSelectionStep';
import { SceneGenerationStep } from './steps/SceneGenerationStep';
import { VideoGenerationStep } from './steps/VideoGenerationStep';
import { GenerationQueuePanel } from './GenerationQueuePanel';
import { VideoApprovalDialog } from './VideoApprovalDialog';
import type { VideoAdType, VideoPlatform, VoiceTone, BackgroundStyle, VisualQuality, BatchVideoScene } from '@/types/batch-video';
import { Button } from '@/components/ui/button';
import { Download, Loader2, ListVideo } from 'lucide-react';
import { toast } from 'sonner';
import { fetchVideoAsBlob } from '@/lib/video-proxy';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface BatchVideoWorkflowProps {
  projectId?: string;
  clientId?: string;
}

export function BatchVideoWorkflow({ projectId: propProjectId, clientId: propClientId }: BatchVideoWorkflowProps = {}) {
  const {
    state, setStep, updateConfig, segmentScript, initializeScenes,
    updateScene, updateSegment, addScene, deleteScene, duplicateScene, reorderScene, reset,
  } = useBatchVideo();

  const [showQueue, setShowQueue] = useState(false);
  const [approvalScene, setApprovalScene] = useState<BatchVideoScene | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Get client data for brand context
  const clientId = state.config.clientId || propClientId || '';
  const { data: client } = useClient(clientId);

  const handleScriptComplete = async (
    scriptContent: string, projectId: string, scriptId: string, clientId: string,
    offerDescription?: string, avatarDescription?: string,
    adType?: VideoAdType, platform?: VideoPlatform,
  ) => {
    const finalProjectId = projectId || propProjectId || '';
    const finalClientId = clientId || propClientId || '';
    const platformRatio = platform === 'tiktok-reels' ? '9:16' as const : platform === 'square' ? '1:1' as const : '16:9' as const;
    
    // Wire brand guide context into config
    const brandOffer = offerDescription || client?.offer_description || client?.description;
    
    updateConfig({
      projectId: finalProjectId, scriptId, scriptContent, clientId: finalClientId,
      offerDescription: brandOffer, adType, platform, aspectRatio: platformRatio,
      brandColors: client?.brand_colors || [],
      brandFonts: client?.brand_fonts || [],
    });
    const charDesc = avatarDescription || state.config.avatarDescription;
    if (scriptContent.trim().length > 0) {
      await segmentScript(scriptContent, charDesc, brandOffer);
    }
    setStep('visual');
  };

  const handleVisualComplete = (
    visualType: 'avatar' | 'broll' | 'mixed',
    aspectRatio: '16:9' | '9:16',
    avatarId?: string, avatarImageUrl?: string, avatarDescription?: string,
    voiceTone?: VoiceTone, speakingPace?: number,
    backgroundStyle?: BackgroundStyle, visualQuality?: VisualQuality,
    firstFrameImageUrl?: string,
  ) => {
    updateConfig({ visualType, aspectRatio, avatarId, avatarImageUrl, avatarDescription, voiceTone, speakingPace, backgroundStyle, visualQuality, firstFrameImageUrl });
    initializeScenes(visualType, avatarId, avatarImageUrl, firstFrameImageUrl);
    setStep('scenes');
  };

  const handleBack = () => {
    const steps = ['script', 'visual', 'scenes', 'generate'] as const;
    const idx = steps.indexOf(state.step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  // Video approval handlers
  const handleVideoComplete = (scene: BatchVideoScene) => {
    setApprovalScene(scene);
  };

  const handleApprove = (sceneId: string) => {
    // Already saved via saveAsset in generation step
    setApprovalScene(null);
    toast.success('Video approved & saved');
  };

  const handleRegenerate = (sceneId: string) => {
    setApprovalScene(null);
    // Reset scene status to trigger regeneration
    updateScene(sceneId, { status: 'image_completed', videoUrl: undefined, operationId: undefined, error: undefined });
  };

  // Batch export
  const handleExportAll = async () => {
    const completed = state.scenes.filter(s => s.status === 'video_completed' && s.videoUrl);
    if (!completed.length) { toast.error('No completed videos to export'); return; }

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const clientName = client?.name?.replace(/\s+/g, '-') || 'batch';
      const dateStr = new Date().toISOString().slice(0, 10);
      const ratio = state.config.aspectRatio || '16:9';

      // Build manifest
      const manifestLines = ['Batch Video Export Manifest', `Date: ${dateStr}`, `Client: ${client?.name || 'Unknown'}`, `Format: ${ratio}`, `Total Scenes: ${completed.length}`, '', 'Files:', '---'];

      for (const scene of completed) {
        const fileName = `${clientName}_scene-${scene.order}_${ratio.replace(':', 'x')}_${dateStr}.mp4`;
        try {
          const blob = await fetchVideoAsBlob(scene.videoUrl!);
          zip.file(fileName, blob);
          manifestLines.push(`${fileName} | Scene ${scene.order} | ${scene.segment.duration}s | ${dateStr}`);
        } catch (e) {
          console.warn('Failed to fetch video for zip:', e);
          manifestLines.push(`${fileName} | FAILED TO EXPORT`);
        }
      }

      zip.file('manifest.txt', manifestLines.join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${clientName}_batch-videos_${dateStr}.zip`);
      toast.success('Export complete!');
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const completedVideos = state.scenes.filter(s => s.status === 'video_completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Batch Video Generation</h1>
          <p className="text-muted-foreground">Create multiple video scenes from a single script</p>
        </div>
        <div className="flex items-center gap-2">
          {completedVideos > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportAll} disabled={isExporting} className="gap-2">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export All ({completedVideos})
            </Button>
          )}
          {state.scenes.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowQueue(!showQueue)} className="gap-2">
              <ListVideo className="h-4 w-4" />
              Queue
            </Button>
          )}
        </div>
      </div>

      {/* Brand context indicator */}
      {client && state.step !== 'script' && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{client.name}</span>
          {client.brand_colors?.length > 0 && (
            <div className="flex items-center gap-1">
              {client.brand_colors.slice(0, 3).map((c, i) => (
                <div key={i} className="h-3 w-3 rounded-full border" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          {client.offer_description && <span className="truncate max-w-xs">{client.offer_description}</span>}
        </div>
      )}

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <StepIndicator currentStep={state.step} onStepClick={setStep} />

          <div className="min-h-[500px] mt-6">
            {state.step === 'script' && (
              <ScriptSelectionStep onComplete={handleScriptComplete} isProcessing={state.isProcessing} />
            )}
            {state.step === 'visual' && (
              <VisualSelectionStep
                onComplete={handleVisualComplete}
                onBack={handleBack}
                defaultAspectRatio={state.config.aspectRatio}
                scriptContent={state.config.scriptContent}
                clientId={state.config.clientId}
                projectId={state.config.projectId}
                offerDescription={state.config.offerDescription}
              />
            )}
            {state.step === 'scenes' && (
              <SceneGenerationStep
                scenes={state.scenes} segments={state.segments} config={state.config}
                onUpdateSegment={updateSegment} onUpdateScene={updateScene}
                onAddScene={addScene} onDeleteScene={deleteScene} onDuplicateScene={duplicateScene}
                onReorderScene={reorderScene} onComplete={() => setStep('generate')} onBack={handleBack}
              />
            )}
            {state.step === 'generate' && (
              <VideoGenerationStep
                scenes={state.scenes} config={state.config}
                onUpdateScene={updateScene} onUpdateSegment={updateSegment}
                onDeleteScene={deleteScene} onDuplicateScene={duplicateScene}
                onReorderScene={reorderScene} onBack={handleBack} onReset={reset}
                onVideoComplete={handleVideoComplete}
                brandContext={client ? {
                  colors: client.brand_colors || [],
                  fonts: client.brand_fonts || [],
                  offer: client.offer_description || client.description || '',
                } : undefined}
              />
            )}
          </div>
        </div>

        {/* Generation Queue Sidebar */}
        {showQueue && (
          <GenerationQueuePanel scenes={state.scenes} onClose={() => setShowQueue(false)} />
        )}
      </div>

      {/* Video Approval Dialog */}
      {approvalScene && approvalScene.videoUrl && (
        <VideoApprovalDialog
          open={!!approvalScene}
          onOpenChange={() => setApprovalScene(null)}
          scene={approvalScene}
          aspectRatio={state.config.aspectRatio || '16:9'}
          onApprove={handleApprove}
          onRegenerate={handleRegenerate}
          onEditRetry={(sceneId) => { setApprovalScene(null); setStep('scenes'); }}
        />
      )}
    </div>
  );
}
