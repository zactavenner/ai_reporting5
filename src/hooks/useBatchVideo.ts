import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  BatchVideoStep, 
  ScriptSegment, 
  BatchVideoScene, 
  BatchVideoConfig,
  BatchVideoState 
} from '@/types/batch-video';

export function useBatchVideo() {
  const [state, setState] = useState<BatchVideoState>({
    step: 'script',
    config: {},
    segments: [],
    scenes: [],
    isProcessing: false,
  });

  const setStep = useCallback((step: BatchVideoStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const updateConfig = useCallback((updates: Partial<BatchVideoConfig>) => {
    setState(prev => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  // Segment script into 8-second chunks with character/offer context
  const segmentScript = useCallback(async (scriptContent: string, characterDescription?: string, offerDescription?: string) => {
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const { data, error } = await supabase.functions.invoke('breakdown-script', {
        body: { 
          script: scriptContent,
          segmentDuration: 8,
          characterDescription,
          offerDescription,
        },
      });

      if (error) throw error;

      const segments: ScriptSegment[] = (data.scenes || []).map((scene: any, index: number) => ({
        id: `segment-${index + 1}`,
        order: index + 1,
        text: scene.lipSyncLine || scene.text || '',
        duration: 8,
        imagePrompt: scene.sceneEnvironment || scene.prompt || '',
        sceneDescription: scene.action || scene.description || '',
        cameraAngle: scene.cameraAngle || 'medium',
      }));

      setState(prev => ({
        ...prev,
        segments,
        isProcessing: false,
      }));

      return segments;
    } catch (error) {
      console.error('Failed to segment script:', error);
      toast.error('Failed to segment script');
      setState(prev => ({ ...prev, isProcessing: false }));
      return [];
    }
  }, []);

  // Initialize scenes from segments
  const initializeScenes = useCallback((visualType: 'avatar' | 'broll' | 'mixed', avatarId?: string, avatarImageUrl?: string, firstFrameImageUrl?: string) => {
    setState(prev => {
      const scenes: BatchVideoScene[] = prev.segments.map((segment, i) => ({
        id: `scene-${segment.id}`,
        order: segment.order,
        segment,
        visualType,
        avatarId,
        avatarImageUrl,
        status: i === 0 && firstFrameImageUrl ? 'image_completed' : 'pending',
        generatedImageUrl: i === 0 && firstFrameImageUrl ? firstFrameImageUrl : undefined,
        // For mixed mode, default to avatar if available
        useAvatar: visualType === 'mixed' ? !!avatarId : visualType === 'avatar',
      }));

      return {
        ...prev,
        scenes,
        config: {
          ...prev.config,
          visualType,
          avatarId,
          avatarImageUrl,
          firstFrameImageUrl,
        },
      };
    });
  }, []);

  // Update a single scene
  const updateScene = useCallback((sceneId: string, updates: Partial<BatchVideoScene>) => {
    setState(prev => ({
      ...prev,
      scenes: prev.scenes.map(scene =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      ),
    }));
  }, []);

  // Update segment (image prompt / scene description)
  const updateSegment = useCallback((segmentId: string, updates: Partial<ScriptSegment>) => {
    setState(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === segmentId ? { ...seg, ...updates } : seg
      ),
      scenes: prev.scenes.map(scene =>
        scene.segment.id === segmentId
          ? { ...scene, segment: { ...scene.segment, ...updates } }
          : scene
      ),
    }));
  }, []);

  // Add a new empty scene
  const addScene = useCallback(() => {
    setState(prev => {
      const nextOrder = prev.scenes.length > 0 ? Math.max(...prev.scenes.map(s => s.order)) + 1 : 1;
      const newSegment: ScriptSegment = {
        id: `segment-new-${Date.now()}`,
        order: nextOrder,
        text: '',
        duration: 8,
        imagePrompt: '',
        sceneDescription: '',
        cameraAngle: 'medium',
        backgroundStyle: 'animated-gradient',
      };
      const newScene: BatchVideoScene = {
        id: `scene-new-${Date.now()}`,
        order: nextOrder,
        segment: newSegment,
        visualType: prev.config.visualType || 'broll',
        avatarId: prev.config.avatarId,
        avatarImageUrl: prev.config.avatarImageUrl,
        status: 'pending',
        useAvatar: prev.config.visualType === 'avatar' || prev.config.visualType === 'mixed',
      };
      return { ...prev, scenes: [...prev.scenes, newScene] };
    });
  }, []);

  // Delete a scene
  const deleteScene = useCallback((sceneId: string) => {
    setState(prev => ({
      ...prev,
      scenes: prev.scenes.filter(scene => scene.id !== sceneId),
    }));
  }, []);

  // Duplicate a scene
  const duplicateScene = useCallback((sceneId: string) => {
    setState(prev => {
      const original = prev.scenes.find(s => s.id === sceneId);
      if (!original) return prev;
      const newId = `scene-dup-${Date.now()}`;
      const duplicate: BatchVideoScene = {
        ...original,
        id: newId,
        order: original.order + 0.5, // will be normalized
        status: 'pending',
        generatedImageUrl: undefined,
        videoUrl: undefined,
        operationId: undefined,
        error: undefined,
        segment: { ...original.segment, id: `segment-dup-${Date.now()}` },
      };
      const newScenes = [...prev.scenes, duplicate]
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, scenes: newScenes };
    });
  }, []);

  // Reorder scenes (move up/down)
  const reorderScene = useCallback((sceneId: string, direction: 'up' | 'down') => {
    setState(prev => {
      const idx = prev.scenes.findIndex(s => s.id === sceneId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.scenes.length) return prev;
      const newScenes = [...prev.scenes];
      [newScenes[idx], newScenes[swapIdx]] = [newScenes[swapIdx], newScenes[idx]];
      return {
        ...prev,
        scenes: newScenes.map((s, i) => ({ ...s, order: i + 1 })),
      };
    });
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setState({
      step: 'script',
      config: {},
      segments: [],
      scenes: [],
      isProcessing: false,
    });
  }, []);

  return {
    state,
    setStep,
    updateConfig,
    segmentScript,
    initializeScenes,
    updateScene,
    updateSegment,
    addScene,
    deleteScene,
    duplicateScene,
    reorderScene,
    reset,
  };
}
