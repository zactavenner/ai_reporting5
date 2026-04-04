import { useState, useRef, useEffect, useMemo } from 'react';
import { useAvatarAd } from '@/context/AvatarAdContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Layers, Download, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateWordTimestamps, generateSRT, CAPTION_STYLES, HEADLINE_STYLES } from '@/lib/avatar-ad-prompts';
import type { CaptionStyle, HeadlineStyle } from '@/types/avatar-ad';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

export function CompositeStep() {
  const { state, setStep, setCaptionStyle, setHeadlineStyle } = useAvatarAd();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const segments = state.script?.segments || [];
  const headline = state.script?.headline || '';
  const durations = segments.map(() => 8); // 8s per segment

  const timestamps = useMemo(
    () => generateWordTimestamps(segments, durations),
    [segments],
  );

  const totalDuration = durations.reduce((a, b) => a + b, 0);

  // Find active word
  const activeWord = timestamps.find(t => currentTime >= t.start && currentTime < t.end);

  // Track which segment we're in
  useEffect(() => {
    let cumulative = 0;
    for (let i = 0; i < durations.length; i++) {
      cumulative += durations[i];
      if (currentTime < cumulative) {
        setCurrentSegIdx(i);
        break;
      }
    }
  }, [currentTime]);

  // Playback timer (simulated)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.05;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);

  // Sync actual video element
  const currentVideoUrl = state.videoSegments[currentSegIdx]?.videoUrl;

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      let offset = 0;
      for (let i = 0; i < currentSegIdx; i++) offset += durations[i];
      setCurrentTime(offset + videoRef.current.currentTime);
    }
  };

  const capStyle = CAPTION_STYLES[state.captionStyle];
  const headStyle = HEADLINE_STYLES[state.headlineStyle];

  const handleExport = async () => {
    try {
      const zip = new JSZip();
      const dateStr = new Date().toISOString().slice(0, 10);

      // Add each video segment
      for (const vs of state.videoSegments) {
        if (vs.videoUrl) {
          try {
            const resp = await fetch(vs.videoUrl);
            const blob = await resp.blob();
            zip.file(`segment_${vs.segmentId}.mp4`, blob);
          } catch {}
        }
      }

      // SRT file
      const srt = generateSRT(timestamps);
      zip.file('captions.srt', srt);

      // Headline
      zip.file('headline.txt', headline);

      // Manifest
      const manifest = [
        'AI Avatar Ad Export',
        `Date: ${dateStr}`,
        `Project: ${state.deal.projectName || 'Untitled'}`,
        `Segments: ${segments.length}`,
        `Total Duration: ${totalDuration}s`,
        '',
        'Files:',
        ...state.videoSegments.map(vs => `segment_${vs.segmentId}.mp4 - ${segments.find(s => s.id === vs.segmentId)?.type || 'unknown'}`),
        'captions.srt - Word-by-word captions',
        'headline.txt - Banner text',
      ].join('\n');
      zip.file('manifest.txt', manifest);

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `avatar-ad_${state.deal.projectName?.replace(/\s+/g, '-') || 'export'}_${dateStr}.zip`);
      toast.success('Export complete!');
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Step 5: Captions & Final Output
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Preview */}
          <div className="flex justify-center">
            <div className="w-[280px] aspect-[9/16] rounded-[2rem] border-4 border-foreground/20 bg-black overflow-hidden relative">
              {/* Video */}
              {currentVideoUrl ? (
                <video
                  ref={videoRef}
                  src={currentVideoUrl}
                  onTimeUpdate={handleVideoTimeUpdate}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <div className="w-full h-full bg-muted/10" />
              )}

              {/* Headline banner */}
              {state.headlineStyle !== 'no_headline' && (
                <div
                  className="absolute top-0 left-0 right-0 px-4 py-3 text-center font-bold text-sm"
                  style={{ backgroundColor: headStyle.bg, color: headStyle.text }}
                >
                  {headline}
                </div>
              )}

              {/* Caption overlay */}
              {activeWord && (
                <div className="absolute left-4 right-4" style={{ top: '62%' }}>
                  <div
                    className="inline-block px-3 py-1.5 rounded-lg font-bold text-lg"
                    style={{ backgroundColor: capStyle.bg, color: capStyle.text }}
                  >
                    {activeWord.word}
                  </div>
                </div>
              )}

              {/* Play button overlay */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
              >
                {!isPlaying && <Play className="h-12 w-12 text-white/80" />}
              </button>
            </div>
          </div>

          {/* Right: Options */}
          <div className="space-y-5">
            {/* Caption Style */}
            <div className="space-y-2">
              <Label>Caption Style</Label>
              <div className="flex gap-2">
                {(Object.entries(CAPTION_STYLES) as [CaptionStyle, typeof capStyle][]).map(([key, style]) => (
                  <button
                    key={key}
                    onClick={() => setCaptionStyle(key)}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                      state.captionStyle === key ? 'border-primary' : 'border-transparent',
                    )}
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Headline Style */}
            <div className="space-y-2">
              <Label>Headline Style</Label>
              <div className="flex gap-2">
                {(Object.entries(HEADLINE_STYLES) as [HeadlineStyle, typeof headStyle][]).map(([key, style]) => (
                  <button
                    key={key}
                    onClick={() => setHeadlineStyle(key)}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                      state.headlineStyle === key ? 'border-primary' : 'border-transparent',
                      key === 'no_headline' && 'border-dashed border-muted-foreground/30',
                    )}
                    style={{
                      backgroundColor: key === 'no_headline' ? 'transparent' : style.bg,
                      color: key === 'no_headline' ? undefined : style.text,
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback progress */}
            <div className="space-y-1">
              <Label>Preview Timeline</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.floor(currentTime)}s / {totalDuration}s
                </span>
              </div>
            </div>

            {/* Segment list */}
            <div className="space-y-1.5">
              <Label>Segments</Label>
              {segments.map((seg, i) => (
                <div
                  key={seg.id}
                  className={cn(
                    'text-xs px-3 py-2 rounded border transition-all',
                    currentSegIdx === i ? 'border-primary bg-primary/5' : 'border-transparent',
                  )}
                >
                  <span className="font-medium">{seg.type.toUpperCase()}</span>: {seg.text}
                </div>
              ))}
            </div>

            {/* Export */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleExport} className="gap-2 flex-1">
                <Download className="h-4 w-4" /> Download Segments + SRT
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={() => setStep('video')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
