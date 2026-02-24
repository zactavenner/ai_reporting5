import { useState, useRef } from 'react';
import { Creative } from '@/hooks/useCreatives';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ThumbsUp, Share2, Play, Volume2, Pause, X, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAspectFitClasses } from '@/lib/aspectRatioUtils';

interface PlatformAdPreviewProps {
  creative: Creative;
  platform: string;
  clientName: string;
}

export function PlatformAdPreview({ creative, platform, clientName }: PlatformAdPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  const toggleVideo = (ref: React.RefObject<HTMLVideoElement>) => {
    if (ref.current) {
      if (ref.current.paused) {
        ref.current.play();
        setIsPlaying(true);
      } else {
        ref.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Aspect-ratio-aware media renderer
  const renderMediaBlock = (ref: React.RefObject<HTMLVideoElement>, containerAspect: string) => {
    const { objectFit, bgClass } = getAspectFitClasses(containerAspect, creative.aspect_ratio);

    if (creative.type === 'image' && creative.file_url) {
      return (
        <div className={`relative w-full h-full ${bgClass}`}>
          <img 
            src={creative.file_url} 
            alt={creative.title}
            className={`w-full h-full ${objectFit}`}
          />
        </div>
      );
    }
    if (creative.type === 'video' && creative.file_url) {
      return (
        <div className={`relative w-full h-full group cursor-pointer ${bgClass}`} onClick={() => toggleVideo(ref)}>
          <video 
            ref={ref}
            src={creative.file_url}
            className={`w-full h-full ${objectFit}`}
            loop
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
            <div className="bg-black/50 rounded-full p-4">
              {isPlaying ? (
                <Pause className="h-8 w-8 text-white fill-white" />
              ) : (
                <Play className="h-8 w-8 text-white fill-white" />
              )}
            </div>
          </div>
        </div>
      );
    }
    // Text/copy fallback
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{creative.headline}</p>
          <p className="text-sm text-muted-foreground mt-2">{creative.body_copy}</p>
        </div>
      </div>
    );
  };

  const renderMetaPreview = () => (
    <div className="space-y-6">
      {/* Facebook Preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium">Facebook Feed</p>
        <div className="bg-background rounded-lg border overflow-hidden max-w-sm mx-auto">
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                {clientName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-semibold text-sm">{clientName}</p>
              <p className="text-xs text-muted-foreground">Sponsored</p>
            </div>
            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Primary Text */}
          {creative.body_copy && (
            <div className="px-3 py-2">
              <p className="text-sm">{creative.body_copy}</p>
            </div>
          )}

          {/* Media - 4:5 for feed */}
          <div className="aspect-[4/5] bg-muted relative">
            {renderMediaBlock(videoRef1, '4:5')}
          </div>

          {/* CTA Bar */}
          <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{clientName.toLowerCase()}.com</p>
              {creative.headline && <p className="text-sm font-semibold">{creative.headline}</p>}
            </div>
            {creative.cta_text && (
              <button className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold rounded">
                {creative.cta_text}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-2 border-t">
            <div className="flex items-center gap-4">
              <ThumbsUp className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Share2 className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Instagram Preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium">Instagram Feed</p>
        <div className="bg-background rounded-lg border overflow-hidden max-w-sm mx-auto">
          {/* Header */}
          <div className="flex items-center gap-2 p-3">
            <Avatar className="h-8 w-8 ring-2 ring-pink-500 ring-offset-2">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-bold">
                {clientName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-semibold text-sm">{clientName.toLowerCase().replace(/\s/g, '')}</p>
              <p className="text-xs text-muted-foreground">Sponsored</p>
            </div>
            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Media - 4:5 for feed */}
          <div className="aspect-[4/5] bg-muted relative">
            {renderMediaBlock(videoRef2, '4:5')}
          </div>

          {/* CTA */}
          {creative.cta_text && (
            <div className="px-3 py-2 border-t bg-muted/30">
              <button className="w-full bg-primary text-primary-foreground py-2 text-sm font-semibold rounded">
                {creative.cta_text}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-4">
              <Heart className="h-6 w-6" />
              <MessageCircle className="h-6 w-6" />
              <Send className="h-6 w-6" />
            </div>
            <Bookmark className="h-6 w-6" />
          </div>

          {/* Caption */}
          <div className="px-3 pb-3">
            <p className="text-sm">
              <span className="font-semibold">{clientName.toLowerCase().replace(/\s/g, '')}</span>
              {' '}{creative.body_copy?.substring(0, 100)}
              {creative.body_copy && creative.body_copy.length > 100 && '... more'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInstagramPreview = () => (
    <div className="bg-background rounded-lg border overflow-hidden max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <Avatar className="h-8 w-8 ring-2 ring-pink-500 ring-offset-2">
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-bold">
            {clientName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-semibold text-sm">{clientName.toLowerCase().replace(/\s/g, '')}</p>
          <p className="text-xs text-muted-foreground">Sponsored</p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Media - 4:5 for feed */}
      <div className="aspect-[4/5] bg-muted relative">
        {renderMediaBlock(videoRef1, '4:5')}
      </div>

      {/* CTA */}
      {creative.cta_text && (
        <div className="px-3 py-2 border-t bg-muted/30">
          <button className="w-full bg-primary text-primary-foreground py-2 text-sm font-semibold rounded">
            {creative.cta_text}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-4">
          <Heart className="h-6 w-6" />
          <MessageCircle className="h-6 w-6" />
          <Send className="h-6 w-6" />
        </div>
        <Bookmark className="h-6 w-6" />
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm">
          <span className="font-semibold">{clientName.toLowerCase().replace(/\s/g, '')}</span>
          {' '}{creative.body_copy?.substring(0, 100)}
          {creative.body_copy && creative.body_copy.length > 100 && '... more'}
        </p>
      </div>
    </div>
  );

  const renderTikTokPreview = () => (
    <div className="bg-black rounded-lg overflow-hidden max-w-xs mx-auto aspect-[9/16] relative">
      {/* Media Background */}
      <div className="absolute inset-0">
        {renderMediaBlock(videoRef1, '9:16')}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />

      {/* Right Side Actions */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center">
          <div className="bg-white/20 rounded-full p-2">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs mt-1">12.3K</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-white/20 rounded-full p-2">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs mt-1">234</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-white/20 rounded-full p-2">
            <Bookmark className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs mt-1">1.2K</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-white/20 rounded-full p-2">
            <Share2 className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs mt-1">Share</span>
        </div>
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-4 left-3 right-16">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-sm">@{clientName.toLowerCase().replace(/\s/g, '')}</span>
          <Badge className="bg-cyan-500 text-white text-[10px] px-1.5 py-0">Sponsored</Badge>
        </div>
        <p className="text-white text-sm line-clamp-2">{creative.body_copy}</p>
        {creative.cta_text && (
          <button className="mt-3 bg-pink-500 text-white px-6 py-2 rounded-full text-sm font-semibold">
            {creative.cta_text}
          </button>
        )}
      </div>
    </div>
  );

  const renderYouTubePreview = () => (
    <div className="bg-background rounded-lg border overflow-hidden max-w-md mx-auto">
      {/* Video Thumbnail */}
      <div className="aspect-video bg-muted relative">
        {renderMediaBlock(videoRef1, '16:9')}
        
        {/* Ad Badge */}
        <div className="absolute top-2 left-2">
          <Badge className="bg-yellow-500 text-black text-xs">Ad</Badge>
        </div>
        
        {/* Duration */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
          0:30
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-red-600 text-white text-xs">
            {clientName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-semibold text-sm line-clamp-2">
            {creative.headline || creative.title}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{clientName}</p>
          <p className="text-xs text-muted-foreground">Ad • Learn more</p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* CTA */}
      {creative.cta_text && (
        <div className="px-3 pb-3">
          <button className="w-full bg-blue-600 text-white py-2 text-sm font-semibold rounded-full">
            {creative.cta_text}
          </button>
        </div>
      )}
    </div>
  );

  const renderGooglePreview = () => (
    <div className="bg-background rounded-lg border overflow-hidden max-w-lg mx-auto">
      {/* Search Result Style */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">Ad</Badge>
          <span className="text-sm text-muted-foreground">• {clientName.toLowerCase()}.com</span>
        </div>
        <h3 className="text-lg font-medium text-blue-600 hover:underline cursor-pointer mb-1">
          {creative.headline || creative.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {creative.body_copy}
        </p>
        
        {/* Sitelinks */}
        <div className="flex flex-wrap gap-2 mt-3">
          {creative.cta_text && (
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">{creative.cta_text}</span>
          )}
          <span className="text-sm text-blue-600 hover:underline cursor-pointer">Learn More</span>
          <span className="text-sm text-blue-600 hover:underline cursor-pointer">Contact Us</span>
        </div>
      </div>

      {/* Display Ad Style */}
      <div className="border-t mt-2 pt-4 px-4 pb-4">
        <p className="text-xs text-muted-foreground mb-2">Display Ad Preview:</p>
        <div className="border rounded-lg overflow-hidden">
          <div className="aspect-[4/1] bg-muted relative flex items-center justify-between px-4">
            {creative.type === 'image' && creative.file_url ? (
              <div className="absolute inset-0">
                <img 
                  src={creative.file_url} 
                  alt={creative.title}
                  className="w-full h-full object-cover opacity-30"
                />
              </div>
            ) : null}
            <div className="relative z-10 flex-1">
              <p className="font-bold">{creative.headline}</p>
              <p className="text-sm text-muted-foreground">{creative.body_copy?.substring(0, 50)}...</p>
            </div>
            <div className="relative z-10 flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-600 text-white text-xs">
                  {clientName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {creative.cta_text && (
                <button className="bg-blue-600 text-white px-3 py-1 text-sm rounded">
                  {creative.cta_text}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  switch (platform) {
    case 'meta':
      return renderMetaPreview();
    case 'tiktok':
      return renderTikTokPreview();
    case 'youtube':
      return renderYouTubePreview();
    case 'google':
      return renderGooglePreview();
    default:
      return renderMetaPreview();
  }
}
